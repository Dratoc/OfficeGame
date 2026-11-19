import {
  MF_DT,
  MF_TICK_MS,
  encodeMagicInput,
  magicMap,
  predictCommander,
  unpackMagicWorld,
  type MagicFrame,
  type MagicInputBatch,
  type MagicNetInput,
  type MfInput,
  type MfUnit,
  type MfWorld,
} from '@inbox/shared';
import { sfx } from '../office/sfx';
import { MagicArena } from './arena';
import { MagicControls } from './input';

/** How far in the past the battle is drawn, so there are always two server pictures to blend. */
const INTERP_DELAY_MS = 110;
/** Input steps sent together (presses go out at once). */
const STEPS_PER_SEND = 2;

export interface OnlineMagicOptions {
  matchId: string;
  meId: string;
  startAt: number;
  endAt: number;
  serverNow: () => number;
  send: (batch: MagicInputBatch) => void;
}

interface Snap {
  at: number;
  world: MfWorld;
}

interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * Client side of an online Magic Frontiers match. The server runs the battle; this class sends your
 * commander's input, predicts your commander's walk with the same rules so it answers at once,
 * corrects it with each picture from the server, and draws everything else slightly in the past.
 */
export class OnlineMagic {
  private arena: MagicArena | null = null;
  private controls: MagicControls;
  private myTeam = -1;
  private snaps: Snap[] = [];
  private latest: MagicFrame | null = null;
  private me: Body | null = null;
  private prevMe: Body | null = null;
  private offset = { x: 0, z: 0 };
  private pending: { seq: number; input: MfInput }[] = [];
  private outbox: MagicNetInput[] = [];
  private seq = 0;
  private step = 0;
  private raf = 0;
  private lastBeep = -1;
  private seenTick = -1;
  private ended = false;
  private aim = { x: 0, z: 0 };

  constructor(
    private container: HTMLElement,
    private opts: OnlineMagicOptions,
  ) {
    this.controls = new MagicControls(container, 0);
    this.controls.enabled = false;
    const now = opts.serverNow();
    if (now > opts.startAt) this.step = Math.floor((now - opts.startAt) / MF_TICK_MS);
    this.raf = requestAnimationFrame(this.frame);
  }

  setClock(startAt: number, endAt: number) {
    this.opts.startAt = startAt;
    this.opts.endAt = endAt;
  }

  onFrame(frame: MagicFrame) {
    if (frame.tick < this.seenTick) return;
    this.seenTick = frame.tick;
    if (!this.arena) this.setup(frame);
    const world = unpackMagicWorld(frame.world);
    this.latest = frame;
    this.snaps.push({ at: frame.at, world });
    if (this.snaps.length > 30) this.snaps.shift();
    this.arena!.events(world, frame.events);
    this.reconcile(frame, world);
  }

  /** The first picture says which army is yours; the arena is built for that side. */
  private setup(frame: MagicFrame) {
    const team = frame.teams.indexOf(this.opts.meId);
    this.myTeam = team >= 0 ? team : 0;
    const map = magicMap(frame.world.mode);
    this.arena = new MagicArena(this.container, frame.world.mode, this.myTeam);
    this.controls.yaw = (this.myTeam === 0 ? map.playerSpawn : map.enemyCamp).facing;
    this.controls.enabled = team >= 0;
    this.controls.onNotice = (t) => this.arena?.hud.toast(t);
    this.controls.onLock = (l) => this.arena?.hud.setPointerLocked(l);
    this.arena.hud.banner('Conquista en línea', 'Toma las fortalezas A, B y C antes que tu rival. Gana quien llegue primero a 300 puntos', 4200);
  }

  private commander(world: MfWorld): MfUnit | null {
    const army = world.armies[this.myTeam];
    return army ? (world.units[army.commander - 1] ?? null) : null;
  }

  private reconcile(frame: MagicFrame, world: MfWorld) {
    const server = this.commander(world);
    const ack = frame.ack[this.opts.meId] ?? 0;
    this.pending = this.pending.filter((p) => p.seq > ack);
    if (!server || !server.alive) {
      this.me = null;
      this.prevMe = null;
      this.offset = { x: 0, z: 0 };
      return;
    }
    const before = this.me ? { x: this.me.x, z: this.me.z } : null;
    const me: Body = { x: server.x, z: server.z, vx: server.vx, vz: server.vz, facing: server.facing };
    for (const p of this.pending) predictCommander(me, p.input, world.mode);
    if (before) {
      // Fold the correction into an offset that fades, so the commander never jumps.
      const dx = before.x - me.x;
      const dz = before.z - me.z;
      if (Math.hypot(dx, dz) < 3) {
        this.offset.x += dx;
        this.offset.z += dz;
      } else this.offset = { x: 0, z: 0 };
    }
    this.me = me;
    if (!this.prevMe) this.prevMe = { ...me };
  }

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const now = this.opts.serverNow();
    const { startAt, endAt } = this.opts;
    const hud = this.arena?.hud;
    if (hud && now < startAt) {
      const n = Math.ceil((startAt - now) / 1000);
      if (n !== this.lastBeep && n <= 3) {
        this.lastBeep = n;
        hud.banner(String(n), 'Prepara a tu ejército', 0);
        sfx.beep();
      }
    } else if (hud && this.lastBeep > 0) {
      this.lastBeep = 0;
      hud.banner('¡A conquistar!', '', 900);
      sfx.go();
    }

