import { CHAIRS_CLOSE_MS, CHAIRS_DT, CHAIRS_TICK_MS, ChairBot, cloneKart, compareKarts, createChairsWorld, createKart, resolveChairs, stepKart, type AvatarConfig, type ChairsWorld, type Kart } from '@inbox/shared';
import { ChairsArena } from './arena';
import { ChairControls } from './input';
import { lerpKart } from './lerp';
import { sfx } from '../office/sfx';

export interface ChairsPracticeOptions {
  me: { name: string; avatar: AvatarConfig };
  /** One to three rival bots. */
  rivals: { name: string; avatar: AvatarConfig }[];
  skill?: number;
  durationMs?: number;
  onEnd?: (place: number, of: number) => void;
}

/**
 * Offline chair race against one to three bots. Runs the same rules as the server, locally,
 * so you can learn the track and the throws without waiting for rivals.
 */
export class ChairsPractice {
  readonly arena: ChairsArena;
  private controls: ChairControls;
  private bots: ChairBot[];
  private world: ChairsWorld = createChairsWorld([]);
  private karts: Kart[] = [];
  private prev: Kart[] = [];
  private raf = 0;
  private acc = 0;
  private last = 0;
  private startAt = 0;
  private endAt = 0;
  private closeAt: number | null = null;
  private over = false;
  private lastBeep = -1;
  private frozen: number | null = null;

  constructor(container: HTMLElement, private opts: ChairsPracticeOptions) {
    this.arena = new ChairsArena(container, [
      { id: 'me', name: opts.me.name, avatar: opts.me.avatar, me: true },
      ...opts.rivals.map((r, i) => ({ id: `bot${i}`, name: r.name, avatar: r.avatar, me: false })),
    ]);
    this.controls = new ChairControls(container);
    this.bots = opts.rivals.map(() => new ChairBot(opts.skill ?? 0.6));
    // You start at the back of the grid, so there is someone to aim at right away.
    const n = opts.rivals.length + 1;
    this.karts = [createKart('me', n - 1), ...opts.rivals.map((_, i) => createKart(`bot${i}`, i))];
    this.world = createChairsWorld(this.karts);
    this.prev = this.karts.map(cloneKart);
    this.last = performance.now();
    this.startAt = this.last + 3000;
    this.endAt = this.startAt + (opts.durationMs ?? 120_000);
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const playing = !this.over && now >= this.startAt;
    if (!this.over && now < this.startAt) {
      const n = Math.ceil((this.startAt - now) / 1000);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        this.arena.hud.banner(String(n), 'Prepárate', 0);
        sfx.beep();
      }
    } else if (this.lastBeep > 0 && playing) {
      this.lastBeep = 0;
      this.arena.hud.banner('¡Fuera!', '', 900);
      sfx.go();
    }
    if (playing) {
      this.acc += Math.min(250, now - this.last);
      while (this.acc >= CHAIRS_TICK_MS) {
        this.acc -= CHAIRS_TICK_MS;
        this.step(now);
        if (this.over) break;
      }
      if (!this.over && (now >= this.endAt || (this.closeAt !== null && now >= this.closeAt))) this.finish();
    }
    this.last = now;
    const alpha = playing ? this.acc / CHAIRS_TICK_MS : 1;
    const closing = this.closeAt !== null && !this.over;
    this.arena.render({
      karts: this.karts.map((k, i) => lerpKart(this.prev[i]!, k, alpha)),
      balls: this.world.balls,
      remainingMs: this.frozen ?? (closing ? Math.max(0, this.closeAt! - now) : Math.max(0, this.endAt - Math.max(now, this.startAt))),
      closing,
    });
  };

  private step(now: number) {
    this.prev = this.karts.map(cloneKart);
    const [me, ...bots] = this.karts as [Kart, ...Kart[]];
    stepKart(me, this.controls.sample());
    bots.forEach((b, i) =>
      stepKart(
        b,
        this.bots[i]!.step(
          b,
          this.karts.filter((o) => o !== b),
          this.world.balls,
          CHAIRS_DT,
        ),
      ),
    );
    const events = resolveChairs(this.world);
    this.arena.events(events);
    for (const e of events) {
      if (e.type !== 'finish') continue;
      if (this.closeAt === null) this.closeAt = now + CHAIRS_CLOSE_MS;
      if (e.by === 'me') this.arena.hud.banner(e.n === 1 ? '¡Primer lugar!' : `${e.n}.º lugar`, 'Cruzaste la meta', 0);
    }
    if (this.karts.every((k) => k.done > 0)) this.finish();
  }

  private finish() {
    if (this.over) return;
    this.over = true;
    this.frozen = 0;
    const me = this.karts[0]!;
    const place = this.karts.filter((k) => k !== me && compareKarts(k, me) > 0).length + 1;
    const n = this.karts.length;
    if (!me.done) this.arena.hud.banner('¡Tiempo!', `Quedaste en el ${place}.º lugar de ${n}`, 0);
    else this.arena.hud.banner(place === 1 ? '¡Ganaste!' : `${place}.º lugar`, `de ${n} sillas`, 0);
    this.opts.onEnd?.(place, n);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.arena.dispose();
  }
}
