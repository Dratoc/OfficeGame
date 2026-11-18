import type { ChairsInput } from '@inbox/shared';
import { sfx } from '../office/sfx';

/** A press stays valid for this many steps, so a tap just before the cooldown ends still counts. */
const BUFFER_STEPS = 5;

/**
 * Keyboard, mouse and touch controls for the chair race, sampled once per simulation step.
 * On touch screens the chair accelerates on its own: you steer, brake, throw and hop.
 */
export class ChairControls {
  private keys = new Set<string>();
  private fire = 0;
  private hop = 0;
  private hopDir = 0;
  private touch = { left: false, right: false, brake: false, on: false };
  private seq = 0;
  private off: (() => void)[] = [];
  enabled = true;

  constructor(private root: HTMLElement) {
    const down = (e: KeyboardEvent) => {
      if (!this.enabled || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'j', 'k', 'q', 'e', 'shift'].includes(k)) e.preventDefault();
      sfx.unlock();
      if (!e.repeat) {
        if (k === ' ' || k === 'j') this.fire = BUFFER_STEPS;
        if (k === 'q') this.press(-1);
        if (k === 'e') this.press(1);
        if (k === 'shift' || k === 'k') this.press(0);
      }
      this.keys.add(k);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => this.keys.clear();
    const mdown = (e: MouseEvent) => {
      if (!this.enabled || e.button !== 0 || (e.target as HTMLElement).closest('.cr-touch button')) return;
      sfx.unlock();
      this.fire = BUFFER_STEPS;
    };
    const menu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    root.addEventListener('mousedown', mdown);
    root.addEventListener('contextmenu', menu);
    this.off.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      root.removeEventListener('mousedown', mdown);
      root.removeEventListener('contextmenu', menu);
    });
    this.buildTouch();
  }

  /** dir 0 hops toward where you are steering (right if you are not). */
  private press(dir: number) {
    this.hop = BUFFER_STEPS;
    this.hopDir = dir;
  }

  private buildTouch() {
    const wrap = document.createElement('div');
    wrap.className = 'cr-touch';
    const show = () => {
      wrap.classList.add('on');
      this.root.classList.add('cr-touching');
      this.touch.on = true;
    };
    if (window.matchMedia?.('(pointer: coarse)').matches) show();
    const steer = document.createElement('div');
    steer.className = 'cr-steer';
    const acts = document.createElement('div');
    acts.className = 'cr-acts';
    const mk = (parent: HTMLElement, label: string, cls: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      parent.appendChild(b);
      return b;
    };
    const left = mk(steer, '◀', 'left');
    const right = mk(steer, '▶', 'right');
    const hopL = mk(acts, 'Salto ◀', 'hop');
    const hopR = mk(acts, 'Salto ▶', 'hop');
    const brake = mk(acts, 'Frenar', 'brake');
    const fire = mk(acts, 'Lanzar', 'fire');
    wrap.append(steer, acts);
    this.root.appendChild(wrap);

    const hold = (b: HTMLButtonElement, key: 'left' | 'right' | 'brake') => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sfx.unlock();
        this.touch[key] = true;
        b.classList.add('on');
      });
      const release = () => {
        this.touch[key] = false;
        b.classList.remove('on');
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointerleave', release);
      b.addEventListener('pointercancel', release);
    };
    hold(left, 'left');
    hold(right, 'right');
    hold(brake, 'brake');
    const tap = (b: HTMLButtonElement, run: () => void) =>
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sfx.unlock();
        run();
      });
    tap(fire, () => (this.fire = BUFFER_STEPS));
    tap(hopL, () => this.press(-1));
    tap(hopR, () => this.press(1));
    this.root.addEventListener('touchstart', show, { passive: true });
    this.off.push(() => this.root.removeEventListener('touchstart', show));
  }

  /** The input for the next simulation step. */
  sample(): ChairsInput {
    const k = this.keys;
    let steer = 0;
    if (k.has('a') || k.has('arrowleft') || this.touch.left) steer -= 1;
    if (k.has('d') || k.has('arrowright') || this.touch.right) steer += 1;
    let thr = 0;
    const gas = k.has('w') || k.has('arrowup');
    const brake = k.has('s') || k.has('arrowdown') || this.touch.brake;
    if (gas) thr += 1;
    if (brake) thr -= 1;
    // On touch the chair rolls forward by itself unless you brake.
    if (this.touch.on && !gas && !brake) thr = 1;
    const hopDir = this.hopDir !== 0 ? this.hopDir : steer < 0 ? -1 : 1;
    const input: ChairsInput = {
      seq: ++this.seq,
      steer: this.enabled ? steer : 0,
      thr: this.enabled ? thr : 0,
      fire: this.enabled && this.fire > 0,
      hop: this.enabled && this.hop > 0 ? hopDir : 0,
    };
    this.fire = Math.max(0, this.fire - 1);
    this.hop = Math.max(0, this.hop - 1);
    return input;
  }

  /** After a reload mid-race, continue numbering steps after the last one the server applied. */
  resumeAfter(seq: number) {
    this.seq = Math.max(this.seq, seq);
  }

  dispose() {
    this.off.forEach((f) => f());
    this.root.querySelector('.cr-touch')?.remove();
    this.root.classList.remove('cr-touching');
  }
}
