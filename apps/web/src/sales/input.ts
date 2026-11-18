import type { SalesInput } from '@inbox/shared';
import { sfx } from '../office/sfx';

/** A press stays valid for this many steps, so a quick tap is never lost between steps. */
const BUFFER_STEPS = 3;
const ACTION_KEYS = ['e', ' ', 'j', 'enter'];

/**
 * Keyboard and touch controls for A Toda Máquina, sampled once per simulation step: move with
 * WASD or the arrows, and press (or hold, at a desk) the action key. On touch screens a joystick
 * and an action button appear.
 */
export class SalesControls {
  private keys = new Set<string>();
  private press = 0;
  private holding = false;
  private stick = { x: 0, z: 0, id: -1 };
  private touchHold = false;
  private seq = 0;
  private off: (() => void)[] = [];
  enabled = true;

  constructor(private root: HTMLElement) {
    const down = (e: KeyboardEvent) => {
      if (!this.enabled || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ...ACTION_KEYS].includes(k)) e.preventDefault();
      sfx.unlock();
      if (!e.repeat && ACTION_KEYS.includes(k)) this.press = BUFFER_STEPS;
      this.keys.add(k);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => {
      this.keys.clear();
      this.holding = false;
    };
    const mdown = (e: MouseEvent) => {
      if (!this.enabled || e.button !== 0 || (e.target as HTMLElement).closest('.sm-touch')) return;
      sfx.unlock();
      this.press = BUFFER_STEPS;
      this.holding = true;
    };
    const mup = () => (this.holding = false);
    const menu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('mouseup', mup);
    root.addEventListener('mousedown', mdown);
    root.addEventListener('contextmenu', menu);
    this.off.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('mouseup', mup);
      root.removeEventListener('mousedown', mdown);
      root.removeEventListener('contextmenu', menu);
    });
    this.buildTouch();
  }

  private buildTouch() {
    const wrap = document.createElement('div');
    wrap.className = 'sm-touch';
    const show = () => {
      wrap.classList.add('on');
      this.root.classList.add('sm-touching');
    };
    if (window.matchMedia?.('(pointer: coarse)').matches) show();
    const pad = document.createElement('div');
    pad.className = 'sm-stick';
    const knob = document.createElement('i');
    pad.appendChild(knob);
    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'sm-act';
    act.textContent = 'Acción';
    wrap.append(pad, act);
    this.root.appendChild(wrap);

    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.stick.x = Math.abs(dx) < 0.15 ? 0 : dx;
      this.stick.z = Math.abs(dy) < 0.15 ? 0 : dy;
      knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    };
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick = { x: 0, z: 0, id: -1 };
      knob.style.transform = '';
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      this.stick.id = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      move(e);
    });
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    act.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      this.press = BUFFER_STEPS;
      this.touchHold = true;
      act.classList.add('on');
    });
    const stop = () => {
      this.touchHold = false;
      act.classList.remove('on');
    };
    act.addEventListener('pointerup', stop);
    act.addEventListener('pointerleave', stop);
    act.addEventListener('pointercancel', stop);
    this.root.addEventListener('touchstart', show, { passive: true });
    this.off.push(() => this.root.removeEventListener('touchstart', show));
  }

  /** The input for the next simulation step. */
  sample(): SalesInput {
    const k = this.keys;
    let mx = this.stick.x;
    let mz = this.stick.z;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('w') || k.has('arrowup')) mz -= 1;
    if (k.has('s') || k.has('arrowdown')) mz += 1;
    const hold = ACTION_KEYS.some((a) => k.has(a)) || this.holding || this.touchHold;
    const input: SalesInput = {
      seq: ++this.seq,
      mx: this.enabled ? Math.max(-1, Math.min(1, mx)) : 0,
      mz: this.enabled ? Math.max(-1, Math.min(1, mz)) : 0,
      act: this.enabled && this.press === BUFFER_STEPS,
      hold: this.enabled && hold,
    };
    // Only the first step of a press acts; the buffer just keeps the hold alive for a tap.
    this.press = Math.max(0, this.press - 1);
    if (this.press > 0) input.hold = this.enabled;
    return input;
  }

  /** After a reload mid-shift, continue numbering steps after the last one the server applied. */
  resumeAfter(seq: number) {
    this.seq = Math.max(this.seq, seq);
  }

  dispose() {
    this.off.forEach((f) => f());
    this.root.querySelector('.sm-touch')?.remove();
    this.root.classList.remove('sm-touching');
  }
}
