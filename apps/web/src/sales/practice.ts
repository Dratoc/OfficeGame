import { SALES_DT, SALES_TICK_MS, SalesBot, createSalesWorld, moveWorker, stepSales, type AvatarConfig, type SalesInput, type SalesWorld } from '@inbox/shared';
import { SalesArena } from './arena';
import { SalesControls } from './input';
import { sfx } from '../office/sfx';

export interface SalesPracticeOptions {
  me: { name: string; avatar: AvatarConfig };
  /** Zero to three bot teammates. */
  mates: { name: string; avatar: AvatarConfig }[];
  skill?: number;
  onEnd?: (world: SalesWorld) => void;
}

/**
 * An offline shift with zero to three bot teammates. Runs the same rules as the server, locally,
 * so you can learn the recipe and your part of the floor without waiting for people.
 */
export class SalesPractice {
  readonly arena: SalesArena;
  private controls: SalesControls;
  private bots: SalesBot[];
  private world: SalesWorld;
  private raf = 0;
  private acc = 0;
  private last = 0;
  private startAt = 0;
  private lastBeep = -1;
  private ended = false;
  /** Demo mode for screenshots and showcases: a bot plays your part too. */
  private autopilot: SalesBot | null = null;

  constructor(container: HTMLElement, private opts: SalesPracticeOptions) {
    const ids = ['me', ...opts.mates.map((_, i) => `bot${i}`)];
    this.arena = new SalesArena(container, [
      { id: 'me', name: opts.me.name, avatar: opts.me.avatar, me: true },
      ...opts.mates.map((m, i) => ({ id: `bot${i}`, name: m.name, avatar: m.avatar, me: false })),
    ]);
    this.controls = new SalesControls(container);
    this.bots = opts.mates.map(() => new SalesBot(opts.skill ?? 0.6));
    this.world = createSalesWorld(ids, Math.floor(Math.random() * 2 ** 31));
    try {
      if (localStorage.getItem('inbox-arena:sales-autopilot') === '1') this.autopilot = new SalesBot(0.8);
    } catch {
      /* private mode */
    }
    this.last = performance.now();
    this.startAt = this.last + 3000;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const playing = !this.world.over && now >= this.startAt;
    if (!this.world.over && now < this.startAt) {
      const n = Math.ceil((this.startAt - now) / 1000);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        this.arena.hud.banner(String(n), 'Abre el local', 0);
        sfx.beep();
      }
    } else if (this.lastBeep > 0 && playing) {
      this.lastBeep = 0;
      this.arena.hud.banner('¡A vender!', '', 900);
      sfx.go();
    }
    if (playing) {
      this.acc += Math.min(250, now - this.last);
      while (this.acc >= SALES_TICK_MS && !this.world.over) {
        this.acc -= SALES_TICK_MS;
        this.step();
      }
    }
    this.last = now;
    if (this.world.over && !this.ended) {
      this.ended = true;
      this.opts.onEnd?.(this.world);
    }
    this.arena.render(this.world);
  };

  private step() {
    const inputs = new Map<string, SalesInput>();
    const [me, ...mates] = this.world.workers;
    const typed = this.controls.sample();
    const mine = this.autopilot && !typed.mx && !typed.mz && !typed.hold ? this.autopilot.step(this.world, me!, this.world.workers, SALES_DT) : typed;
    moveWorker(me!, mine);
    inputs.set(me!.id, mine);
    mates.forEach((w, i) => {
      const input = this.bots[i]!.step(this.world, w, this.world.workers, SALES_DT);
      moveWorker(w, input);
      inputs.set(w.id, input);
    });
    this.arena.events(stepSales(this.world, inputs), this.world);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.arena.dispose();
  }
}
