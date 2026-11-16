import { OFFICE_DT, OFFICE_TICK_MS, compareFighters, createFighter, resolveCombat, stepFighter, cloneFighter, type AvatarConfig, type Fighter } from '@inbox/shared';
import { OfficeArena } from './arena';
import { Controls } from './input';
import { SparringBot } from './bot';
import { sfx } from './sfx';
import { lerpFighter } from './lerp';

export interface PracticeOptions {
  me: { name: string; avatar: AvatarConfig };
  rival: { name: string; avatar: AvatarConfig };
  durationMs?: number;
  skill?: number;
  onEnd?: (result: 'win' | 'loss' | 'draw') => void;
}

/**
 * Offline Office Battle against a sparring bot. Runs the same rules as the server, locally,
 * so you can learn the moves without waiting for a rival.
 */
export class PracticeMatch {
  readonly arena: OfficeArena;
  private controls: Controls;
  private bot: SparringBot;
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
      { id: 'bot', name: opts.rival.name, avatar: opts.rival.avatar, me: false },
    ]);
    this.controls = new Controls(container);
    this.bot = new SparringBot(opts.skill ?? 0.6);
    this.reset();
    this.raf = requestAnimationFrame(this.frame);
  }

  reset() {
    this.fighters = [createFighter('me', 0), createFighter('bot', 1)];
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
      remainingMs: this.frozen ?? Math.max(0, this.endAt - Math.max(now, this.startAt)),
      countdown: null,
    });
  };

  private step() {
    const [me, bot] = this.fighters as [Fighter, Fighter];
    this.prev = this.fighters.map(cloneFighter);
    stepFighter(me, this.controls.sample(), bot);
    stepFighter(bot, this.bot.step(bot, me, OFFICE_DT), me);
    const events = resolveCombat(this.fighters);
    this.arena.events(events);
    if (events.some((e) => e.type === 'ko')) this.finish();
  }

  private finish() {
    if (this.over) return;
    this.over = true;
    this.frozen = Math.max(0, this.endAt - performance.now());
    const [me, bot] = this.fighters as [Fighter, Fighter];
    const c = compareFighters(me, bot);
    const result = c > 0 ? 'win' : c < 0 ? 'loss' : 'draw';
    const ko = me.hp <= 0 || bot.hp <= 0;
    this.arena.hud.banner(ko ? 'K.O.' : '¡Tiempo!', result === 'win' ? '¡Ganaste!' : result === 'loss' ? 'Perdiste esta vez' : 'Empate', 0);
    this.opts.onEnd?.(result);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.arena.dispose();
  }
}
