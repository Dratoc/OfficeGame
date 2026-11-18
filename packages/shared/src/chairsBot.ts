import { CHAIRS, TRACK, pointAt, type ChairsInput, type Kart, type PaperBall, type Track } from './chairs';

/**
 * A rival for the Chair Race practice (and the tests). It follows the track with a look-ahead
 * point in its own lane, throws when a rival is lined up in front, and steers or hops away from
 * paper balls coming from behind. `skill` goes from 0 (relaxed) to 1 (sharp).
 */
export class ChairBot {
  private seq = 0;
  private lane: number;
  private laneT = 0;
  private aimT = 0;
  private dodgeFor = -1;

  constructor(
    private skill = 0.6,
    private random: () => number = Math.random,
    private track: Track = TRACK,
  ) {
    this.lane = (this.random() - 0.5) * 2.4;
  }

  step(me: Kart, others: readonly Kart[], balls: readonly PaperBall[], dt: number): ChairsInput {
    const input: ChairsInput = { seq: ++this.seq, steer: 0, thr: 0, fire: false, hop: 0 };
    if (me.done > 0) return input;
    const T = this.track;

    // Wander between lanes now and then, like a person would.
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT = 1.5 + this.random() * 2.5;
      this.lane = (this.random() - 0.5) * 2 * (T.halfWidth - 1.4);
    }

    // Paper balls coming from behind: get out of the way.
    let threat: PaperBall | null = null;
    for (const b of balls) {
      if (b.owner === me.id) continue;
      const rx = me.x - b.x;
      const rz = me.z - b.z;
      const speed = Math.hypot(b.vx, b.vz) || 1;
      const along = (rx * b.vx + rz * b.vz) / speed;
      const across = Math.abs((rx * -b.vz + rz * b.vx) / speed);
      if (along > 0 && along < 9 && across < CHAIRS.radius + CHAIRS.shot.radius + 0.4) {
        threat = b;
        break;
      }
    }
    if (threat && this.dodgeFor !== threat.id) {
      this.dodgeFor = threat.id;
      // Move to the other side of the ball's path.
      const side = (me.x - threat.x) * -Math.sin(me.h) + (me.z - threat.z) * Math.cos(me.h);
      const dir = side >= 0 ? 1 : -1;
      this.lane = Math.max(-(T.halfWidth - 1.2), Math.min(T.halfWidth - 1.2, this.lane + dir * 2.2));
      this.laneT = 1.2;
      if (this.random() < this.skill * 0.85 && me.hopCd <= 0) input.hop = dir;
    }

    // Follow a point ahead in the lane.
    const s = ((me.prog % T.length) + T.length) % T.length;
    const ahead = pointAt(T, s + 5 + Math.max(0, me.v) * 0.45, this.lane);
    const want = Math.atan2(ahead.z - me.z, ahead.x - me.x);
    let diff = want - me.h;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    input.steer = Math.max(-1, Math.min(1, diff * 2.2));
    // Slower bots never go full throttle.
    const cap = 0.78 + 0.22 * this.skill;
    input.thr = Math.abs(diff) > 1.1 ? 0.35 : cap;

    // Throw at a rival lined up in front.
    this.aimT -= dt;
    if (me.shotCd <= 0 && this.aimT <= 0) {
      const fx = Math.cos(me.h);
      const fz = Math.sin(me.h);
      for (const o of others) {
        if (o.done > 0) continue;
        const rx = o.x - me.x;
        const rz = o.z - me.z;
        const along = rx * fx + rz * fz;
        const across = Math.abs(rx * -fz + rz * fx);
        if (along > 1.5 && along < 18 && across < 0.6 + (1 - this.skill) * 0.9) {
          // A human-ish reaction time before throwing.
          if (this.random() < 0.25 + this.skill * 0.6) input.fire = true;
          this.aimT = 0.15 + (1 - this.skill) * 0.4;
          break;
        }
      }
    }
    return input;
  }
}
