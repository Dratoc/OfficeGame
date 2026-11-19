/**
 * Magic Frontiers: every number that shapes a battle lives here, so units, orders and the map can
 * be tuned without touching the simulation. Distances are meters, times are seconds.
 */

export const MF_TICK_RATE = 30;
export const MF_DT = 1 / MF_TICK_RATE;
export const MF_TICK_MS = 1000 / MF_TICK_RATE;

/** Beasts (dragons) are planned for a later stage; the type is here so orders already know them. */
export type MfUnitKind = 'commander' | 'warrior' | 'mage' | 'beast';
export type MfSoldierKind = Exclude<MfUnitKind, 'commander'>;

export interface MfMelee {
  damage: number;
  /** Reach measured between the two units' edges. */
  range: number;
  cooldown: number;
  /** Seconds from the start of the swing to the hit, so the animation and the damage line up. */
  windup: number;
}

export interface MfRanged {
  damage: number;
  /** Farthest a shot can be aimed. */
  range: number;
  cooldown: number;
  /** Horizontal speed of the projectile. */
  speed: number;
  /** Area damage radius on impact (0 = only a direct hit). */
  splash: number;
  /** Mages keep at least this far from enemies when they can. */
  keepAway: number;
}

/** A cone of fire in front of the unit (dragons). */
export interface MfBreath {
  damage: number;
  range: number;
  /** Half-angle of the cone, radians. */
  arc: number;
  cooldown: number;
}

export interface MfUnitStats {
  hp: number;
  /** Cruising speed. Units following a moving commander may jog faster to keep up (see ARMY). */
  speed: number;
  radius: number;
  /** Fraction of incoming damage taken (1 = no armor). */
  damageTaken: number;
  melee: MfMelee | null;
  ranged: MfRanged | null;
  /** How far a unit notices enemies on its own. */
  sight: number;
  /** How much of the 50-unit cap the unit uses. */
  capacity: number;
  breath: MfBreath | null;
  /** Flies over trees, rocks and soldiers; only other flyers get in its way. */
  flying: boolean;
}

export const UNIT_STATS: Record<MfUnitKind, MfUnitStats> = {
  commander: {
    hp: 420,
    speed: 6.2,
    radius: 0.55,
    damageTaken: 0.8,
    melee: { damage: 26, range: 1.5, cooldown: 0.55, windup: 0.18 },
    ranged: null,
    sight: 14,
    capacity: 0,
    breath: null,
    flying: false,
  },
  // Tough and steady: holds the line and shields the mages. Strong against mages up close.
  warrior: {
    hp: 130,
    speed: 5.1,
    radius: 0.45,
    damageTaken: 1,
    melee: { damage: 15, range: 0.9, cooldown: 0.95, windup: 0.3 },
    ranged: null,
    sight: 12,
    capacity: 1,
    breath: null,
    flying: false,
  },
  // Fragile but deadly from afar. Strong against tight groups of warriors, weak if caught.
  mage: {
    hp: 62,
    speed: 4.8,
    radius: 0.4,
    damageTaken: 1.15,
    melee: { damage: 5, range: 0.8, cooldown: 1.2, windup: 0.3 },
    ranged: { damage: 20, range: 17, cooldown: 2.4, speed: 17, splash: 1.7, keepAway: 7 },
    sight: 18,
    capacity: 1,
    breath: null,
    flying: false,
  },
  // Dragons: big, flying, burn whole groups with their breath. Strong against packed warriors,
  // weak against mages (who shoot them out of the sky). Each one uses 5 places of the army.
  beast: {
    hp: 520,
    speed: 5.4,
    radius: 1.1,
    damageTaken: 0.9,
    melee: null,
    ranged: { damage: 32, range: 15, cooldown: 3.6, speed: 15, splash: 3.2, keepAway: 0 },
    sight: 17,
    capacity: 5,
    breath: { damage: 20, range: 6.5, arc: 0.45, cooldown: 3 },
    flying: true,
  },
};

