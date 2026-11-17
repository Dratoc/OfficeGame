import type { OfficeInput } from '@inbox/shared';
import { sfx } from './sfx';

/** A press stays valid for this many steps, so a tap just before a move ends still counts. */
const BUFFER_STEPS = 5;

/**
 * Keyboard, mouse and touch controls, sampled once per simulation step.
 * Moving is relative to the screen: up is away from the camera (-z).
 */
export class Controls {
  private keys = new Set<string>();
  private atk = 0;
  private dge = 0;
  private p1 = 0;
  private p2 = 0;
  private mouseBlock = false;
  private touchBlock = false;
  private stick = { x: 0, z: 0, id: -1 };
  private seq = 0;
  private off: (() => void)[] = [];
  enabled = true;

  constructor(private root: HTMLElement) {
    const down = (e: KeyboardEvent) => {
      if (!this.enabled || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'j', 'k', 'l', 'shift', 'q', 'e', '1', '2'].includes(k)) e.preventDefault();
      sfx.unlock();
      if (!e.repeat) {
        if (k === 'j') this.atk = BUFFER_STEPS;
        if (k === ' ' || k === 'l' || k === 'shift') this.dge = BUFFER_STEPS;
        if (k === 'q' || k === '1') this.p1 = BUFFER_STEPS;
        if (k === 'e' || k === '2') this.p2 = BUFFER_STEPS;
      }
      this.keys.add(k);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => {
      this.keys.clear();
      this.mouseBlock = false;
    };
    const mdown = (e: MouseEvent) => {
      if (!this.enabled || (e.target as HTMLElement).closest('.ob-btns, .ob-stick, .ob-power')) return;
      sfx.unlock();
      if (e.button === 0) this.atk = BUFFER_STEPS;
      if (e.button === 2) this.mouseBlock = true;
    };
    const mup = (e: MouseEvent) => {
      if (e.button === 2) this.mouseBlock = false;
    };
    const menu = (e: Event) => e.preventDefault();
    // Power buttons on the HUD work with a click or a tap.
    const power = (e: PointerEvent) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.ob-power')?.dataset.slot;
      if (!this.enabled || slot === undefined) return;
      e.preventDefault();
      sfx.unlock();
      if (slot === '0') this.p1 = BUFFER_STEPS;
      else this.p2 = BUFFER_STEPS;
    };
    root.addEventListener('pointerdown', power);
    this.off.push(() => root.removeEventListener('pointerdown', power));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    root.addEventListener('mousedown', mdown);
    window.addEventListener('mouseup', mup);
    root.addEventListener('contextmenu', menu);
    this.off.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      root.removeEventListener('mousedown', mdown);
      window.removeEventListener('mouseup', mup);
      root.removeEventListener('contextmenu', menu);
    });
    this.buildTouch();
  }

  /** On-screen joystick and buttons, shown on touch screens. */
  private buildTouch() {
    const wrap = document.createElement('div');
    wrap.className = 'ob-touch';
    if (window.matchMedia?.('(pointer: coarse)').matches) wrap.classList.add('on');
    const stick = document.createElement('div');
    stick.className = 'ob-stick';
    const knob = document.createElement('i');
    stick.appendChild(knob);
    const btns = document.createElement('div');
    btns.className = 'ob-btns';
    const mk = (label: string, cls: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      btns.appendChild(b);
      return b;
    };
    const block = mk('Bloquear', 'blk');
    const atk = mk('Atacar', 'atk');
    const dodge = mk('Esquivar', 'dge');
    wrap.append(stick, btns);
    this.root.appendChild(wrap);

    const moveStick = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let z = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(x, z);
      if (len > 1) {
        x /= len;
        z /= len;
      }
      this.stick.x = x;
      this.stick.z = z;
      knob.style.transform = `translate(${x * 34}px, ${z * 34}px)`;
    };
    stick.addEventListener('pointerdown', (e) => {
      sfx.unlock();
      this.stick.id = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      moveStick(e);
    });
    stick.addEventListener('pointermove', (e) => e.pointerId === this.stick.id && moveStick(e));
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick = { x: 0, z: 0, id: -1 };
      knob.style.transform = '';
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    atk.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      this.atk = BUFFER_STEPS;
    });
    dodge.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dge = BUFFER_STEPS;
    });
    block.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchBlock = true;
      block.classList.add('on');
    });
    const unblock = () => {
      this.touchBlock = false;
      block.classList.remove('on');
    };
    block.addEventListener('pointerup', unblock);
    block.addEventListener('pointerleave', unblock);
    block.addEventListener('pointercancel', unblock);
    // Any touch shows the touch controls, even on hybrid laptops.
    const showTouch = () => wrap.classList.add('on');
    this.root.addEventListener('touchstart', showTouch, { passive: true });
    this.off.push(() => this.root.removeEventListener('touchstart', showTouch));
  }

  /** The input for the next simulation step. */
  sample(): OfficeInput {
    const k = this.keys;
    let mx = this.stick.x;
    let mz = this.stick.z;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('w') || k.has('arrowup')) mz -= 1;
    if (k.has('s') || k.has('arrowdown')) mz += 1;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const input: OfficeInput = {
      seq: ++this.seq,
      mx: this.enabled ? Math.round(mx * 100) / 100 : 0,
      mz: this.enabled ? Math.round(mz * 100) / 100 : 0,
      atk: this.enabled && this.atk > 0,
      blk: this.enabled && (k.has('k') || this.mouseBlock || this.touchBlock),
      dge: this.enabled && this.dge > 0,
      p1: this.enabled && this.p1 > 0,
      p2: this.enabled && this.p2 > 0,
    };
    this.atk = Math.max(0, this.atk - 1);
    this.dge = Math.max(0, this.dge - 1);
    this.p1 = Math.max(0, this.p1 - 1);
    this.p2 = Math.max(0, this.p2 - 1);
    return input;
  }

  /** After a reload mid-fight, continue numbering steps after the last one the server applied. */
  resumeAfter(seq: number) {
    this.seq = Math.max(this.seq, seq);
  }

  dispose() {
    this.off.forEach((f) => f());
    this.root.querySelector('.ob-touch')?.remove();
  }
}
