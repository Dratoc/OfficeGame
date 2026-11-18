import { ZOMBIE_NO_INPUT, type ZombieInput } from '@inbox/shared';
import { sfx } from '../office/sfx';

/** A press stays valid for this many steps, so a quick tap is never lost between steps. */
const BUFFER_STEPS = 3;

/**
 * Keyboard, mouse and touch controls for Zona Zombi, sampled once per simulation step. Same as
 * Office Battle for fighting (WASD, J or click to attack, K or right click to block, Space to dodge),
 * plus E to use (vehicles, doors, helping teammates), Q to switch weapons and the number keys to
 * buy at a shop or pick a weapon. The game decides what a number means through `onDigit`.
 */
export class ZombieControls {
  private keys = new Set<string>();
  private atk = 0;
  private dge = 0;
  private use = 0;
  private cyc = 0;
  private sel = -1;
  private buy = -1;
  private mouseAtk = false;
  private mouseBlk = false;
  private touch = { atk: false, blk: false, use: false };
  private stick = { x: 0, z: 0, id: -1 };
  private seq = 0;
  private off: (() => void)[] = [];
  enabled = true;
  /** A number key (1 to 9, 0 for 10) was pressed. */
  onDigit: ((n: number) => void) | null = null;

  constructor(private root: HTMLElement) {
    const down = (e: KeyboardEvent) => {
      if (!this.enabled || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'j', 'k', 'l', 'q', 'e', 'shift'].includes(k)) e.preventDefault();
      sfx.unlock();
      if (!e.repeat) {
        if (k === 'j') this.atk = BUFFER_STEPS;
        if (k === ' ' || k === 'l' || k === 'shift') this.dge = BUFFER_STEPS;
        if (k === 'e') this.use = BUFFER_STEPS;
        if (k === 'q') this.cyc = BUFFER_STEPS;
        if (/^[0-9]$/.test(k)) {
          e.preventDefault();
          this.onDigit?.(k === '0' ? 10 : Number(k));
        }
      }
      this.keys.add(k);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => {
      this.keys.clear();
      this.mouseAtk = this.mouseBlk = false;
    };
    const mdown = (e: MouseEvent) => {
      if (!this.enabled || (e.target as HTMLElement).closest('.zz-touch, .zz-shop, .zz-slots')) return;
      sfx.unlock();
      if (e.button === 0) {
        this.atk = BUFFER_STEPS;
        this.mouseAtk = true;
      }
      if (e.button === 2) this.mouseBlk = true;
    };
    const mup = (e: MouseEvent) => {
      if (e.button === 0) this.mouseAtk = false;
      if (e.button === 2) this.mouseBlk = false;
    };
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
    wrap.className = 'zz-touch';
    const show = () => {
      wrap.classList.add('on');
      this.root.classList.add('zz-touching');
    };
    if (window.matchMedia?.('(pointer: coarse)').matches) show();
    const pad = document.createElement('div');
    pad.className = 'zz-stick';
    const knob = document.createElement('i');
    pad.appendChild(knob);
    const btns = document.createElement('div');
    btns.className = 'zz-btns';
    const mk = (label: string, cls: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      btns.appendChild(b);
      return b;
    };
    const blk = mk('Bloquear', 'blk');
    const atk = mk('Atacar', 'atk');
    const dge = mk('Esquivar', 'dge');
    const use = mk('Usar', 'use');
    const cyc = mk('Arma', 'cyc');
    wrap.append(pad, btns);
    this.root.appendChild(wrap);

    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      const r = pad.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.stick.x = Math.abs(dx) < 0.12 ? 0 : dx;
      this.stick.z = Math.abs(dy) < 0.12 ? 0 : dy;
      knob.style.transform = `translate(${dx * r.width * 0.31}px, ${dy * r.width * 0.31}px)`;
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
    const hold = (b: HTMLButtonElement, key: 'atk' | 'blk' | 'use', press?: () => void) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sfx.unlock();
        this.touch[key] = true;
        b.classList.add('on');
        press?.();
      });
      const stop = () => {
        this.touch[key] = false;
        b.classList.remove('on');
      };
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointerleave', stop);
      b.addEventListener('pointercancel', stop);
    };
    hold(atk, 'atk', () => (this.atk = BUFFER_STEPS));
    hold(blk, 'blk');
    hold(use, 'use', () => (this.use = BUFFER_STEPS));
    dge.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dge = BUFFER_STEPS;
    });
    cyc.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cyc = BUFFER_STEPS;
    });
    this.root.addEventListener('touchstart', show, { passive: true });
    this.off.push(() => this.root.removeEventListener('touchstart', show));
  }

  /** Buy a shop item (index in SHOP) with the next step. */
  queueBuy(index: number) {
    this.buy = index;
  }

  /** Pick a weapon (index in WEAPON_IDS) with the next step. */
  queueWeapon(index: number) {
    this.sel = index;
  }

  /** The input for the next simulation step. */
  sample(): ZombieInput {
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
    const on = this.enabled;
    const input: ZombieInput = {
      ...ZOMBIE_NO_INPUT,
      seq: ++this.seq,
      mx: on ? Math.round(mx * 100) / 100 : 0,
      mz: on ? Math.round(mz * 100) / 100 : 0,
      atk: on && this.atk > 0,
      ah: on && (k.has('j') || this.mouseAtk || this.touch.atk || this.atk > 0),
      blk: on && (k.has('k') || this.mouseBlk || this.touch.blk),
      dge: on && this.dge > 0,
      use: on && this.use === BUFFER_STEPS,
      uh: on && (k.has('e') || this.touch.use),
      cyc: on && this.cyc === BUFFER_STEPS,
      sel: on ? this.sel : -1,
      buy: on ? this.buy : -1,
    };
    this.atk = Math.max(0, this.atk - 1);
    this.dge = Math.max(0, this.dge - 1);
    this.use = Math.max(0, this.use - 1);
    this.cyc = Math.max(0, this.cyc - 1);
    this.sel = -1;
    this.buy = -1;
    return input;
  }

  resumeAfter(seq: number) {
    this.seq = Math.max(this.seq, seq);
  }

  dispose() {
    this.off.forEach((f) => f());
    this.root.querySelector('.zz-touch')?.remove();
    this.root.classList.remove('zz-touching');
  }
}
