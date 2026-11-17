import { OFFICE, POWER_TUNING, nearestRival, type Fighter, type OfficeInput, type PowerId } from '@inbox/shared';

/**
 * A sparring partner for the offline practice. It reacts with a human-ish delay: it walks to
 * the closest fighter, swings when close, sometimes blocks or dodges, circles around a guard
 * and uses its two powers when they make sense.
 */
export class SparringBot {
  private seq = 0;
  private think = 0;
  private move = { x: 0, z: 0 };
  private wantAtk = false;
  private guard: 'none' | 'block' | 'dodge' = 'none';
  private guardFor = '';
  private strafe = Math.random() < 0.5 ? 1 : -1;

  constructor(private skill = 0.6) {}

  step(me: Fighter, others: Fighter[], dt: number): OfficeInput {
    const input: OfficeInput = { seq: ++this.seq, mx: 0, mz: 0, atk: false, blk: false, dge: false, p1: false, p2: false };
    const foe = nearestRival(me, others) as Fighter | null;
    if (me.action === 'ko' || !foe) return input;
    const dx = foe.x - me.x;
    const dz = foe.z - me.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ux = dx / dist;
    const uz = dz / dist;

    // React to a swing aimed at it, once per swing.
    const threat = others.find((o) => o.hp > 0 && o.action === 'attack' && o.t < OFFICE.attack.hitAt && Math.hypot(o.x - me.x, o.z - me.z) < OFFICE.attack.range + 1);
    const swingId = threat ? `${threat.id}:${threat.attacks}` : '';
    if (threat && this.guardFor !== swingId) {
      this.guardFor = swingId;
      const r = Math.random();
      this.guard = r < this.skill * 0.55 ? 'block' : r < this.skill * 0.8 ? 'dodge' : 'none';
    }
    if (!threat) this.guard = 'none';

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
      // Powers, now and then.
      if (Math.random() < 0.25 + this.skill * 0.3) {
        me.powers.forEach((id, i) => {
          if ((me.cds[i] ?? 1) > 0 || !this.worthIt(id, me, others, dist, !!threat)) return;
          if (i === 0) input.p1 = true;
          else input.p2 = true;
        });
      }
    }

    input.mx = this.move.x;
    input.mz = this.move.z;
    if (input.p1 || input.p2) return input;
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

  private worthIt(id: PowerId, me: Fighter, others: Fighter[], dist: number, threatened: boolean): boolean {
    switch (id) {
      case 'stapler':
        return dist > 2.5 && dist < 8;
      case 'coffee':
        return dist < POWER_TUNING.coffee.range;
      case 'meeting':
        return others.filter((o) => o.hp > 0 && Math.hypot(o.x - me.x, o.z - me.z) < POWER_TUNING.meeting.range).length >= 1;
      case 'folders':
        return threatened;
      case 'sprint':
        return dist > 5;
      case 'bandage':
        return me.hp < 55;
    }
  }
}
