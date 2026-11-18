import {
  ZOMBIE_TICK_MS,
  cloneSurvivor,
  driveVehicle,
  moveSurvivor,
  unpackZombieWorld,
  type Survivor,
  type Vehicle,
  type ZombieFrame,
  type ZombieInput,
  type ZombieInputBatch,
  type ZombieView,
} from '@inbox/shared';
import { ZombieArena, type TeamInfo } from './arena';
import { ZombieControls } from './input';
import { wireShopping } from './digits';
import { sfx } from '../office/sfx';

/** How far in the past others are drawn, so there are always two server frames to blend. */
const INTERP_DELAY_MS = 120;
const STEPS_PER_SEND = 2;

export interface OnlineZombiesOptions {
  matchId: string;
  meId: string;
  team: TeamInfo[];
  startAt: number;
  endAt: number;
  serverNow: () => number;
  send: (batch: ZombieInputBatch) => void;
}

interface Snap {
  at: number;
  view: ZombieView;
}

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}
function lerpAngle(a: number, b: number, k: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}

/**
 * Client side of an online match. The server decides everything; this class sends inputs,
 * predicts your own movement (on foot or driving) with the same rules so it feels instant,
 * corrects it with each frame, and draws everyone else slightly in the past.
 */
export class OnlineZombies {
  readonly arena: ZombieArena;
  private controls: ZombieControls;
  private snaps: Snap[] = [];
  private latest: ZombieFrame | null = null;
  private me: Survivor | null = null;
  private car: Vehicle | null = null;
  private prev: { x: number; z: number } | null = null;
  private pending: ZombieInput[] = [];
  private outbox: ZombieInput[] = [];
  private step = 0;
  private raf = 0;
  private offset = { x: 0, z: 0 };
  private lastBeep = -1;
  private seenTick = -1;

  constructor(container: HTMLElement, private opts: OnlineZombiesOptions) {
    this.arena = new ZombieArena(container, opts.team);
    this.controls = new ZombieControls(container);
    wireShopping(this.arena.hud, this.controls, () => this.me);
    document.addEventListener('visibilitychange', this.onHidden);
    // Someone who joins mid-match starts counting steps from now.
    const now = opts.serverNow();
    if (now > opts.startAt) this.step = Math.floor((now - opts.startAt) / ZOMBIE_TICK_MS);
    this.raf = requestAnimationFrame(this.frame);
  }

  setClock(startAt: number, endAt: number) {
    this.opts.startAt = startAt;
    this.opts.endAt = endAt;
  }

  setTeam(team: TeamInfo[]) {
    this.arena.setTeam(team);
  }

  onFrame(frame: ZombieFrame) {
    if (frame.tick <= this.seenTick && this.seenTick > 0) return;
    this.seenTick = frame.tick;
    this.latest = frame;
    this.snaps.push({ at: frame.at, view: unpackZombieWorld(frame.world) });
    if (this.snaps.length > 30) this.snaps.shift();
    this.arena.events(frame.events);
    this.reconcile(frame);
  }

  private reconcile(frame: ZombieFrame) {
    const server = frame.world.survivors.find((s) => s.id === this.opts.meId);
    if (!server) return;
    const before = this.me ? (this.car ? { x: this.car.x, z: this.car.z } : { x: this.me.x, z: this.me.z }) : null;
    const ack = frame.ack[this.opts.meId] ?? 0;
    this.controls.resumeAfter(ack);
    this.pending = this.pending.filter((i) => i.seq > ack);
    const me = cloneSurvivor(server);
    const serverCar = me.car ? frame.world.cars.find((c) => c.id === me.car) : null;
    const car = serverCar ? { ...serverCar } : null;
    const zombies = this.snaps[this.snaps.length - 1]!.view.zombies;
    for (const input of this.pending) {
      if (car) driveVehicle(car, input);
      else moveSurvivor(me, input, zombies);
    }
    if (car) {
      me.x = car.x;
      me.z = car.z;
    }
    const after = car ? { x: car.x, z: car.z } : { x: me.x, z: me.z };
    if (before && !!car === !!this.car && me.action !== 'down') {
      const dx = before.x - after.x;
      const dz = before.z - after.z;
      if (Math.hypot(dx, dz) < 2.5) {
        this.offset.x += dx;
        this.offset.z += dz;
      } else this.offset = { x: 0, z: 0 };
    } else this.offset = { x: 0, z: 0 };
    this.me = me;
    this.car = car;
  }