/**
 * Rock, paper, scissors between kinds: damage multiplier by attacker and target.
 * Warriors cut down mages up close, mages shoot dragons out of the sky, dragons burn warriors.
 */
export const DAMAGE_VS: Record<MfUnitKind, Partial<Record<MfUnitKind, number>>> = {
  commander: {},
  warrior: { mage: 1.5, beast: 0.75 },
  mage: { beast: 1.7, warrior: 0.9 },
  beast: { warrior: 1.5, mage: 0.8 },
};

/** Flying height of dragons (their body), used by projectiles and the renderer. */
export const MF_FLY_HEIGHT = 2.8;

export type MfFormation = 'line' | 'wedge' | 'column';
export const FORMATIONS: MfFormation[] = ['line', 'wedge', 'column'];

export interface MfComposition {
  warriors: number;
  mages: number;
  beasts: number;
}

/** Starting armies for the skirmish, by size. Each one fills its capacity exactly. */
export const ARMY_SIZES: Record<'small' | 'medium' | 'large', MfComposition> = {
  small: { warriors: 5, mages: 3, beasts: 1 },
  medium: { warriors: 13, mages: 7, beasts: 1 },
  large: { warriors: 26, mages: 14, beasts: 2 },
};

export function capacityOf(c: MfComposition): number {
  return c.warriors * UNIT_STATS.warrior.capacity + c.mages * UNIT_STATS.mage.capacity + c.beasts * UNIT_STATS.beast.capacity;
}

export const ARMY = {
  /** Never more than this many soldiers (counted by capacity) in one army. */
  maxCapacity: 50,
  /** Following units jog up to this much faster than their cruising speed to keep their slot. */
  catchUp: 1.3,
  /** In Follow, warriors only fight enemies this close (self defense) and keep their place otherwise. */
  followEngage: 3.2,
  /** In Attack, a unit looks for new enemies this far around itself when its target is gone. */
  attackSearch: 24,
  /** In Attack, units do not chase farther than this from their commander. */
  attackLeash: 38,
  /** Defend: the zone around the anchor that the army protects. */
  defendRadius: 10,
  /** Defend: warriors step out at most this far from their place in the line. */
  defendStepOut: 3,
  /** Defend: damage a warrior takes while standing in the line. */
  defendDamageTaken: 0.6,
  /** Seconds between two magic volleys from the commander (E). */
  volleyCooldown: 7,
  /** A volley hits harder and wider than a normal shot. */
  volleyDamage: 1.3,
  volleySplash: 2.6,
  /** How long the war cry banner and effect last. */
  warCry: 1.2,
  /** Re-plan slots when the march heading turned more than this (radians). */
  reassignTurn: Math.PI / 4,
  /** How fast the march heading turns towards where the commander walks (radians per second). */
  headingTurnRate: 2.4,
} as const;

/** Formation shape. Local frame: +z is the march direction, +x is the commander's right. */
export const FORMATION = {
  /** Warriors stand in a battle line around the commander. */
  warriorSpacing: 1.55,
  warriorsPerRow: 10,
  warriorRowGap: 1.5,
  /** The first warrior row is this far ahead of the commander. */
  warriorFront: 0.8,
  /** Gap in the middle of the first row where the commander walks. */
  commanderGap: 1.9,
  mageSpacing: 1.9,
  magesPerRow: 6,
  mageRowGap: 1.7,
  /** Mages walk this far behind the commander. */
  mageBack: 3.2,
  /** Defend: the warrior line is this far in front of the anchor. */
  defendFront: 2.2,
  defendSpacing: 1.25,
  /** Dragons fly on the flanks, a little behind the commander. */
  beastSide: 6.5,
  beastBack: 1.5,
} as const;

/** Gravity used by magic projectiles (they fly in an arc). */
export const MF_GRAVITY = 16;
