import * as THREE from 'three';
import type { MfUnitKind } from '@inbox/shared';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, toonGradient } from '../office/avatar3d';

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

/**
 * Dragon: long body, neck and horned head, bat wings that flap, a tail. Flies at MF_FLY_HEIGHT.
 * In the rig, the arms are the wings and the legs are the tail (so the generic code can animate it).
 */
function dragon(look: TeamLook): UnitRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const scale = (m: THREE.Mesh, x: number, y: number, z: number) => (m.scale.set(x, y, z), m);
  body.add(scale(part(geo('d-body', () => new THREE.SphereGeometry(0.6, 14, 10)), look.main, 0, 0, 0), 1, 0.8, 1.55));
  body.add(scale(part(geo('d-belly', () => new THREE.SphereGeometry(0.5, 12, 8)), GOLD, 0, -0.18, 0.05), 0.9, 0.6, 1.4));
  // Spikes along the back.
  for (let i = 0; i < 4; i++) body.add(part(geo('d-spike', () => new THREE.ConeGeometry(0.1, 0.32, 5)), look.dark, 0, 0.5 - i * 0.04, 0.55 - i * 0.4));
  const head = new THREE.Group();
  head.position.set(0, 0.55, 1.15);
  head.add(scale(part(geo('d-neck', () => new THREE.CylinderGeometry(0.2, 0.3, 0.8, 10)), look.main, 0, -0.25, -0.25), 1, 1, 1).rotateX(0.8));
  head.add(scale(part(geo('d-head', () => new THREE.SphereGeometry(0.34, 12, 10)), look.main, 0, 0.1, 0.15), 1, 0.85, 1.25));
  head.add(scale(part(geo('d-snout', () => new THREE.BoxGeometry(0.34, 0.2, 0.42)), look.main, 0, 0.0, 0.55), 1, 1, 1));
  const eye = geo('d-eye', () => new THREE.SphereGeometry(0.06, 6, 6));
  head.add(part(eye, '#ffe36b', -0.17, 0.2, 0.42, '#ffe36b'));
  head.add(part(eye, '#ffe36b', 0.17, 0.2, 0.42, '#ffe36b'));
  const horn = geo('d-horn', () => new THREE.ConeGeometry(0.06, 0.38, 6).rotateX(-0.9));
  head.add(part(horn, '#f4ead2', -0.16, 0.38, -0.05));
  head.add(part(horn, '#f4ead2', 0.16, 0.38, -0.05));
  body.add(head);
  // Wings: pivot at the shoulder, membrane in the dark team color.
  const wing = (side: number) => {
    const g = new THREE.Group();
    g.position.set(0.42 * side, 0.3, 0.25);
    const bone = part(geo('d-bone', () => new THREE.CylinderGeometry(0.05, 0.04, 1.7, 6).rotateZ(Math.PI / 2).translate(0.85, 0, 0)), look.dark);
    bone.scale.x = side;
    g.add(bone);
    const membrane = new THREE.Mesh(
      geo('d-wing', () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(1.7, 0);
        shape.lineTo(1.3, -0.5);
        shape.lineTo(0.85, -0.85);
        shape.lineTo(0.35, -0.75);
        shape.lineTo(0, -0.45);
        return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
      }),
      new THREE.MeshToonMaterial({ color: look.dark, side: THREE.DoubleSide, gradientMap: toonGradient() }),
    );
    membrane.scale.x = side;
    membrane.castShadow = true;
    g.add(membrane);
    body.add(g);
    return g;
  };
  const armL = wing(-1);
  const armR = wing(1);
  // Tail in two segments.
  const legL = new THREE.Group();
  legL.position.set(0, 0, -0.85);
  legL.add(part(geo('d-tail1', () => new THREE.ConeGeometry(0.28, 1.1, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.5)), look.main));
  const legR = new THREE.Group();
  legR.position.set(0, 0, -1);
  legR.add(part(geo('d-tail2', () => new THREE.ConeGeometry(0.15, 0.8, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.4)), look.main));
  legR.add(part(geo('d-tailtip', () => new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.85)), look.dark));
  legL.add(legR);
  body.add(legL);
  // Claws tucked under the belly.
  body.add(part(geo('d-claw', () => new THREE.BoxGeometry(0.16, 0.3, 0.2)), look.dark, -0.3, -0.5, 0.3));
  body.add(part(geo('d-claw', () => new THREE.BoxGeometry(0.16, 0.3, 0.2)), look.dark, 0.3, -0.5, 0.3));
  // The fire glow in the mouth doubles as the "orb" that lights up when it attacks.
  const orb = part(geo('d-mouth', () => new THREE.SphereGeometry(0.12, 8, 6)), look.magic, 0, -0.02, 0.78, '#ffb347');
  orb.castShadow = false;
  head.add(orb);
  body.position.y = 0;
  return { root, body, head, armL, armR, legL, legR, orb, cape: null, height: 1.2 };
}

