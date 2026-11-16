import { OFFICE, type Fighter, type OfficeInput } from '@inbox/shared';

/**
 * A sparring partner for the offline practice. It reacts with a human-ish delay: it walks in,
 * swings when close, sometimes blocks or dodges your swings, and circles around your guard.
 */
export class SparringBot {
  private seq = 0;
  private think = 0;
  private move = { x: 0, z: 0 };
  private wantAtk = false;
  private guard: 'none' | 'block' | 'dodge' = 'none';
  private guardFor = -1;
  private strafe = Math.random() < 0.5 ? 1 : -1;

  constructor(private skill = 0.6) {}

  step(me: Fighter, foe: Fighter, dt: number): OfficeInput {
    const input: OfficeInput = { seq: ++this.seq, mx: 0, mz: 0, atk: false, blk: false, dge: false };
    if (me.action === 'ko' || foe.action === 'ko') return input;
    const dx = foe.x - me.x;
    const dz = foe.z - me.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ux = dx / dist;
    const uz = dz / dist;

    // React to a swing once per swing.
    const threat = foe.action === 'attack' && foe.t < OFFICE.attack.hitAt && dist < OFFICE.attack.range + 1;
    if (threat && this.guardFor !== foe.attacks) {
      this.guardFor = foe.attacks;
      const r = Math.random();
      this.guard = r < this.skill * 0.55 ? 'block' : r < this.skill * 0.8 ? 'dodge' : 'none';
    }
    if (!threat && foe.action !== 'attack') this.guard = 'none';

    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.12 + Math.random() * 0.18;
      if (Math.random() < 0.15) this.strafe *= -1;
      const low = me.hp < 30 && me.hp < foe.hp;
      if (dist > OFFICE.attack.range * 0.85) {
        // Close in, with a bit of an angle.
        this.move = { x: ux - uz * this.strafe * 0.35, z: uz + ux * this.strafe * 0.35 };
        this.wantAtk = false;
      } else if (foe.action === 'block') {
        // Walk around the guard.
        this.move = { x: -uz * this.strafe, z: ux * this.strafe };
        this.wantAtk = Math.random() < 0.25;
      } else if (low && Math.random() < 0.3) {
        this.move = { x: -ux, z: -uz };
        this.wantAtk = false;
      } else {
        this.move = { x: -uz * this.strafe * 0.4, z: ux * this.strafe * 0.4 };
        this.wantAtk = Math.random() < 0.35 + this.skill * 0.4;
      }
    }

    input.mx = this.move.x;
    input.mz = this.move.z;
    if (this.guard === 'block') {
      input.blk = true;
    } else if (this.guard === 'dodge') {
      input.dge = true;
      input.mx = -uz * this.strafe;
      input.mz = ux * this.strafe;
    } else if (this.wantAtk && dist < OFFICE.attack.range + 0.2) {
      input.atk = true;
      this.wantAtk = false;
    }
    return input;
  }
}
