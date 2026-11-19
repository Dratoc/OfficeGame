import { ARMY, ARMY_SIZES, MF_DT, MF_TICK_MS, capacityOf, type MfComposition, MagicCommanderBot, commanderOf, createMagicBattle, magicMap, stepMagicWorld, type MfEvent, type MfInput, type MfWorld } from '@inbox/shared';
import { sfx } from '../office/sfx';
import { MagicArena } from './arena';
import { MagicControls } from './input';

export interface MagicPracticeOptions {
  /** 0..1: enemy army size and how sharp the AI commander is. */
  skill: number;
  /** Size of both armies. */
  size?: keyof typeof ARMY_SIZES;
  onEnd?: (world: MfWorld) => void;
}

/** Enemy army by difficulty: smaller when easy, a bit bigger when hard (never over the cap). */
export function enemyArmy(size: keyof typeof ARMY_SIZES, skill: number): MfComposition {
  const base = ARMY_SIZES[size];
  const f = skill < 0.4 ? 0.75 : skill < 0.7 ? 1 : 1.2;
  const c = { warriors: Math.max(2, Math.round(base.warriors * f)), mages: Math.max(1, Math.round(base.mages * f)), beasts: base.beasts };
  while (capacityOf(c) > ARMY.maxCapacity) c.warriors--;
  return c;
}

/**
 * The first playable version: your commander and ten soldiers against an AI army, offline.
 * Rules run at a fixed 30 steps per second (the same code the server will run for online battles)
 * and the picture is interpolated between steps.
 */
export class MagicPractice {
  readonly arena: MagicArena;
  readonly controls: MagicControls;
  private bot: MagicCommanderBot;
  private world: MfWorld;
  private raf = 0;
  private acc = 0;
  private last = 0;
  private ended = false;
  private prev = new Map<number, { x: number; z: number }>();
  /** Scripted input for demos and screenshots (overrides the keyboard while set). */
  autopilot: ((world: MfWorld) => Partial<MfInput> | null) | null = null;

  constructor(container: HTMLElement, private opts: MagicPracticeOptions) {
    const size = opts.size ?? 'small';
    this.world = createMagicBattle(Math.floor(Math.random() * 2 ** 31), enemyArmy(size, opts.skill), ARMY_SIZES[size]);
    this.bot = new MagicCommanderBot(1, opts.skill, Math.floor(Math.random() * 1e6));
    this.arena = new MagicArena(container);
    this.controls = new MagicControls(container, magicMap().playerSpawn.facing);
    this.controls.onNotice = (t) => this.arena.hud.toast(t);
    this.controls.onLock = (l) => this.arena.hud.setPointerLocked(l);
    try {
      // Demo hook for scripted screenshots.
      if (localStorage.getItem('inbox-arena:magic-demo') === '1') (window as unknown as { __magic?: MagicPractice }).__magic = this;
    } catch {
      /* private mode */
    }
    this.arena.hud.banner('Magic Frontiers', 'Lleva a tu ejército al norte y derrota al comandante enemigo', 3200);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get state() {
    return this.world;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.world.over) {
      this.acc += Math.min(250, now - this.last);
      while (this.acc >= MF_TICK_MS && !this.world.over) {
        this.acc -= MF_TICK_MS;
        this.step();
      }
    }
    this.last = now;
    if (this.world.over && !this.ended) {
      this.ended = true;
      const won = this.world.winner === 0;
      if (won) sfx.go();
      else sfx.ko();
      this.arena.hud.banner(won ? '¡Victoria!' : 'Derrota', won ? 'El ejército enemigo ha caído' : 'Tu comandante ha caído', 0, won ? 'mf-win' : 'mf-lose');
      this.opts.onEnd?.(this.world);
    }
    const cmd = commanderOf(this.world, 0);
    const aim = this.lastAim ?? { x: cmd.x, z: cmd.z + 10 };
    this.arena.render(this.world, this.world.over ? 1 : this.acc / MF_TICK_MS, this.prev, { yaw: this.controls.yaw, aimX: aim.x, aimZ: aim.z });
  };

  private lastAim: { x: number; z: number } | null = null;

  private step() {
    for (const u of this.world.units) this.prev.set(u.id, { x: u.x, z: u.z });
    const cmd = commanderOf(this.world, 0);
    let mine = this.controls.sample(cmd, MF_DT, (x, y) => this.arena.groundAt(x, y));
    const script = this.autopilot?.(this.world);
    if (script) mine = { ...mine, ...script };
    this.lastAim = { x: mine.aimX, z: mine.aimZ };
    const inputs = new Map<number, MfInput>([
      [0, mine],
      [1, this.bot.step(this.world)],
    ]);
    const events: MfEvent[] = stepMagicWorld(this.world, inputs);
    this.arena.events(this.world, events);
  }

  dispose() {
    const w = window as unknown as { __magic?: MagicPractice };
    if (w.__magic === this) delete w.__magic;
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.arena.dispose();
  }
}
