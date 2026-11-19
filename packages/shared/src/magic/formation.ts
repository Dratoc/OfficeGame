import { FORMATION as F, type MfFormation } from './config';

/**
 * Formation shapes in the army's local frame (+z = march direction, +x = right of the commander).
 * Slots come in priority order: if soldiers fall, the first slots stay filled and the back thins out.
 */

export interface MfSlot {
  x: number;
  z: number;
}

export interface MfSlots {
  warrior: MfSlot[];
  mage: MfSlot[];
  beast: MfSlot[];
}

function row(count: number, spacing: number, z: number): MfSlot[] {
  return Array.from({ length: count }, (_, i) => ({ x: (i - (count - 1) / 2) * spacing, z }));
}

function rows(count: number, perRow: number, spacing: number, z0: number, gap: number): MfSlot[] {
  const out: MfSlot[] = [];
  for (let left = count, r = 0; left > 0; r++) {
    const n = Math.min(left, perRow);
    out.push(...row(n, spacing, z0 + r * gap));
    left -= n;
  }
  return out;
}

/** Dragons on both flanks, alternating sides, a little behind the commander. */
function flanks(count: number, side: number, back: number): MfSlot[] {
  return Array.from({ length: count }, (_, i) => ({ x: (i % 2 === 0 ? 1 : -1) * (side + Math.floor(i / 2) * 3), z: -back - Math.floor(i / 2) * 2.5 }));
}

/**
 * Marching formations.
 * - Line: a battle line of warriors around the commander (gap in the middle for him), extra rows
 *   in front, mages protected behind. Wide and steady.
 * - Wedge: warriors in a V with the tip ahead, to punch through. Mages inside the V, behind.
 * - Column: two abreast, for roads, gates and narrow passes.
 */
export function followSlots(warriors: number, mages: number, beasts = 0, shape: MfFormation = 'line'): MfSlots {
  if (shape === 'column') {
    const warrior = rows(warriors, 2, 1.3, F.warriorFront + 1.4, 1.35);
    const mage = rows(mages, 2, 1.4, -2.4, -1.45);
    const beast = Array.from({ length: beasts }, (_, i) => ({ x: (i % 2 === 0 ? 1 : -1) * 3.2, z: -1 - Math.floor(i / 2) * 3 }));
    return { warrior, mage, beast };
  }
  if (shape === 'wedge') {
    const warrior: MfSlot[] = [];
    for (let i = 0; i < warriors; i++) {
      if (i === 0) {
        warrior.push({ x: 0, z: F.warriorFront + 4 });
        continue;
      }
      // Pairs down both arms of the V; once an arm has 7, a second V forms right behind the first.
      const k = Math.ceil(i / 2);
      const arm = Math.floor((k - 1) / 7);
      const step = ((k - 1) % 7) + 1;
      const side = i % 2 === 1 ? 1 : -1;
      warrior.push({ x: side * step * 1.2, z: F.warriorFront + 4 - step * 1.0 - arm * 1.7 });
    }
    const mage = rows(mages, 4, F.mageSpacing * 0.85, -F.mageBack, -F.mageRowGap);
    return { warrior, mage, beast: flanks(beasts, F.beastSide + 1, F.beastBack + 1) };
  }
  const warrior: MfSlot[] = [];
  const first = Math.min(warriors, F.warriorsPerRow);
  for (let i = 0; i < first; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const col = Math.floor(i / 2);
    warrior.push({ x: side * (F.commanderGap / 2 + F.warriorSpacing * 0.5 + col * F.warriorSpacing), z: F.warriorFront });
  }
  warrior.push(...rows(warriors - first, F.warriorsPerRow, F.warriorSpacing, F.warriorFront + F.warriorRowGap, F.warriorRowGap));
  const mage = rows(mages, F.magesPerRow, F.mageSpacing, -F.mageBack, -F.mageRowGap);
  const width = Math.min(first, F.warriorsPerRow) / 2;
  return { warrior, mage, beast: flanks(beasts, Math.max(F.beastSide, F.commanderGap / 2 + width * F.warriorSpacing + 2), F.beastBack) };
}

/** Defensive stance: a tight shield wall facing the threat, mages behind it, dragons guarding the ends. */
export function defendSlots(warriors: number, mages: number, beasts = 0): MfSlots {
  const perRow = 12;
  const warrior: MfSlot[] = [];
  for (let left = warriors, r = 0; left > 0; r++) {
    const n = Math.min(left, perRow);
    warrior.push(...row(n, F.defendSpacing, F.defendFront - r * 1.2));
    left -= n;
  }
  const mage = rows(mages, F.magesPerRow, F.mageSpacing, -1.6, -F.mageRowGap);
  const half = (Math.min(warriors, perRow) * F.defendSpacing) / 2;
  const beast = Array.from({ length: beasts }, (_, i) => ({ x: (i % 2 === 0 ? 1 : -1) * (half + 2.5 + Math.floor(i / 2) * 3), z: F.defendFront - 1 }));
  return { warrior, mage, beast };
}

interface Slotted {
  x: number;
  z: number;
  slotX: number;
  slotZ: number;
  slotIndex: number;
  hasSlot: boolean;
}

/** Each slot, in priority order, goes to the nearest soldier still without one. */
export function assignSlots(units: Slotted[], slots: MfSlot[]) {
  const free = new Set(units);
  slots.forEach((s, i) => {
    let best: Slotted | null = null;
    let bd = Infinity;
    for (const u of free) {
      const d = (u.x - s.x) ** 2 + (u.z - s.z) ** 2;
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    if (!best) return;
    free.delete(best);
    best.slotX = s.x;
    best.slotZ = s.z;
    best.slotIndex = i;
    best.hasSlot = true;
  });
}
