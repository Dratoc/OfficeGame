import { CHAIRS_TICK_MS, cloneKart, stepKart, type ChairsFrame, type ChairsInput, type ChairsInputBatch, type Kart } from '@inbox/shared';
import { ChairsArena, type RacerInfo } from './arena';
import { ChairControls } from './input';
import { lerpKart } from './lerp';
import { sfx } from '../office/sfx';

/** How far in the past rivals are drawn, so there are always two server frames to blend. */
const INTERP_DELAY_MS = 110;
const STEPS_PER_SEND = 2;

export interface OnlineRaceOptions {
  matchId: string;
  meId: string;
  racers: RacerInfo[];
  startAt: number;
  endAt: number;
  serverNow: () => number;
  send: (batch: ChairsInputBatch) => void;
}

/**
 * Client side of an online chair race. The server decides everything; this class sends inputs,
 * predicts your own chair with the same rules so steering feels instant, corrects the prediction
 * with each server frame, and draws rivals slightly in the past, blended between two frames.
 */
export class OnlineChairsRace {
  readonly arena: ChairsArena;
  private controls: ChairControls;
  private frames: ChairsFrame[] = [];
  private latest: ChairsFrame | null = null;
  private me: Kart | null = null;
  private prevMe: Kart | null = null;
  private pending: ChairsInput[] = [];
  private outbox: ChairsInput[] = [];
  private step = 0;
  private raf = 0;
  private offset = { x: 0, z: 0 };
  private lastBeep = -1;
  private ended = false;
  private seenTick = -1;

  constructor(container: HTMLElement, private opts: OnlineRaceOptions) {
    this.arena = new ChairsArena(container, opts.racers);
    this.controls = new ChairControls(container);
    document.addEventListener('visibilitychange', this.onHidden);
    this.raf = requestAnimationFrame(this.frame);
  }

  setClock(startAt: number, endAt: number) {
    this.opts.startAt = startAt;
    this.opts.endAt = endAt;
  }

  onFrame(frame: ChairsFrame) {
    if (frame.tick <= this.seenTick) return;
    this.seenTick = frame.tick;
    this.latest = frame;
    this.frames.push(frame);
    if (this.frames.length > 30) this.frames.shift();
    this.arena.events(frame.events);
    for (const e of frame.events) {
      if (e.type !== 'finish') continue;
      if (e.by === this.opts.meId) this.arena.hud.banner(e.n === 1 ? '¡Primer lugar!' : `${e.n}.º lugar`, 'Cruzaste la meta', 0);
      else if (e.n === 1) {
        const name = this.opts.racers.find((r) => r.id === e.by)?.name ?? 'Alguien';
        this.arena.hud.banner(`¡${name} ganó!`, 'Quedan 15 segundos para llegar', 2200);
      }
    }
    this.reconcile(frame);
  }

  private reconcile(frame: ChairsFrame) {
    const server = frame.karts.find((k) => k.id === this.opts.meId);
    if (!server) return;
    const before = this.me;
    const ack = frame.ack[this.opts.meId] ?? 0;
    this.controls.resumeAfter(ack);
    this.pending = this.pending.filter((i) => i.seq > ack);
    const me = cloneKart(server);
    for (const input of this.pending) stepKart(me, input);
    if (before) {
      const dx = before.x - me.x;
      const dz = before.z - me.z;
      if (Math.hypot(dx, dz) < 2.5) {
        this.offset.x += dx;
        this.offset.z += dz;
      } else {
        this.offset = { x: 0, z: 0 };
      }
    }
    this.me = me;
  }

  private onHidden = () => {
    // A hidden tab stops sending and the server keeps your last input: let go first.
    if (document.visibilityState === 'hidden' && this.me && !this.ended) {
      const stop: ChairsInput = { ...this.controls.sample(), steer: 0, thr: 0, fire: false, hop: 0 };
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
        this.arena.hud.banner(String(n), 'Prepárate', 0);
        sfx.beep();
      }
    } else if (this.lastBeep > 0) {
      this.lastBeep = 0;
      this.arena.hud.banner('¡Fuera!', '', 900);
      sfx.go();
    }

    const closeAt = this.latest?.closeAt ?? null;
    if (now >= startAt && now < endAt && !this.ended && (closeAt === null || now < closeAt)) {
      const target = Math.floor((now - startAt) / CHAIRS_TICK_MS);
      if (target - this.step > 5) this.step = target - 5;
      while (this.step < target) {
        this.step++;
        const input = this.controls.sample();
        this.pending.push(input);
        this.outbox.push(input);
        if (this.me) {
          this.prevMe = cloneKart(this.me);
          stepKart(this.me, input);
        }
        if (this.outbox.length >= STEPS_PER_SEND) this.flush();
      }
      if (this.pending.length > 90) this.pending.splice(0, this.pending.length - 90);
    } else if (now >= startAt && !this.ended && (now >= endAt || (closeAt !== null && now >= closeAt))) {
      this.ended = true;
      this.flush();
      const meK = this.latest?.karts.find((k) => k.id === this.opts.meId);
      if (!meK?.done) this.arena.hud.banner('¡Tiempo!', '', 0);
    }

    const ahead = this.latest ? Math.min(0.1, Math.max(0, (now - this.latest.at) / 1000)) : 0;
    const balls = (this.latest?.balls ?? []).map((b) => ({ ...b, x: b.x + b.vx * ahead, z: b.z + b.vz * ahead }));
    const closing = closeAt !== null;
    this.arena.render({
      karts: this.view(now),
      balls,
      remainingMs: now < startAt ? endAt - startAt : closing ? Math.max(0, closeAt! - now) : Math.max(0, endAt - now),
      closing,
    });
  };

  private flush() {
    if (!this.outbox.length) return;
    this.opts.send({ matchId: this.opts.matchId, inputs: this.outbox });
    this.outbox = [];
  }

  private view(now: number): Kart[] {
    if (!this.latest) return [];
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
    return this.latest.karts.map((f) => {
      if (f.id === this.opts.meId && this.me) {
        const stepAt = this.opts.startAt + this.step * CHAIRS_TICK_MS;
        const alpha = Math.max(0, Math.min(1, (now - stepAt) / CHAIRS_TICK_MS));
        const shown = this.prevMe && !this.ended ? lerpKart(this.prevMe, this.me, alpha) : this.me;
        // Laps, the finish, hits and turbo always come from the server.
        return { ...shown, x: shown.x + this.offset.x, z: shown.z + this.offset.z, lap: f.lap, done: f.done, hits: f.hits, taken: f.taken };
      }
      const fa = a.karts.find((x) => x.id === f.id);
      const fb = b.karts.find((x) => x.id === f.id);
      return fa && fb ? lerpKart(fa, fb, k) : f;
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.controls.dispose();
    this.arena.dispose();
  }
}
