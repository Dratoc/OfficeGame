import * as THREE from 'three';
import type { MfUnitKind } from '@inbox/shared';
import { toon } from '../office/avatar3d';

/**
 * Stylized medieval soldiers built from simple shapes: big heads, short legs, readable silhouettes.
 * A warrior is a helmet, a shield and a sword; a mage is a pointed hat, a robe and a glowing staff.
 * Geometries are shared between every soldier so fifty per side stay cheap to draw.
 * Models look towards +z and stand on y = 0.
 */

export interface TeamLook {
  main: string;
  dark: string;
  magic: string;
}

export const TEAM_LOOKS: TeamLook[] = [
  { main: '#2f6fe0', dark: '#1f4aa0', magic: '#7fe0ff' },
  { main: '#c8382f', dark: '#86231d', magic: '#ffb347' },
];

const SKIN = '#f1c7a1';
const STEEL = '#b9c3cc';
const STEEL_DARK = '#7d8893';
const GOLD = '#e8c45a';
const LEATHER = '#6b4a32';
const WOOD = '#8a5a35';

const geos = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geos.get(key) as T | undefined;
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

function part(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, emissive?: string): THREE.Mesh {
  const m = new THREE.Mesh(g, toon(color, emissive));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export interface UnitRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Glowing staff tip (mages) to pulse when casting. */
  orb: THREE.Mesh | null;
  cape: THREE.Mesh | null;
  height: number;
}

function legs(body: THREE.Group, pants: string, boots: string, spread: number) {
  const mk = (side: number) => {
    const g = new THREE.Group();
    g.position.set(spread * side, 0.42, 0);
    g.add(part(geo('leg', () => new THREE.CylinderGeometry(0.1, 0.09, 0.3, 8)), pants, 0, -0.15, 0));
    g.add(part(geo('boot', () => new THREE.BoxGeometry(0.17, 0.12, 0.26)), boots, 0, -0.36, 0.04));
    body.add(g);
    return g;
  };
  return [mk(-1), mk(1)] as const;
}

function arm(body: THREE.Group, side: number, sleeve: string, y: number, x: number) {
  const g = new THREE.Group();
  g.position.set(x * side, y, 0);
  g.add(part(geo('arm', () => new THREE.CapsuleGeometry(0.075, 0.2, 4, 8)), sleeve, 0, -0.16, 0));
  g.add(part(geo('hand', () => new THREE.SphereGeometry(0.085, 8, 6)), SKIN, 0, -0.34, 0));
  body.add(g);
  return g;
}

function headWithFace(body: THREE.Group, y: number, r: number) {
  const head = new THREE.Group();
  head.position.y = y;
  head.add(part(geo(`head${r}`, () => new THREE.SphereGeometry(r, 14, 12)), SKIN));
  const eye = geo('eye', () => new THREE.SphereGeometry(0.035, 6, 6));
  head.add(part(eye, '#1d1d24', -0.09 * (r / 0.27), 0.0, r * 0.92));
  head.add(part(eye, '#1d1d24', 0.09 * (r / 0.27), 0.0, r * 0.92));
  body.add(head);
  return head;
}

function sword(hand: THREE.Group, long = 1) {
  const s = new THREE.Group();
  s.position.set(0, -0.36, 0.06);
  s.add(part(geo('grip', () => new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6)), LEATHER, 0, 0, 0));
  s.add(part(geo('guard', () => new THREE.BoxGeometry(0.24, 0.04, 0.06)), GOLD, 0, 0.09, 0));
  s.add(part(geo(`blade${long}`, () => new THREE.BoxGeometry(0.07, 0.62 * long, 0.025)), STEEL, 0, 0.11 + 0.31 * long, 0));
  // Held pointing forward and up.
  s.rotation.x = Math.PI / 2.4;
  hand.add(s);
}

function warrior(look: TeamLook): UnitRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const [legL, legR] = legs(body, look.dark, LEATHER, 0.13);
  // Tunic in the team color with a steel breastplate.
  body.add(part(geo('w-torso', () => new THREE.CapsuleGeometry(0.25, 0.18, 4, 12)), look.main, 0, 0.7, 0));
  body.add(part(geo('w-plate', () => new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), STEEL, 0, 0.66, 0.04));
  body.add(part(geo('w-belt', () => new THREE.CylinderGeometry(0.27, 0.27, 0.07, 12)), LEATHER, 0, 0.54, 0));
  const head = headWithFace(body, 1.12, 0.27);
  // Helmet: steel dome, nose guard and a little crest in the team color.
  head.add(part(geo('w-helm', () => new THREE.SphereGeometry(0.29, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9)), STEEL, 0, 0.03, 0));
  head.add(part(geo('w-nose', () => new THREE.BoxGeometry(0.05, 0.16, 0.05)), STEEL_DARK, 0, -0.03, 0.28));
  head.add(part(geo('w-crest', () => new THREE.BoxGeometry(0.06, 0.12, 0.36)), look.main, 0, 0.3, -0.02));
  const armL = arm(body, -1, look.main, 0.86, 0.32);
  const armR = arm(body, 1, look.main, 0.86, 0.32);
  // Round shield on the left arm.
  const shield = new THREE.Group();
  shield.position.set(-0.08, -0.22, 0.12);
  shield.rotation.y = -0.35;
  const disc = part(geo('w-shield', () => new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16)), look.main);
  disc.rotation.x = Math.PI / 2;
  shield.add(disc);
  const rim = part(geo('w-rim', () => new THREE.TorusGeometry(0.3, 0.025, 6, 18)), GOLD);
  shield.add(rim);
  const boss = part(geo('w-boss', () => new THREE.SphereGeometry(0.08, 8, 6)), GOLD, 0, 0, 0.04);
  shield.add(boss);
  armL.add(shield);
  sword(armR);
  return { root, body, head, armL, armR, legL, legR, orb: null, cape: null, height: 1.5 };
}

