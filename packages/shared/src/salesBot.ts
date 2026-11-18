import {
  SALES,
  STATIONS,
  ZONES,
  deskDone,
  stationInReach,
  zoneBit,
  zonesOf,
  type Item,
  type SalesInput,
  type SalesWorld,
  type StationDef,
  type Worker,
  type ZoneId,
} from './sales';

/** The area where an item has to go next. */
export function nextZoneFor(item: Item): ZoneId {
  switch (item.kind) {
    case 'solicitud':
      return 'recepcion';
    case 'oc':
      return 'gerencia';
    case 'oc_ok':
      return 'patio';
    case 'maquina':
      return 'despacho';
  }
}

const PASSES = STATIONS.filter((s) => s.kind === 'pass');

/** Areas reachable through pass counters, with the first pass to use, from a set of areas. */
function passToward(mask: number, target: ZoneId): StationDef[] {
  // Breadth-first over the areas, remembering the pass that left our own areas.
  const seen = new Set<ZoneId>(zonesOf(mask));
  let frontier: { zone: ZoneId; first: StationDef }[] = [];
  for (const p of PASSES) {
    const mine = p.zones.filter((z) => mask & zoneBit(z));
    const other = p.zones.find((z) => !(mask & zoneBit(z)));
    if (mine.length && other) frontier.push({ zone: other, first: p });
  }
  while (frontier.length) {
    const hits = frontier.filter((f) => f.zone === target).map((f) => f.first);
    if (hits.length) return hits;
    const next: typeof frontier = [];
    for (const f of frontier) {
      if (seen.has(f.zone)) continue;
      seen.add(f.zone);
      for (const p of PASSES) {
        if (!p.zones.includes(f.zone)) continue;
        const other = p.zones.find((z) => z !== f.zone)!;
        if (!seen.has(other)) next.push({ zone: other, first: f.first });
      }
    }
    frontier = next;
  }
  return [];
}

/**
 * A teammate for the practice (and the tests). It looks after its own areas: takes requests,
 * writes and stamps orders, swaps them for the right machine, adds the accessory, delivers, and
 * hands everything else over the pass counters. `skill` goes from 0 (relaxed) to 1 (sharp).
 */
export class SalesBot {
  private seq = 0;
  private target: StationDef | null = null;
  private idle: { x: number; z: number } | null = null;
  private think = 0;
  private pressCd = 0;
  private stuck = 0;
  private last = { x: 0, z: 0 };
  private wiggle = 0;
  private wiggleDir = { x: 0, z: 0 };

  constructor(
    private skill = 0.6,
    private random: () => number = Math.random,
  ) {}

  private distTo(me: Worker, s: { x: number; z: number }) {
    return Math.hypot(s.x - me.x, s.z - me.z);
  }

  private nearest(me: Worker, list: StationDef[]): StationDef | null {
    let best: StationDef | null = null;
    let d = Infinity;
    for (const s of list) {
      const k = this.distTo(me, s);
      if (k < d) {
        d = k;
        best = s;
      }
    }
    return best;
  }

  private mine(me: Worker, s: StationDef) {
    return s.zones.some((z) => me.zones & zoneBit(z));
  }

