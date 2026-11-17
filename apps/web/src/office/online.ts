import { OFFICE_TICK_MS, cloneFighter, stepFighter, type Fighter, type OfficeFrame, type OfficeInput, type OfficeInputBatch } from '@inbox/shared';
import { OfficeArena, type ArenaPlayer } from './arena';
import { Controls } from './input';
import { lerpFighter } from './lerp';
import { sfx } from './sfx';

/** How far in the past rivals are drawn, so there are always two server frames to blend. */
const INTERP_DELAY_MS = 110;
/** Input steps sent per message. */
const STEPS_PER_SEND = 2;

export interface OnlineOptions {
  matchId: string;
  meId: string;
  players: ArenaPlayer[];
  startAt: number;
  endAt: number;
  serverNow: () => number;
  send: (batch: OfficeInputBatch) => void;
}

/**
 * Client side of an online Office Battle. The server decides everything; this class sends
 * inputs, predicts your own fighter with the same rules so moving feels instant, corrects the
 * prediction with each server frame, and draws your rival slightly in the past, blended
 * between two frames.
 */
export class OnlineOfficeMatch {
  readonly arena: OfficeArena;
  private controls: Controls;
  private frames: OfficeFrame[] = [];
  private latest: OfficeFrame | null = null;
  /** Your fighter as predicted from the last server frame plus the inputs it has not seen yet. */
  private me: Fighter | null = null;
  private prevMe: Fighter | null = null;
  private pending: OfficeInput[] = [];
  private outbox: OfficeInput[] = [];
  private step = 0;
  private raf = 0;
  /** Visual offset that fades out after a correction, so fixes never look like teleports. */
  private offset = { x: 0, z: 0 };
  private lastBeep = -1;
  private ended = false;
  private seenTick = -1;

  constructor(container: HTMLElement, private opts: OnlineOptions) {
    this.arena = new OfficeArena(container, opts.players);
    this.controls = new Controls(container);
    document.addEventListener('visibilitychange', this.onHidden);
    this.raf = requestAnimationFrame(this.frame);
  }

  setClock(startAt: number, endAt: number) {
    this.opts.startAt = startAt;
    this.opts.endAt = endAt;
  }

  /** Called for every frame the server sends. */
  onFrame(frame: OfficeFrame) {
    if (frame.tick <= this.seenTick) return;
    this.seenTick = frame.tick;
    this.latest = frame;
    this.frames.push(frame);
    if (this.frames.length > 30) this.frames.shift();
    this.arena.events(frame.events);
    if (frame.events.some((e) => e.type === 'ko')) {
      const ko = frame.events.find((e) => e.type === 'ko')!;
      this.arena.hud.banner('K.O.', ko.target === this.opts.meId ? 'Perdiste esta vez' : '¡Ganaste!', 0);
      this.ended = true;
    }
    this.reconcile(frame);
  }

  private reconcile(frame: OfficeFrame) {
    const server = frame.fighters.find((f) => f.id === this.opts.meId);
    if (!server) return;
    const before = this.me;
    const ack = frame.ack[this.opts.meId] ?? 0;
    this.controls.resumeAfter(ack);
    this.pending = this.pending.filter((i) => i.seq > ack);
    const me = cloneFighter(server);
    const rival = frame.fighters.find((f) => f.id !== this.opts.meId) ?? null;
    for (const input of this.pending) stepFighter(me, input, rival);
    if (before) {
      const dx = before.x - me.x;
      const dz = before.z - me.z;
      if (Math.hypot(dx, dz) < 2) {
        this.offset.x += dx;
        this.offset.z += dz;
      } else {
        this.offset = { x: 0, z: 0 };
      }
    }
    this.me = me;
  }

  private onHidden = () => {
    // A hidden tab stops sending, and the server keeps your last direction: stop first.
    if (document.visibilityState === 'hidden' && this.me && !this.ended) {
      const stop: OfficeInput = { ...this.controls.sample(), mx: 0, mz: 0, atk: false, blk: false, dge: false };
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
      this.arena.hud.banner('¡A pelear!', '', 900);
      sfx.go();
    }

    // Fixed input steps, aligned with the server's clock.
    if (now >= startAt && now < endAt && !this.ended) {
      const target = Math.floor((now - startAt) / OFFICE_TICK_MS);
      if (target - this.step > 5) this.step = target - 5;
      while (this.step < target) {
        this.step++;
        const input = this.controls.sample();
        this.pending.push(input);
        this.outbox.push(input);
        if (this.me) {
          this.prevMe = cloneFighter(this.me);
          const rival = this.latest?.fighters.find((f) => f.id !== this.opts.meId) ?? null;
          stepFighter(this.me, input, rival);
        }
        if (this.outbox.length >= STEPS_PER_SEND) this.flush();
      }
      if (this.pending.length > 90) this.pending.splice(0, this.pending.length - 90);
    } else if (now >= endAt && !this.ended) {
      this.ended = true;
      this.flush();
      this.arena.hud.banner('¡Tiempo!', '', 0);
    }

    this.arena.render({ fighters: this.view(now), remainingMs: now < startAt ? endAt - startAt : Math.max(0, endAt - now), countdown: null });
  };

  private flush() {
    if (!this.outbox.length) return;
    this.opts.send({ matchId: this.opts.matchId, inputs: this.outbox });
    this.outbox = [];
  }

  /** Fighters to draw right now. */
  private view(now: number): Fighter[] {
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
    // Fade the correction offset.
    this.offset.x *= 0.85;
    this.offset.z *= 0.85;
    return this.latest.fighters.map((f) => {
      if (f.id === this.opts.meId && this.me) {
        const stepAt = this.opts.startAt + this.step * OFFICE_TICK_MS;
        const alpha = Math.max(0, Math.min(1, (now - stepAt) / OFFICE_TICK_MS));
        const shown = this.prevMe && !this.ended ? lerpFighter(this.prevMe, this.me, alpha) : this.me;
        // Health and knockouts always come from the server.
        return { ...shown, hp: f.hp, x: shown.x + this.offset.x, z: shown.z + this.offset.z, action: f.action === 'ko' ? 'ko' : shown.action, t: f.action === 'ko' ? f.t : shown.t };
      }
      const fa = a.fighters.find((x) => x.id === f.id);
      const fb = b.fighters.find((x) => x.id === f.id);
      return fa && fb ? lerpFighter(fa, fb, k) : f;
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.controls.dispose();
    this.arena.dispose();
  }
}
