import { FORMATIONS, type MfSoldierKind, type MfFormation, type MfInput, type MfOrder, type MfSelection, type MfUnit } from '@inbox/shared';
import { sfx } from '../office/sfx';

/** A press stays valid for this many steps, so a quick tap is never lost between steps. */
const BUFFER = 3;

/**
 * Keyboard and mouse for the commander.
 *
 * - WASD walks relative to the camera. The mouse turns the camera and the commander (with the
 *   pointer captured after a click) and moves the aim reticle nearer or farther. Without the
 *   pointer captured, the reticle follows the cursor on the ground and ← → turn the camera.
 * - Left click: the commander's sword. Right click: Attack order on the enemy under the reticle.
 * - Q: Defend here. F: Follow me. E: magic volley at the reticle (mages and dragons).
 * - R: next marching formation (line, wedge, column).
 * - Conquest: Z / X / C train a warrior, mage or dragon; G leaves soldiers in the fortress, H takes them back.
 * - 1, 2, 3 choose warriors, mages or beasts for the next orders; the same key again (or 4) goes
 *   back to the whole army.
 */
export class MagicControls {
  yaw = 0;
  aimDist = 11;
  locked = false;
  selection: MfSelection = 'all';
  formation: MfFormation = 'line';
  private formationPick: MfFormation | null = null;
  private buy: MfSoldierKind | null = null;
  private garrison: 'leave' | 'recall' | null = null;
  /** Messages for the HUD (e.g. beasts are not in this version). */
  onNotice: ((text: string) => void) | null = null;
  onLock: ((locked: boolean) => void) | null = null;
  enabled = true;
  private keys = new Set<string>();
  private strike = 0;
  private order: { o: MfOrder; n: number } | null = null;
  private select: MfSelection | null = null;
  private volley = 0;
  private cursor: { x: number; y: number } | null = null;
  private off: (() => void)[] = [];

  constructor(private root: HTMLElement, startYaw: number) {
    this.yaw = startYaw;
    const game = ['w', 'a', 's', 'd', 'q', 'e', 'f', 'r', 'z', 'x', 'c', 'g', 'h', '1', '2', '3', '4', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
    const down = (e: KeyboardEvent) => {
      if (!this.enabled || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (game.includes(k)) e.preventDefault();
      sfx.unlock();
      if (!e.repeat) {
        if (k === 'q') this.order = { o: 'defend', n: BUFFER };
        if (k === 'f') this.order = { o: 'follow', n: BUFFER };
        if (k === 'e') this.volley = BUFFER;
        if (k === 'z') this.buy = 'warrior';
        if (k === 'x') this.buy = 'mage';
        if (k === 'c') this.buy = 'beast';
        if (k === 'g') this.garrison = 'leave';
        if (k === 'h') this.garrison = 'recall';
        if (k === 'r') {
          this.formation = FORMATIONS[(FORMATIONS.indexOf(this.formation) + 1) % FORMATIONS.length]!;
          this.formationPick = this.formation;
        }
        if (k === '1' || k === '2' || k === '3' || k === '4') this.pick(k);
      }
      this.keys.add(k);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => this.keys.clear();
    const mdown = (e: MouseEvent) => {
      if (!this.enabled) return;
      sfx.unlock();
      root.focus({ preventScroll: true });
      if (e.button === 2) {
        this.order = { o: 'attack', n: BUFFER };
        return;
      }
      if (e.button !== 0) return;
      if (!this.locked) {
        try {
          void (root.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
        } catch {
          /* not available: keep aiming with the cursor */
        }
      }
      this.strike = BUFFER;
    };
    const move = (e: MouseEvent) => {
      if (this.locked) {
        this.yaw -= e.movementX * 0.0026;
        this.aimDist = Math.max(4, Math.min(24, this.aimDist - e.movementY * 0.045));
      } else {
        const r = root.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) this.cursor = { x: e.clientX, y: e.clientY };
      }
    };
    const lock = () => {
      this.locked = document.pointerLockElement === root;
      this.onLock?.(this.locked);
    };
    const menu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lock);
    root.addEventListener('mousedown', mdown);
    root.addEventListener('contextmenu', menu);
    this.off.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lock);
      root.removeEventListener('mousedown', mdown);
      root.removeEventListener('contextmenu', menu);
      if (document.pointerLockElement === root) document.exitPointerLock();
    });
  }

  private pick(k: string) {
    const kind: MfSelection = k === '1' ? 'warrior' : k === '2' ? 'mage' : k === '3' ? 'beast' : 'all';
    this.selection = this.selection === kind ? 'all' : kind;
    this.select = this.selection;
  }

  /** For demos: press an order or volley as if from the keyboard. */
  press(what: MfOrder | 'volley' | 'strike') {
    if (what === 'volley') this.volley = BUFFER;
    else if (what === 'strike') this.strike = BUFFER;
    else this.order = { o: what, n: BUFFER };
  }

  /**
   * One step of input. `cursorGround` turns a screen point into a ground point (when the pointer
   * is not captured). Movement is relative to the camera.
   */
  sample(cmd: MfUnit, dt: number, cursorGround: (x: number, y: number) => { x: number; z: number } | null): MfInput {
    const k = this.keys;
    if (k.has('arrowleft')) this.yaw += dt * 2.2;
    if (k.has('arrowright')) this.yaw -= dt * 2.2;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // Screen right when looking along (fx, fz) is (-fz... ) in this right-handed world: (-cos, sin).
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    let mx = fx * f + rx * s;
    let mz = fz * f + rz * s;
    const l = Math.hypot(mx, mz);
    if (l > 1) {
      mx /= l;
      mz /= l;
    }
    let aimX = cmd.x + fx * this.aimDist;
    let aimZ = cmd.z + fz * this.aimDist;
    if (!this.locked && this.cursor) {
      const g = cursorGround(this.cursor.x, this.cursor.y);
      if (g) {
        aimX = g.x;
        aimZ = g.z;
      }
    }
    const input: MfInput = {
      mx,
      mz,
      aimX,
      aimZ,
      strike: this.strike > 0,
      order: this.order ? this.order.o : null,
      select: this.select,
      volley: this.volley > 0,
      formation: this.formationPick,
      buy: this.buy,
      garrison: this.garrison,
    };
    this.formationPick = null;
    this.buy = null;
    this.garrison = null;
    // One-shot presses are consumed as soon as they are sent.
    if (input.order) this.order = null;
    if (input.volley) this.volley = 0;
    if (input.strike) this.strike = 0;
    this.select = null;
    return input;
  }

  get aim() {
    return this.aimDist;
  }

  dispose() {
    this.off.forEach((f) => f());
  }
}
