import { mulberry32 } from '../rng';
import { MF_DT, UNIT_STATS } from './config';
import { magicMap } from './map';
import { MF_NO_INPUT, commanderOf, type MfInput, type MfOrder, type MfUnit, type MfWorld } from './world';

/**
 * A basic AI commander. It gives the same orders a player can (Follow, Attack, Defend, magic
 * volley) and walks behind its own troops, so the enemy army runs on exactly the same rules.
 *
 * - Holds its camp in Defend until enemies come near.
 * - Orders the attack when they do, focusing the closest enemy, and rains volleys on groups.
 * - Falls back to camp with its army when its commander is badly hurt.
 * - If nobody comes for a while, it marches out to find the player.
 */
export class MagicCommanderBot {
  private rnd: () => number;
  private think = 0;
  private order: MfOrder | null = null;
  private lastOrderAt = -99;
  private calmFor = 0;
  private goal = { x: 0, z: 0 };
  private aim = { x: 0, z: 0 };

  /** skill 0..1: reaction time, volley aim and how soon it goes looking for a fight. */
  constructor(
    private team: number,
    private skill = 0.6,
    seed = 7,
  ) {
    this.rnd = mulberry32(seed);
  }

  step(world: MfWorld): MfInput {
    const cmd = commanderOf(world, this.team);
    if (!cmd.alive) return MF_NO_INPUT;
    const input: MfInput = { ...MF_NO_INPUT, aimX: this.aim.x, aimZ: this.aim.z };
    const mine = world.units.filter((u) => u.alive && u.team === this.team && u.kind !== 'commander');
    const foes = world.units.filter((u) => u.alive && u.team !== this.team);
    if (!foes.length) return input;
    const center = mine.length ? centroid(mine) : { x: cmd.x, z: cmd.z };
    const threat = closest(foes, center);
    const threatDist = Math.hypot(threat.x - center.x, threat.z - center.z);

    this.think -= MF_DT;
    if (this.think <= 0) {
      this.think = 0.7 - this.skill * 0.4;
      const camp = magicMap().enemyCamp;
      const hurt = cmd.hp < cmd.maxHp * 0.35;
      const near = threatDist < 26;
      this.calmFor = near ? 0 : this.calmFor + (0.7 - this.skill * 0.4);
      const patience = 50 - this.skill * 30;

      if (hurt) {
        // Fall back to camp with the army around him.
        if (this.order !== 'follow') this.give(world, input, 'follow', camp.x, camp.z);
        this.goal = { x: camp.x, z: camp.z + 4 };
        this.aim = { x: threat.x, z: threat.z };
      } else if (near) {
        // Re-issue the attack now and then so the focus moves to whoever is closest.
        if (this.order !== 'attack' || world.time - this.lastOrderAt > 6) this.give(world, input, 'attack', threat.x, threat.z);
        // Walk a few steps behind our own line, towards the enemy.
        const dx = threat.x - center.x;
        const dz = threat.z - center.z;
        const l = Math.hypot(dx, dz) || 1;
        this.goal = { x: center.x - (dx / l) * 5, z: center.z - (dz / l) * 5 };
        this.aim = { x: threat.x, z: threat.z };
      } else if (this.calmFor > patience) {
        // Nobody came: march out to meet them.
        if (this.order !== 'follow') this.give(world, input, 'follow', threat.x, threat.z);
        const target = commanderOf(world, 1 - this.team);
        this.goal = { x: target.x, z: target.z };
        this.aim = { x: target.x, z: target.z };
      } else {
        if (this.order !== 'defend') {
          const spawn = magicMap().playerSpawn;
          this.give(world, input, 'defend', spawn.x, spawn.z);
        }
        this.goal = { x: camp.x, z: camp.z };
        this.aim = { x: threat.x, z: threat.z };
      }

      // Volley at the thickest group of enemies within reach of our mages.
      const mages = mine.filter((u) => UNIT_STATS[u.kind].ranged);
      if (mages.length && world.armies[this.team]!.volleyCd <= 0 && this.rnd() < 0.35 + this.skill * 0.5) {
        const mc = centroid(mages);
        const range = UNIT_STATS.mage.ranged!.range;
        let best: MfUnit | null = null;
        let bestScore = 1;
        for (const f of foes) {
          if (Math.hypot(f.x - mc.x, f.z - mc.z) > range * 0.95) continue;
          const score = foes.filter((o) => Math.hypot(o.x - f.x, o.z - f.z) < 3).length;
          if (score > bestScore) {
            bestScore = score;
            best = f;
          }
        }
        if (best) {
          const err = (1 - this.skill) * 4;
          input.volley = true;
          input.aimX = best.x + (this.rnd() - 0.5) * err;
          input.aimZ = best.z + (this.rnd() - 0.5) * err;
          return input;
        }
      }
    }

    const gx = this.goal.x - cmd.x;
    const gz = this.goal.z - cmd.z;
    const gl = Math.hypot(gx, gz);
    if (gl > 1.5) {
      input.mx = (gx / gl) * Math.min(1, gl / 4);
      input.mz = (gz / gl) * Math.min(1, gl / 4);
    }
    const close = closest(foes, cmd);
    if (Math.hypot(close.x - cmd.x, close.z - cmd.z) < 2.4) {
      input.aimX = close.x;
      input.aimZ = close.z;
      input.strike = true;
    }
    return input;
  }

  private give(world: MfWorld, input: MfInput, order: MfOrder, ax: number, az: number) {
    input.order = order;
    input.aimX = ax;
    input.aimZ = az;
    this.order = order;
    this.lastOrderAt = world.time;
  }
}

function centroid(us: { x: number; z: number }[]) {
  let x = 0;
  let z = 0;
  for (const u of us) {
    x += u.x;
    z += u.z;
  }
  return { x: x / us.length, z: z / us.length };
}

function closest<T extends { x: number; z: number }>(us: T[], p: { x: number; z: number }): T {
  let best = us[0]!;
  let bd = Infinity;
  for (const u of us) {
    const d = Math.hypot(u.x - p.x, u.z - p.z);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}