  private onHidden = () => {
    if (document.visibilityState === 'hidden' && this.me) {
      const stop: ZombieInput = { ...this.controls.sample(), mx: 0, mz: 0, ah: false, blk: false, uh: false };
      this.pending.push(stop);
      this.opts.send({ matchId: this.opts.matchId, inputs: [stop] });
    }
  };

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const now = this.opts.serverNow();
    const { startAt, endAt } = this.opts;
    if (now < startAt) {
      const n = Math.ceil((startAt - now) / 1000);
      if (n !== this.lastBeep && n <= 3) {
        this.lastBeep = n;
        this.arena.hud.banner(String(n), 'Compra armas antes de que lleguen', 0);
        sfx.beep();
      }
    } else if (this.lastBeep > 0) {
      this.lastBeep = 0;
      this.arena.hud.banner('¡A sobrevivir!', '', 900);
      sfx.go();
    }

    const over = !!this.latest?.world.over;
    if (now >= startAt && now < endAt && !over) {
      const target = Math.floor((now - startAt) / ZOMBIE_TICK_MS);
      if (target - this.step > 5) this.step = target - 5;
      const zombies = this.snaps.length ? this.snaps[this.snaps.length - 1]!.view.zombies : [];
      while (this.step < target) {
        this.step++;
        const input = this.controls.sample();
        this.pending.push(input);
        this.outbox.push(input);
        if (this.me) {
          if (this.car) {
            this.prev = { x: this.car.x, z: this.car.z };
            driveVehicle(this.car, input);
            this.me.x = this.car.x;
            this.me.z = this.car.z;
            this.me.facing = this.car.h;
          } else {
            this.prev = { x: this.me.x, z: this.me.z };
            moveSurvivor(this.me, input, zombies);
          }
        }
        if (this.outbox.length >= STEPS_PER_SEND || input.buy >= 0 || input.use || input.sel >= 0) this.flush();
      }
      if (this.pending.length > 90) this.pending.splice(0, this.pending.length - 90);
    }
    const view = this.view(now);
    if (view) this.arena.render(view);
  };

  private flush() {
    if (!this.outbox.length) return;
    this.opts.send({ matchId: this.opts.matchId, inputs: this.outbox });
    this.outbox = [];
  }

  private view(now: number): ZombieView | null {
    if (!this.latest || !this.snaps.length) return null;
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
    const last = this.snaps[this.snaps.length - 1]!.view;
    this.offset.x *= 0.85;
    this.offset.z *= 0.85;
    const stepAt = this.opts.startAt + this.step * ZOMBIE_TICK_MS;
    const alpha = Math.max(0, Math.min(1, (now - stepAt) / ZOMBIE_TICK_MS));
    const mine = this.me && this.prev ? { x: lerp(this.prev.x, this.car ? this.car.x : this.me.x, alpha) + this.offset.x, z: lerp(this.prev.z, this.car ? this.car.z : this.me.z, alpha) + this.offset.z } : null;

    const survivors = last.survivors.map((s) => {
      if (s.id === this.opts.meId && this.me && mine) {
        // Position, facing and action are predicted; money, weapons and health come from the server.
        return { ...s, x: mine.x, z: mine.z, facing: this.car ? this.car.h : this.me.facing, action: s.car || s.action === 'down' ? s.action : this.me.action, t: s.car || s.action === 'down' ? s.t : this.me.t };
      }
      const sa = a.view.survivors.find((x) => x.id === s.id);
      const sb = b.view.survivors.find((x) => x.id === s.id);
      if (!sa || !sb || Math.hypot(sb.x - sa.x, sb.z - sa.z) > 4) return s;
      return { ...s, x: lerp(sa.x, sb.x, k), z: lerp(sa.z, sb.z, k), facing: lerpAngle(sa.facing, sb.facing, k) };
    });
    const zombies = b.view.zombies.map((z) => {
      const za = a.view.zombies.find((x) => x.id === z.id);
      return za ? { ...z, x: lerp(za.x, z.x, k), z: lerp(za.z, z.z, k), h: lerpAngle(za.h, z.h, k) } : z;
    });
    const cars = last.cars.map((c) => {
      if (this.car && c.id === this.car.id && mine) return { ...c, x: mine.x, z: mine.z, h: this.car.h, v: this.car.v };
      const ca = a.view.cars.find((x) => x.id === c.id);
      const cb = b.view.cars.find((x) => x.id === c.id);
      return ca && cb ? { ...c, x: lerp(ca.x, cb.x, k), z: lerp(ca.z, cb.z, k), h: lerpAngle(ca.h, cb.h, k) } : c;
    });
    const shots = b.view.shots.map((p) => {
      const pa = a.view.shots.find((x) => x.id === p.id);
      return pa ? { ...p, x: lerp(pa.x, p.x, k), z: lerp(pa.z, p.z, k) } : p;
    });
    return { ...last, survivors, zombies: b === a ? zombies : zombies, cars, shots };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.controls.dispose();
    this.arena.dispose();
  }
}
