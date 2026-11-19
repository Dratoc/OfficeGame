import { FORMATION as F } from './config';

/**
 * Formation shapes in the army's local frame (+z = march direction, +x = right of the commander).
 * Slots come in priority order: if soldiers fall, the first slots stay filled and the back thins out.
 */

export interface MfSlot {
  x: number;
  z: number;
}

function row(count: number, spacing: number, z: number): MfSlot[] {
  return Array.from({ length: count }, (_, i) => ({ x: (i - (count - 1) / 2) * spacing, z }));
}

/**
 * Marching formation: a battle line of warriors around the commander (with a gap for him in the
 * middle), extra warrior rows in front, and the mages walking protected behind.
 */
export function followSlots(warriors: number, mages: number): { warrior: MfSlot[]; mage: MfSlot[] } {
  const warrior: MfSlot[] = [];
  const first = Math.min(warriors, F.warriorsPerRow);
  for (let i = 0; i < first; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const col = Math.floor(i / 2);
    warrior.push({ x: side * (F.commanderGap / 2 + F.warriorSpacing * 0.5 + col * F.warriorSpacing), z: F.warriorFront });
  }
  for (let left = warriors - first, r = 1; left > 0; r++) {
    const n = Math.min(left, F.warriorsPerRow);
    warrior.push(...row(n, F.warriorSpacing, F.warriorFront + r * F.warriorRowGap));
    left -= n;
  }
  const mage: MfSlot[] = [];
  for (let left = mages, r = 0; left > 0; r++) {
    const n = Math.min(left, F.magesPerRow);
    mage.push(...row(n, F.mageSpacing, -F.mageBack - r * F.mageRowGap));
    left -= n;
  }
  return { warrior, mage };
}

/** Defensive stance: a tight shield wall facing the threat, everyone else behind it. */
export function defendSlots(warriors: number, others: number): { warrior: MfSlot[]; mage: MfSlot[] } {
  const perRow = 12;
  const warrior: MfSlot[] = [];
  for (let left = warriors, r = 0; left > 0; r++) {
    const n = Math.min(left, perRow);
    warrior.push(...row(n, F.defendSpacing, F.defendFront - r * 1.2));
    left -= n;
  }
  const mage: MfSlot[] = [];
  for (let left = others, r = 0; left > 0; r++) {
    const n = Math.min(left, F.magesPerRow);
    mage.push(...row(n, F.mageSpacing, -1.6 - r * F.mageRowGap));
    left -= n;
  }
  return { warrior, mage };
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