  /** Picks what to do next. */
  private plan(world: SalesWorld, me: Worker, team: readonly Worker[]): StationDef | null {
    const st = (s: StationDef) => world.stations[s.id]!;
    const owned = STATIONS.filter((s) => this.mine(me, s));
    const held = me.held;
    if (held) {
      const order = world.orders.find((o) => o.id === held.order);
      const zone = nextZoneFor(held);
      if (me.zones & zoneBit(zone)) {
        switch (held.kind) {
          case 'solicitud':
            return this.nearest(me, owned.filter((s) => s.kind === 'oc' && !st(s).item));
          case 'oc':
            return this.nearest(me, owned.filter((s) => s.kind === 'timbre' && !st(s).item));
          case 'oc_ok':
            return owned.find((s) => s.kind === 'bay' && s.model === order?.model) ?? null;
          case 'maquina': {
            if (!order) return null;
            if (held.model !== order.model) {
              // Wrong machine: take it back to its bay, or over to whoever has the yard.
              if (me.zones & zoneBit('patio')) return owned.find((s) => s.kind === 'bay' && s.model === held.model) ?? null;
              return this.nearest(me, passToward(me.zones, 'patio').filter((s) => !st(s).item));
            }
            if ((held.accessory ?? null) !== order.accessory) {
              const want = order.accessory ?? held.accessory;
              return owned.find((s) => s.kind === 'shelf' && s.accessory === want) ?? null;
            }
            return owned.find((s) => s.kind === 'dock' && s.branch === order.branch) ?? null;
          }
        }
      }
      return this.nearest(me, passToward(me.zones, zone).filter((s) => !st(s).item));
    }

    const busy = new Set(team.filter((w) => w !== me && w.working).map((w) => stationInReach(w)?.id));
    // Finished papers on my desks first, then desks with work to do.
    const done = owned.filter((s) => (s.kind === 'oc' || s.kind === 'timbre') && deskDone(s, st(s)));
    if (done.length) return this.nearest(me, done);
    const work = owned.filter((s) => (s.kind === 'oc' || s.kind === 'timbre') && st(s).item && !deskDone(s, st(s)) && !busy.has(s.id));
    if (work.length) return this.nearest(me, work);
    // Things on the pass counters that need me.
    const incoming = owned.filter((s) => s.kind === 'pass' && st(s).item && me.zones & zoneBit(nextZoneFor(st(s).item!)));
    if (incoming.length) return this.nearest(me, incoming);
    // A new request, if the desks can take it.
    if (me.zones & zoneBit('recepcion')) {
      const freeDesks = owned.filter((s) => s.kind === 'oc' && !st(s).item).length;
      const carrying = team.filter((w) => w !== me && w.held?.kind === 'solicitud').length;
      const waiting = world.orders.filter((o) => o.status === 'waiting').sort((a, b) => a.left - b.left);
      if (waiting.length && freeDesks - carrying > 0) {
        const o = waiting[0]!;
        return owned.find((s) => s.kind === 'meson' && s.slot === o.slot) ?? null;
      }
    }
    return null;
  }

  step(world: SalesWorld, me: Worker, team: readonly Worker[], dt: number): SalesInput {
    const input: SalesInput = { seq: ++this.seq, mx: 0, mz: 0, act: false, hold: false };
    if (!me.active || world.over) return input;
    this.pressCd = Math.max(0, this.pressCd - dt);
    this.think -= dt;
    if (this.think <= 0 || (this.target === null && this.idle === null)) {
      this.think = 0.25 + (1 - this.skill) * 0.5 * this.random();
      this.target = this.plan(world, me, team);
      if (!this.target) {
        // Wait in the middle of my first area, near the action.
        const z = ZONES[zonesOf(me.zones)[0]!];
        this.idle = this.idle ?? { x: (z.x0 + z.x1) / 2 + (this.random() - 0.5) * 3, z: (z.z0 + z.z1) / 2 + (this.random() - 0.5) * 2 };
      } else this.idle = null;
    }
    const goal = this.target ?? this.idle;
    if (!goal) return input;
    const d = this.distTo(me, goal);
    const close = this.target ? d < SALES.reach * 0.55 : d < 0.4;
    if (!close) {
      const speed = 0.65 + 0.35 * this.skill;
      let mx = ((goal.x - me.x) / d) * speed;
      let mz = ((goal.z - me.z) / d) * speed;
      // Unstick from furniture by sliding sideways for a moment.
      if (Math.hypot(me.x - this.last.x, me.z - this.last.z) < 0.01) this.stuck += dt;
      else this.stuck = 0;
      if (this.stuck > 0.4) {
        this.wiggle = 0.5;
        this.stuck = 0;
        const side = this.random() < 0.5 ? 1 : -1;
        this.wiggleDir = { x: -mz * side, z: mx * side };
      }
      if (this.wiggle > 0) {
        this.wiggle -= dt;
        mx = this.wiggleDir.x;
        mz = this.wiggleDir.z;
      }
      input.mx = mx;
      input.mz = mz;
    } else if (this.target) {
      const here = stationInReach(me);
      if (here?.id === this.target.id) {
        input.hold = true;
        if (this.pressCd <= 0) {
          input.act = true;
          this.pressCd = 0.35 + (1 - this.skill) * 0.4;
          this.think = Math.min(this.think, 0.1);
        }
      } else {
        input.mx = (this.target.x - me.x) / Math.max(0.01, d);
        input.mz = (this.target.z - me.z) / Math.max(0.01, d);
      }
    }
    this.last = { x: me.x, z: me.z };
    return input;
  }
}