/** A fortress gate: heavy wooden double door with iron bands. Its rig's body is the door. */
function gate(): UnitRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const plank = geo('g-plank', () => new THREE.BoxGeometry(0.7, 3.4, 0.35));
  for (let i = 0; i < 6; i++) body.add(part(plank, i % 2 ? '#7a4f2e' : '#6b4428', -1.85 + i * 0.74, 1.7, 0));
  const band = geo('g-band', () => new THREE.BoxGeometry(4.4, 0.18, 0.42));
  for (const y of [0.6, 1.8, 3]) body.add(part(band, '#4a4f57', 0, y, 0));
  const stud = geo('g-stud', () => new THREE.SphereGeometry(0.07, 6, 4));
  for (const y of [0.6, 1.8, 3]) for (let i = -2; i <= 2; i++) body.add(part(stud, '#9aa2ab', i * 0.85, y, 0.22));
  const empty = () => new THREE.Group();
  const head = empty();
  const armL = empty();
  const armR = empty();
  const legL = empty();
  const legR = empty();
  body.add(head, armL, armR, legL, legR);
  return { root, body, head, armL, armR, legL, legR, orb: null, cape: null, height: 3.6 };
}

const bakedMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });

/**
 * Draw-call diet: every animated part (body, head, arms, legs) becomes a single mesh with its
 * colors baked into the vertices, so a soldier costs ~6 draw calls instead of ~25.
 */
function bake(rig: UnitRig): UnitRig {
  const parts = [rig.body, rig.head, rig.armL, rig.armR, rig.legL, rig.legR];
  const keep = new Set<THREE.Object3D>([rig.orb, rig.cape].filter(Boolean) as THREE.Object3D[]);
  rig.root.updateMatrixWorld(true);
  for (const g of parts) {
    const inv = g.matrixWorld.clone().invert();
    const geos: THREE.BufferGeometry[] = [];
    const drop: THREE.Mesh[] = [];
    const visit = (o: THREE.Object3D) => {
      for (const c of o.children) {
        if (parts.includes(c as THREE.Group) || keep.has(c)) continue;
        const m = c as THREE.Mesh;
        const mat = m.material as THREE.MeshToonMaterial | undefined;
        if (m.isMesh && mat && !Array.isArray(mat) && mat.side !== THREE.DoubleSide && !mat.emissiveIntensity) {
          const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
          geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
          const n = geo.attributes.position!.count;
          const col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) col.set([mat.color.r, mat.color.g, mat.color.b], i * 3);
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          geos.push(geo);
          drop.push(m);
        }
        visit(c);
      }
    };
    visit(g);
    if (geos.length < 2) continue;
    const merged = mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    for (const m of drop) m.parent?.remove(m);
    const mesh = new THREE.Mesh(merged, bakedMat);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return rig;
}

export function buildUnit(kind: MfUnitKind, team: number): UnitRig {
  const look = TEAM_LOOKS[team] ?? TEAM_LOOKS[0]!;
  const rig = kind === 'gate' ? gate() : kind === 'commander' ? commander(look) : kind === 'mage' ? mage(look) : kind === 'beast' ? dragon(look) : warrior(look);
  return bake(rig);
}

/** Shared ring geometry for the ground marker under each soldier. */
export const RING_GEO = new THREE.RingGeometry(0.42, 0.52, 24).rotateX(-Math.PI / 2);
