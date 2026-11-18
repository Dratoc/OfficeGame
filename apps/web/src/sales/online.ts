import { SALES_TICK_MS, cloneWorker, moveWorker, type SalesFrame, type SalesInput, type SalesInputBatch, type SalesWorld, type Worker } from '@inbox/shared';
import { SalesArena, type TeamInfo } from './arena';
import { SalesControls } from './input';
import { sfx } from '../office/sfx';

/** How far in the past teammates are drawn, so there are always two server frames to blend. */
const INTERP_DELAY_MS = 120;
const STEPS_PER_SEND = 2;

export interface OnlineSalesOptions {
  matchId: string;
  meId: string;
  team: TeamInfo[];
  startAt: number;
  endAt: number;
  serverNow: () => number;
  send: (batch: SalesInputBatch) => void;
}

function lerpWorker(a: Worker, b: Worker, k: number): Worker {
  if (Math.hypot(b.x - a.x, b.z - a.z) > 3) return b;
  return { ...b, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
}

/**
 * Client side of an online shift. The server decides everything; this class sends inputs,
 * predicts your own walking with the same rules so it feels instant, corrects the prediction
 * with each server frame, and draws teammates slightly in the past, blended between two frames.
 */
export class OnlineSales {
  readonly arena: SalesArena;
  private controls: SalesControls;
  private frames: SalesFrame[] = [];
  private latest: SalesFrame | null = null;
  private me: Worker | null = null;
  private prevMe: Worker | null = null;
  private pending: SalesInput[] = [];
  private outbox: SalesInput[] = [];
  private step = 0;
  private raf = 0;
  private offset = { x: 0, z: 0 };
  private lastBeep = -1;
  private seenTick = -1;

  constructor(container: HTMLElement, private opts: OnlineSalesOptions) {
    this.arena = new SalesArena(container, opts.team);
    this.controls = new SalesControls(container);
    document.addEventListener('visibilitychange', this.onHidden);
    this.raf = requestAnimationFrame(this.frame);
  }

  setClock(startAt: number, endAt: number) {
    this.opts.startAt = startAt;
    this.opts.endAt = endAt;
  }

  onFrame(frame: SalesFrame) {
    if (frame.tick <= this.seenTick && this.seenTick > 0) return;
    this.seenTick = frame.tick;
    this.latest = frame;
    this.frames.push(frame);
    if (this.frames.length > 30) this.frames.shift();
    this.arena.events(frame.events, frame.world);
    this.reconcile(frame);
  }

  private reconcile(frame: SalesFrame) {
    const server = frame.world.workers.find((w) => w.id === this.opts.meId);
    if (!server) return;
    const before = this.me;
    const ack = frame.ack[this.opts.meId] ?? 0;
    this.controls.resumeAfter(ack);
    this.pending = this.pending.filter((i) => i.seq > ack);
    const me = cloneWorker(server);
    for (const input of this.pending) moveWorker(me, input);
    if (before && before.zones === me.zones) {
      const dx = before.x - me.x;
      const dz = before.z - me.z;
      if (Math.hypot(dx, dz) < 2) {
        this.offset.x += dx;
        this.offset.z += dz;
      } else this.offset = { x: 0, z: 0 };
    } else this.offset = { x: 0, z: 0 };
    this.me = me;
  }

  private onHidden = () => {
    // A hidden tab stops sending and the server keeps your last input: stop walking first.
    if (document.visibilityState === 'hidden' && this.me) {
      const stop: SalesInput = { ...this.controls.sample(), mx: 0, mz: 0, act: false, hold: false };
      this.pending.push(stop);
      this.opts.send({ matchId: this.opts.matchId, inputs: [stop] });
    }
  };

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const now = this.opts.serverNow();
    const { startAt, endAt } = this.opts;
    if (now < startAt) {
      const n = Math.ceil((startAt - now) / 1000);
      if (n !== this.lastBeep && n <= 3) {
        this.lastBeep = n;
        this.arena.hud.banner(String(n), 'Abre el local', 0);
        sfx.beep();
      }
    } else if (this.lastBeep > 0) {
      this.lastBeep = 0;
      this.arena.hud.banner('¡A vender!', '', 900);
      sfx.go();
    }

    const over = !!this.latest?.world.over;
    if (now >= startAt && now < endAt && !over) {
      const target = Math.floor((now - startAt) / SALES_TICK_MS);
      if (target - this.step > 5) this.step = target - 5;
      while (this.step < target) {
        this.step++;
        const input = this.controls.sample();
        this.pending.push(input);
        this.outbox.push(input);
        if (this.me) {
          this.prevMe = cloneWorker(this.me);
          moveWorker(this.me, input);
        }
        if (this.outbox.length >= STEPS_PER_SEND) this.flush();
      }
      if (this.pending.length > 90) this.pending.splice(0, this.pending.length - 90);
    }
    const world = this.view(now);
    if (world) this.arena.render(world);
  };

  private flush() {
    if (!this.outbox.length) return;
    this.opts.send({ matchId: this.opts.matchId, inputs: this.outbox });
    this.outbox = [];
  }

  private view(now: number): SalesWorld | null {
    if (!this.latest) return null;
    const renderAt = now - INTERP_DELAY_MS;
    let a = this.frames[0]!;
    let b = this.frames[this.frames.length - 1]!;
    for (let i = this.frames.length - 1; i > 0; i--) {
      if (this.frames[i - 1]!.at <= renderAt) {
        a = this.frames[i - 1]!;
        b = this.frames[i]!;
        break;
      }
    }
    const k = b.at > a.at ? Math.max(0, Math.min(1, (renderAt - a.at) / (b.at - a.at))) : 1;
    this.offset.x *= 0.85;
    this.offset.z *= 0.85;
    const workers = this.latest.world.workers.map((f) => {
      if (f.id === this.opts.meId && this.me) {
        const stepAt = this.opts.startAt + this.step * SALES_TICK_MS;
        const alpha = Math.max(0, Math.min(1, (now - stepAt) / SALES_TICK_MS));
        const shown = this.prevMe ? lerpWorker(this.prevMe, this.me, alpha) : this.me;
        // What you hold and the areas you own always come from the server.
        return { ...f, x: shown.x + this.offset.x, z: shown.z + this.offset.z, h: this.me.h };
      }
      const fa = a.world.workers.find((x) => x.id === f.id);
      const fb = b.world.workers.find((x) => x.id === f.id);
      return fa && fb ? { ...lerpWorker(fa, fb, k), held: f.held, working: f.working, zones: f.zones, active: f.active } : f;
    });
    return { ...this.latest.world, workers };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.controls.dispose();
    this.arena.dispose();
  }
}
