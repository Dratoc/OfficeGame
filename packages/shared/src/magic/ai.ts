import { mulberry32 } from '../rng';
import { ARMY, MF_DT, RECRUIT, UNIT_STATS, type MfSoldierKind } from './config';
import { capacityWithQueue, insideFort, recruitPoints } from './conquest';
import { magicMap } from './map';
import { MF_NO_INPUT, commanderOf, type MfFort, type MfInput, type MfOrder, type MfUnit, type MfWorld } from './world';

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

/**
 * AI commander for a full conquest match. Same orders and the same economy as the player:
 * - Spends its gold on a mix of warriors, mages and (when rich) dragons.
 * - Marches on the nearest fortress it does not hold, breaks the gates of enemy fortresses,
 *   stands inside until the flag turns, and leaves a small garrison when its army is big enough.
 * - Fights any enemy army that comes close, with volleys on the thickest groups.
 * - Falls back to its closest fortress (or camp) when its commander is badly hurt.
 */
export class MagicConquestBot {
  private rnd: () => number;
  private think = 0;
  private order: MfOrder | null = null;
  private lastOrderAt = -99;
  private goal = { x: 0, z: 0 };
  private aim = { x: 0, z: 0 };
  private targetFort = -1;

  constructor(
    private team: number,
    private skill = 0.6,
    seed = 11,
  ) {
    this.rnd = mulberry32(seed);
  }

  step(world: MfWorld): MfInput {
    const cmd = commanderOf(world, this.team);
    const input: MfInput = { ...MF_NO_INPUT, aimX: this.aim.x, aimZ: this.aim.z };
    this.think -= MF_DT;
    if (this.think > 0) return this.walk(world, cmd, input);
    this.think = 0.6 - this.skill * 0.3;

    // Shopping first: it works even while the commander is down.
    input.buy = this.shopping(world);
    if (!cmd.alive) return input;

    const mine = world.units.filter((u) => u.alive && u.team === this.team && u.kind !== 'commander' && u.kind !== 'gate' && u.garrison < 0);
    const foes = world.units.filter((u) => u.alive && u.team !== this.team && u.team >= 0 && u.kind !== 'gate');
    const center = mine.length ? centroid(mine) : { x: cmd.x, z: cmd.z };
    const threat = foes.length ? closest(foes, center) : null;
    const threatDist = threat ? Math.hypot(threat.x - center.x, threat.z - center.z) : 99;

    if (cmd.hp < cmd.maxHp * 0.3) {
      const safe = recruitPoints(world, this.team).reduce((b, p) => (Math.hypot(p.x - cmd.x, p.z - cmd.z) < Math.hypot(b.x - cmd.x, b.z - cmd.z) ? p : b));
      if (this.order !== 'follow') this.give(world, input, 'follow', safe.x, safe.z);
      this.goal = { x: safe.x, z: safe.z };
      return this.walk(world, cmd, input);
    }

    // Fight only when it is worth it (or when caught): an outnumbered army falls back to regroup.
    const strength = (us: MfUnit[]) => us.reduce((n, u) => n + u.hp * (u.kind === 'beast' ? 1.4 : u.kind === 'mage' ? 1.6 : 1), 0);
    const ours = strength(mine) + cmd.hp * 0.5;
    const theirs = threat ? strength(foes.filter((f) => Math.hypot(f.x - threat.x, f.z - threat.z) < 14)) : 0;
    if (threat && threatDist < 22 && ours < theirs * 0.7 && threatDist > 7) {
      const points = recruitPoints(world, this.team);
      const safe = points.reduce((b, p) => (Math.hypot(p.x - threat.x, p.z - threat.z) - Math.hypot(p.x - cmd.x, p.z - cmd.z) * 0.3 > Math.hypot(b.x - threat.x, b.z - threat.z) - Math.hypot(b.x - cmd.x, b.z - cmd.z) * 0.3 ? p : b));
      if (this.order !== 'follow') this.give(world, input, 'follow', safe.x, safe.z);
      this.goal = { x: safe.x, z: safe.z };
      this.aim = { x: threat.x, z: threat.z };
      return this.walk(world, cmd, input);
    }

    if (threat && threatDist < 22) {
      if (this.order !== 'attack' || world.time - this.lastOrderAt > 6) this.give(world, input, 'attack', threat.x, threat.z);
      const dx = threat.x - center.x;
      const dz = threat.z - center.z;
      const l = Math.hypot(dx, dz) || 1;
      this.goal = { x: center.x - (dx / l) * 5, z: center.z - (dz / l) * 5 };
      this.aim = { x: threat.x, z: threat.z };
      const v = volleyAt(world, this.team, mine, foes, this.skill, this.rnd);
      if (v) Object.assign(input, { volley: true, aimX: v.x, aimZ: v.z });
      return this.walk(world, cmd, input);
    }

    // Pick a fortress to take: the nearest one we don't hold (enemy ones count a bit farther).
    const options = world.forts.filter((f) => f.owner !== this.team);
    if (!options.length) {
      // We hold all three: wait in the one closest to the enemy camp.
      const map = magicMap('conquest');
      const enemyCamp = this.team === 0 ? map.enemyCamp : map.playerSpawn;
      const hold = closest(world.forts, enemyCamp);
      if (this.order !== 'follow') this.give(world, input, 'follow', hold.x, hold.z);
      this.goal = { x: hold.x, z: hold.z };
      return this.walk(world, cmd, input);
    }
    // Nearest first, enemy-held ones count farther, and stay away from a stronger enemy army.
    const foeCenter = foes.length ? centroid(foes) : null;
    const allTheirs = strength(foes);
    const score = (f: MfFort) =>
      Math.hypot(f.x - cmd.x, f.z - cmd.z) + (f.owner >= 0 ? 15 : 0) + (foeCenter && ours < allTheirs * 1.2 ? Math.max(0, 30 - Math.hypot(f.x - foeCenter.x, f.z - foeCenter.z)) * 2 : 0);
    if (!options.some((f) => f.id === this.targetFort) || world.tick % 300 === 0) this.targetFort = options.reduce((b, f) => (score(f) < score(b) ? f : b)).id;
    const fort = world.forts[this.targetFort]!;
    const inside = insideFort(fort, cmd, 1.5);
    // A standing enemy gate on our way: break it.
    const gates = fort.gates.map((id) => world.units[id - 1]!).filter((g) => g.alive && g.team !== this.team);
    const gate = gates.length ? closest(gates, cmd) : null;
    const dFort = Math.hypot(fort.x - cmd.x, fort.z - cmd.z);
    if (gate && !inside && dFort < fort.half + 14) {
      if (this.order !== 'attack' || world.time - this.lastOrderAt > 5) this.give(world, input, 'attack', gate.x, gate.z);
      const dx = gate.x - fort.x;
      const dz = gate.z - fort.z;
      const l = Math.hypot(dx, dz) || 1;
      this.goal = { x: gate.x + (dx / l) * 6, z: gate.z + (dz / l) * 6 };
      this.aim = { x: gate.x, z: gate.z };
      return this.walk(world, cmd, input);
    }
    if (this.order !== 'follow') this.give(world, input, 'follow', fort.x, fort.z);
    // Enter by the gate facing us, then stand in the middle.
    const entry = closest(magicMap('conquest').forts[fort.id]!.gates, cmd);
    const atEntry = Math.hypot(entry.x - cmd.x, entry.z - cmd.z) < 3;
    this.goal = inside || atEntry ? { x: fort.x, z: fort.z } : entry;
    this.aim = { x: fort.x, z: fort.z };

    // Leave a few soldiers behind in fortresses we hold, if the army can spare them.
    const here = world.forts.find((f) => f.owner === this.team && insideFort(f, cmd, 0));
    if (here && mine.length > 10) {
      const kept = world.units.filter((u) => u.alive && u.garrison === here.id).length;
      if (kept < 3) input.garrison = 'leave';
    }
    return this.walk(world, cmd, input);
  }