    const latest = this.snaps.length ? this.snaps[this.snaps.length - 1]!.world : null;
    const over = !!latest?.over;
    if (this.arena && this.myTeam >= 0 && now >= startAt && now < endAt && !over) {
      const target = Math.floor((now - startAt) / MF_TICK_MS);
      if (target - this.step > 5) this.step = target - 5;
      while (this.step < target) {
        this.step++;
        const at = this.me ?? (latest ? this.commander(latest) : null) ?? { x: 0, z: 0 };
        const input = this.controls.sample(at as MfUnit, MF_DT, (x, y) => this.arena!.groundAt(x, y));
        this.aim = { x: input.aimX, z: input.aimZ };
        const seq = ++this.seq;
        this.pending.push({ seq, input });
        this.outbox.push(encodeMagicInput(input, seq));
        if (this.me && latest) {
          this.prevMe = { ...this.me };
          predictCommander(this.me, input, latest.mode);
        }
        const press = input.order || input.volley || input.strike || input.buy || input.garrison || input.formation || input.select;
        if (this.outbox.length >= STEPS_PER_SEND || press) this.flush();
      }
      if (this.pending.length > 90) this.pending.splice(0, this.pending.length - 90);
    }

    if (over && !this.ended && latest && this.arena) {
      this.ended = true;
      this.flush();
      const won = latest.winner === this.myTeam;
      if (won) sfx.go();
      else sfx.ko();
      this.arena.hud.banner(latest.winner === -1 ? 'Empate' : won ? '¡Victoria!' : 'Derrota', won ? 'Tus fortalezas te dieron la victoria' : latest.winner === -1 ? 'Los dos ejércitos terminaron igualados' : 'Tu rival llegó primero a los puntos', 0, won ? 'mf-win' : 'mf-lose');
    }
    this.draw(now);
  };

  private flush() {
    if (!this.outbox.length) return;
    this.opts.send({ matchId: this.opts.matchId, inputs: this.outbox });
    this.outbox = [];
  }

  /** Blends the two server pictures around the render time, with your own commander predicted. */
  private draw(now: number) {
    if (!this.arena || !this.snaps.length) return;
    const renderAt = now - INTERP_DELAY_MS;
    let a = this.snaps[0]!;
    let b = this.snaps[this.snaps.length - 1]!;
    for (let i = this.snaps.length - 1; i > 0; i--) {
      if (this.snaps[i - 1]!.at <= renderAt) {
        a = this.snaps[i - 1]!;
        b = this.snaps[i]!;
        break;
      }
    }
    const k = b.at > a.at ? Math.max(0, Math.min(1, (renderAt - a.at) / (b.at - a.at))) : 1;
    // The HUD (gold, points, orders) reads the newest picture; positions come from the blend.
    const last = this.snaps[this.snaps.length - 1]!.world;
    const prev = new Map<number, { x: number; z: number }>();
    const units = last.units.map((u) => {
      const ua = a.world.units[u.id - 1];
      const ub = b.world.units[u.id - 1];
      if (!ua || !ub || Math.hypot(ub.x - ua.x, ub.z - ua.z) > 6) return u;
      prev.set(u.id, { x: ua.x, z: ua.z });
      return { ...u, x: ub.x, z: ub.z, vx: ub.vx, vz: ub.vz, facing: lerpAngle(ua.facing, ub.facing, k) };
    });
    const mine = this.commander(last);
    if (mine && mine.alive && this.me && this.prevMe) {
      const alpha = Math.max(0, Math.min(1, (now - (this.opts.startAt + this.step * MF_TICK_MS)) / MF_TICK_MS));
      this.offset.x *= 0.85;
      this.offset.z *= 0.85;
      const x = lerp(this.prevMe.x, this.me.x, alpha) + this.offset.x;
      const z = lerp(this.prevMe.z, this.me.z, alpha) + this.offset.z;
      units[mine.id - 1] = { ...units[mine.id - 1]!, x, z, vx: this.me.vx, vz: this.me.vz, facing: this.me.facing };
      prev.delete(mine.id);
    }
    const projectiles = b.world.projectiles.map((p) => {
      const pa = a.world.projectiles.find((q) => q.id === p.id);
      return pa ? { ...p, x: lerp(pa.x, p.x, k), y: lerp(pa.y, p.y, k), z: lerp(pa.z, p.z, k) } : p;
    });
    const view: MfWorld = { ...last, units, projectiles };
    const cmd = view.units[(view.armies[this.myTeam]?.commander ?? 1) - 1]!;
    const aim = this.aim.x || this.aim.z ? this.aim : { x: cmd.x, z: cmd.z + 10 };
    this.arena.render(view, k, prev, { yaw: this.controls.yaw, aimX: aim.x, aimZ: aim.z });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.arena?.dispose();
  }
}