function mage(look: TeamLook): UnitRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const [legL, legR] = legs(body, look.dark, '#3a2b45', 0.1);
  // Long robe over the legs, with a golden hem.
  body.add(part(geo('m-robe', () => new THREE.ConeGeometry(0.36, 0.78, 14, 1, true)), look.dark, 0, 0.5, 0));
  body.add(part(geo('m-hem', () => new THREE.TorusGeometry(0.33, 0.025, 6, 16).rotateX(Math.PI / 2)), GOLD, 0, 0.14, 0));
  body.add(part(geo('m-chest', () => new THREE.CapsuleGeometry(0.21, 0.14, 4, 12)), look.main, 0, 0.78, 0));
  const head = headWithFace(body, 1.14, 0.25);
  // White beard and a tall pointed hat.
  head.add(part(geo('m-beard', () => new THREE.ConeGeometry(0.15, 0.3, 8).rotateX(Math.PI)), '#eeeef2', 0, -0.2, 0.15));
  head.add(part(geo('m-brim', () => new THREE.CylinderGeometry(0.42, 0.42, 0.035, 18)), look.dark, 0, 0.13, 0));
  const hat = part(geo('m-hat', () => new THREE.ConeGeometry(0.25, 0.62, 12)), look.main, 0, 0.44, -0.04);
  hat.rotation.x = -0.18;
  head.add(hat);
  const armL = arm(body, -1, look.main, 0.92, 0.27);
  const armR = arm(body, 1, look.main, 0.92, 0.27);
  // Staff with a glowing orb.
  const staff = new THREE.Group();
  staff.position.set(0, -0.34, 0.05);
  staff.add(part(geo('m-staff', () => new THREE.CylinderGeometry(0.03, 0.035, 1.3, 6)), WOOD, 0, 0.25, 0));
  const orb = part(geo('m-orb', () => new THREE.IcosahedronGeometry(0.1, 1)), look.magic, 0, 0.95, 0, look.magic);
  orb.castShadow = false;
  staff.add(orb);
  armR.add(staff);
  return { root, body, head, armL, armR, legL, legR, orb, cape: null, height: 1.75 };
}

function commander(look: TeamLook): UnitRig {
  const rig = warrior(look);
  // Golden armor details, a crown-like helmet, a plume and a long cape.
  rig.head.add(part(geo('c-crown', () => new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12, 1, true)), GOLD, 0, 0.12, 0));
  rig.head.add(part(geo('c-plume', () => new THREE.ConeGeometry(0.09, 0.45, 8)), look.main, 0, 0.5, -0.06));
  rig.body.add(part(geo('c-pauldron', () => new THREE.SphereGeometry(0.13, 10, 8)), GOLD, -0.33, 0.9, 0));
  rig.body.add(part(geo('c-pauldron', () => new THREE.SphereGeometry(0.13, 10, 8)), GOLD, 0.33, 0.9, 0));
  // Tapered cape: narrow at the shoulders, wider at the hem.
  const cape = new THREE.Mesh(
    geo('c-cape', () => {
      const g = new THREE.PlaneGeometry(0.5, 0.7, 1, 4).translate(0, -0.35, 0);
      const p = g.attributes.position!;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (0.75 - p.getY(i) * 0.7));
      return g;
    }),
    new THREE.MeshToonMaterial({ color: look.dark, side: THREE.DoubleSide }),
  );
  cape.position.set(0, 0.95, -0.25);
  cape.rotation.x = 0.12;
  cape.castShadow = true;
  rig.body.add(cape);
  rig.root.scale.setScalar(1.28);
  return { ...rig, cape, height: 1.95 };
}

export function buildUnit(kind: MfUnitKind, team: number): UnitRig {
  const look = TEAM_LOOKS[team] ?? TEAM_LOOKS[0]!;
  if (kind === 'commander') return commander(look);
  if (kind === 'mage') return mage(look);
  return warrior(look);
}

/** Shared ring geometry for the ground marker under each soldier. */
export const RING_GEO = new THREE.RingGeometry(0.42, 0.52, 24).rotateX(-Math.PI / 2);
