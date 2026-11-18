import { ZOMBIE_DT, ZOMBIE_TICK_MS, ZombieBot, createZombieWorld, stepZombieWorld, viewOf, type AvatarConfig, type ZombieInput, type ZombieWorld } from '@inbox/shared';
import { ZombieArena } from './arena';
import { ZombieControls } from './input';
import { wireShopping } from './digits';
import { sfx } from '../office/sfx';

export interface ZombiePracticeOptions {
  me: { name: string; avatar: AvatarConfig };
  /** Zero to three bot teammates. */
  mates: { name: string; avatar: AvatarConfig }[];
  skill?: number;
  onEnd?: (world: ZombieWorld) => void;
}

/**
 * An offline match with zero to three bot teammates. Runs the same rules as the server, locally.
 * Friendly fire is on here too, so watch where you swing.
 */
export class ZombiePractice {
  readonly arena: ZombieArena;
  private controls: ZombieControls;
  private bots: ZombieBot[];
  private world: ZombieWorld;
  private raf = 0;
  private acc = 0;
  private last = 0;
  private ended = false;
  /** Demo mode for screenshots: a bot plays your part too while you don't touch anything. */
  private autopilot: ZombieBot | null = null;

  constructor(container: HTMLElement, private opts: ZombiePracticeOptions) {
    const ids = ['me', ...opts.mates.map((_, i) => `bot${i}`)];
    this.arena = new ZombieArena(container, [
      { id: 'me', name: opts.me.name, avatar: opts.me.avatar, me: true },
      ...opts.mates.map((m, i) => ({ id: `bot${i}`, name: m.name, avatar: m.avatar, me: false })),
    ]);
    this.controls = new ZombieControls(container);
    this.bots = opts.mates.map(() => new ZombieBot(opts.skill ?? 0.6));
    this.world = createZombieWorld(ids, Math.floor(Math.random() * 2 ** 31), true);
    wireShopping(this.arena.hud, this.controls, () => this.world.survivors[0] ?? null);
    try {
      if (localStorage.getItem('inbox-arena:zombies-autopilot') === '1') {
        this.autopilot = new ZombieBot(0.9);
        // Showcase hook for screenshots.
        (window as unknown as { __zombies?: ZombiePractice }).__zombies = this;
      }
    } catch {
      /* private mode */
    }
    this.last = performance.now();
    this.arena.hud.banner('Zona Zombi', 'Compra armas en las tiendas antes de que lleguen', 2600);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** For demos and tests: the live world. */
  get state() {
    return this.world;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.world.over) {
      this.acc += Math.min(250, now - this.last);
      while (this.acc >= ZOMBIE_TICK_MS && !this.world.over) {
        this.acc -= ZOMBIE_TICK_MS;
        this.step();
      }
    }
    this.last = now;
    if (this.world.over && !this.ended) {
      this.ended = true;
      sfx.ko();
      this.opts.onEnd?.(this.world);
    }
    this.arena.render(viewOf(this.world));
  };

  private step() {
    const inputs = new Map<string, ZombieInput>();
    const view = viewOf(this.world);
    const [me, ...mates] = this.world.survivors;
    const typed = this.controls.sample();
    const idle = !typed.mx && !typed.mz && !typed.ah && !typed.blk && typed.buy < 0 && typed.sel < 0 && !typed.use;
    inputs.set(me!.id, this.autopilot && idle ? this.autopilot.step(view, me!, null, ZOMBIE_DT) : typed);
    mates.forEach((s, i) => inputs.set(s.id, this.bots[i]!.step(view, s, me!.id, ZOMBIE_DT)));
    this.arena.events(stepZombieWorld(this.world, inputs));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.arena.dispose();
  }
}
