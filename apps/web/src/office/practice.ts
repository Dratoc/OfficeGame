import { DEFAULT_LOADOUT, OFFICE_DT, OFFICE_TICK_MS, POWER_IDS, compareFighters, createFighter, createWorld, lastStanding, resolveCombat, stepFighter, cloneFighter, type AvatarConfig, type Fighter, type OfficeWorld, type PowerId } from '@inbox/shared';
import { OfficeArena } from './arena';
import { Controls } from './input';
import { SparringBot } from './bot';
import { sfx } from './sfx';
import { lerpFighter } from './lerp';

export interface PracticeOptions {
  me: { name: string; avatar: AvatarConfig; powers?: PowerId[] };
  /** One to three sparring bots. */
  rivals: { name: string; avatar: AvatarConfig }[];
  durationMs?: number;
  skill?: number;
  onEnd?: (result: 'win' | 'loss' | 'draw', place: number) => void;
}

/** Two different powers at random, for a bot. */
function randomLoadout(): PowerId[] {
  const pool = [...POWER_IDS];
  const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
  const b = pool[Math.floor(Math.random() * pool.length)]!;
  return [a, b];
}

/**
 * Offline Office Battle against one to three sparring bots. Runs the same rules as the server, locally,
 * so you can learn the moves without waiting for a rival.
 */
export class PracticeMatch {
  readonly arena: OfficeArena;
  private controls: Controls;
  private bots: SparringBot[];
  private world: OfficeWorld = createWorld([]);
  private fighters: Fighter[] = [];
  private prev: Fighter[] = [];
  private raf = 0;
  private acc = 0;
  private last = 0;
  private startAt = 0;
  private endAt = 0;
  private over = false;
  private lastBeep = -1;
  private frozen: number | null = null;

  constructor(container: HTMLElement, private opts: PracticeOptions) {
    this.arena = new OfficeArena(container, [
      { id: 'me', name: opts.me.name, avatar: opts.me.avatar, me: true },
      ...opts.rivals.map((r, i) => ({ id: `bot${i}`, name: r.name, avatar: r.avatar, me: false })),
    ]);
    this.controls = new Controls(container);
    this.bots = opts.rivals.map(() => new SparringBot(opts.skill ?? 0.6));
    this.reset();
    this.raf = requestAnimationFrame(this.frame);
  }

  reset() {
    this.fighters = [createFighter('me', 0, this.opts.me.powers ?? DEFAULT_LOADOUT), ...this.opts.rivals.map((_, i) => createFighter(`bot${i}`, i + 1, randomLoadout()))];
    this.world = createWorld(this.fighters);
    this.prev = this.fighters.map(cloneFighter);
    this.over = false;
    this.acc = 0;
    this.last = performance.now();
    this.startAt = this.last + 3000;
    this.endAt = this.startAt + (this.opts.durationMs ?? 60_000);
    this.lastBeep = -1;
    this.frozen = null;
    this.arena.hud.hideBanner();
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
      this.arena.hud.banner('¡A pelear!', '', 900);
      sfx.go();
    }

    if (playing) {
      this.acc += Math.min(250, now - this.last);
      while (this.acc >= OFFICE_TICK_MS) {
        this.acc -= OFFICE_TICK_MS;
        this.step();
        if (this.over) break;
      }
      if (!this.over && now >= this.endAt) this.finish();
    }
    this.last = now;

    const alpha = playing ? this.acc / OFFICE_TICK_MS : 1;
    this.arena.render({
      fighters: this.fighters.map((f, i) => lerpFighter(this.prev[i]!, f, alpha)),
      projectiles: this.world.projectiles,
      remainingMs: this.frozen ?? Math.max(0, this.endAt - Math.max(now, this.startAt)),
      countdown: null,
    });
  };

  private step() {
    this.prev = this.fighters.map(cloneFighter);
    const [me, ...bots] = this.fighters as [Fighter, ...Fighter[]];
    const others = (f: Fighter) => this.fighters.filter((o) => o !== f);
    stepFighter(me, this.controls.sample(), others(me));
    bots.forEach((b, i) => stepFighter(b, this.bots[i]!.step(b, others(b), OFFICE_DT), others(b)));
    const events = resolveCombat(this.world);
    this.arena.events(events);
    const ko = events.find((e) => e.type === 'ko' && e.target === 'me');
    if (ko && !lastStanding(this.fighters)) this.arena.hud.banner('K.O.', 'Quedaste fuera', 1800);
    if (lastStanding(this.fighters)) this.finish();
  }

  private finish() {
    if (this.over) return;
    this.over = true;
    this.frozen = Math.max(0, this.endAt - performance.now());
    const me = this.fighters[0]!;
    const ahead = this.fighters.filter((f) => f !== me && compareFighters(f, me) > 0).length;
    const tied = this.fighters.filter((f) => f !== me && compareFighters(f, me) === 0).length;
    const place = ahead + 1;
    const result = place > 1 ? 'loss' : tied ? 'draw' : 'win';
    const ko = lastStanding(this.fighters);
    const n = this.fighters.length;
    const sub = result === 'win' ? '¡Ganaste!' : result === 'draw' ? 'Empate' : n > 2 ? `Quedaste en el ${place}.º lugar` : 'Perdiste esta vez';
    this.arena.hud.banner(ko ? 'K.O.' : '¡Tiempo!', sub, 0);
    this.opts.onEnd?.(result, place);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.arena.dispose();
  }
}