  private shopping(world: MfWorld): MfSoldierKind | null {
    const econ = world.econ[this.team];
    if (!econ || econ.queue.length > 1) return null;
    const have = { warrior: 0, mage: 0, beast: 0 };
    for (const u of world.units) if (u.alive && u.team === this.team && u.kind !== 'commander' && u.kind !== 'gate') have[u.kind]++;
    for (const q of econ.queue) have[q.kind]++;
    const room = ARMY.maxCapacity - capacityWithQueue(world, this.team);
    let want: MfSoldierKind = have.mage * 2 < have.warrior ? 'mage' : 'warrior';
    if (have.beast < 2 && econ.gold >= RECRUIT.beast.cost + 40 && room >= UNIT_STATS.beast.capacity) want = 'beast';
    if (room < UNIT_STATS[want].capacity || econ.gold < RECRUIT[want].cost) return null;
    return want;
  }

  private walk(world: MfWorld, cmd: MfUnit, input: MfInput): MfInput {
    if (!cmd.alive) return input;
    const gx = this.goal.x - cmd.x;
    const gz = this.goal.z - cmd.z;
    const gl = Math.hypot(gx, gz);
    if (gl > 1.2) {
      input.mx = (gx / gl) * Math.min(1, gl / 4);
      input.mz = (gz / gl) * Math.min(1, gl / 4);
    }
    const foes = world.units.filter((u) => u.alive && u.team !== this.team && u.team >= 0);
    if (foes.length) {
      const close = closest(foes, cmd);
      if (Math.hypot(close.x - cmd.x, close.z - cmd.z) < 2.6) {
        input.aimX = close.x;
        input.aimZ = close.z;
        input.strike = true;
      }
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

/** Where to drop a volley: on the thickest enemy group within reach of our mages and dragons. */
function volleyAt(world: MfWorld, team: number, mine: MfUnit[], foes: MfUnit[], skill: number, rnd: () => number) {
  const casters = mine.filter((u) => UNIT_STATS[u.kind].ranged);
  if (!casters.length || world.armies[team]!.volleyCd > 0 || rnd() > 0.35 + skill * 0.5) return null;
  const mc = centroid(casters);
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
  if (!best) return null;
  const err = (1 - skill) * 4;
  return { x: best.x + (rnd() - 0.5) * err, z: best.z + (rnd() - 0.5) * err };
}
