import { ZOMBIE_KINDS, ZOMBIE_NO_INPUT, weaponOf, type Survivor, type ZombieInput, type ZombieView } from './zombies';

/**
 * A practice teammate for Zona Zombi: it sticks close to the leader, fights the closest zombie,
 * blocks some blows and helps fallen teammates up. It never shops, so a human always ends up
 * carrying the team with better weapons.
 */
export class ZombieBot {
  private seq = 0;
  private think = 0;
  private wander = { x: 0, z: 0 };

  constructor(
    private skill = 0.6,
    private rnd: () => number = Math.random,
  ) {}

  /** Friendly fire is always on: don't swing or shoot through a teammate. */
  private mateInTheWay(view: ZombieView, me: Survivor, ux: number, uz: number, range: number) {
    return view.survivors.some((s) => {
      if (s.id === me.id || s.action === 'down' || s.car) return false;
      const dx = s.x - me.x;
      const dz = s.z - me.z;
      const d = Math.hypot(dx, dz);
      return d < range + 0.6 && (dx * ux + dz * uz) / (d || 1) > 0.2;
    });
  }

  step(view: ZombieView, me: Survivor, leaderId: string | null, dt: number): ZombieInput {
    const input: ZombieInput = { ...ZOMBIE_NO_INPUT, seq: ++this.seq };
    if (me.action === 'down' || me.car) return input;
    this.think -= dt;

    // A fallen teammate close by comes first, unless a zombie is right on top of us.
    let closest: ZombieView['zombies'][number] | null = null;
    let cd = Infinity;
    for (const zb of view.zombies) {
      const d = Math.hypot(zb.x - me.x, zb.z - me.z);
      if (d < cd) {
        cd = d;
        closest = zb;
      }
    }
    const fallen = view.survivors.find((s) => s.id !== me.id && s.action === 'down' && Math.hypot(s.x - me.x, s.z - me.z) < 12);
    if (fallen && cd > 2.4) {
      const d = Math.hypot(fallen.x - me.x, fallen.z - me.z);
      if (d > 1.2) {
        input.mx = (fallen.x - me.x) / d;
        input.mz = (fallen.z - me.z) / d;
      } else input.uh = true;
      return input;
    }

    const w = weaponOf(me);
    const reach = w.kind === 'shot' ? 9 : w.kind === 'nova' ? 3 : (w.range ?? 1.6) + 0.3;
    if (closest && cd < 14) {
      const r = ZOMBIE_KINDS[closest.kind].radius;
      const ux = (closest.x - me.x) / (cd || 1);
      const uz = (closest.z - me.z) / (cd || 1);
      // Low on health: keep away and dodge.
      if (me.hp < 30 && cd < 3 && me.dodgeCd <= 0 && this.rnd() < this.skill * 0.2) {
        input.mx = -ux;
        input.mz = -uz;
        input.dge = true;
        return input;
      }
      if (closest.act === 'wind' && cd < r + 1.6 && this.rnd() < this.skill * 0.6) {
        input.blk = true;
        return input;
      }
      if (cd > reach + r) {
        input.mx = ux;
        input.mz = uz;
      } else if (me.cd <= 0 && this.rnd() < 0.35 + this.skill * 0.5 && !this.mateInTheWay(view, me, ux, uz, reach + r)) {
        input.atk = true;
        input.ah = true;
      }
      return input;
    }

    // Nothing to fight: stay near the leader, or stroll around the plaza.
    const leader = view.survivors.find((s) => s.id === leaderId && s.action !== 'down');
    const home = leader ? { x: leader.x, z: leader.z } : this.wander;
    if (this.think <= 0) {
      this.think = 2 + this.rnd() * 2;
      this.wander = { x: (this.rnd() - 0.5) * 10, z: (this.rnd() - 0.5) * 10 };
    }
    const d = Math.hypot(home.x - me.x, home.z - me.z);
    if (d > (leader ? 3.5 : 1)) {
      input.mx = (home.x - me.x) / d;
      input.mz = (home.z - me.z) / d;
    }
    return input;
  }
}
