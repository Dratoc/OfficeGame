import * as THREE from 'three';
import { HAIR_COLORS, SKIN_TONES, type AvatarConfig } from '@inbox/shared';

/**
 * Builds a chibi 3D version of the layered avatar from simple shapes, so every item from the
 * armory shows up in the office fight. Items are cosmetic only, like everywhere else.
 * The model looks toward +z and stands on y = 0, about 1.7 m tall.
 */

const OUTFIT: Record<string, { main: string; dark: string; pants: string; shoes: string; trim: string }> = {
  outfit_suit: { main: '#2d3f5c', dark: '#22314a', pants: '#26354e', shoes: '#1b1b1f', trim: '#c0392b' },
  outfit_sweater: { main: '#4f8a6d', dark: '#3f7159', pants: '#b59b74', shoes: '#5b4636', trim: '#f4efe6' },
  outfit_iron: { main: '#9aa4ae', dark: '#77818b', pants: '#5f6871', shoes: '#4a4f55', trim: '#b4373a' },
  outfit_mage: { main: '#5b3f93', dark: '#47307a', pants: '#47307a', shoes: '#2d1f4d', trim: '#e8c766' },
  outfit_gold: { main: '#d9a93a', dark: '#b88a26', pants: '#8a6a22', shoes: '#5e4818', trim: '#2d3f5c' },
};

let gradient: THREE.DataTexture | null = null;
/** Three-band ramp for the cartoon look. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const mats = new Map<string, THREE.Material>();
export function toon(color: string, emissive?: string): THREE.Material {
  const key = `${color}|${emissive ?? ''}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 0.9 : 0 });
    mats.set(key, m);
  }
  return m;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function scaled<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.scale.set(x, y, z);
  return o;
}

export interface AvatarRig {
  root: THREE.Group;
  /** Everything above the feet; bobs, tilts and rolls. */
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  cape: THREE.Object3D | null;
  wings: THREE.Group | null;
  pet: THREE.Group | null;
  aura: THREE.Object3D | null;
  barrier: THREE.Mesh;
  stars: THREE.Group;
  trail: THREE.Mesh;
  /** Golden folder shield from the power. */
  shield: THREE.Mesh;
}

export function buildAvatar(config: AvatarConfig, accent: string): AvatarRig {
  const eq = config.equipped;
  const skin = SKIN_TONES[config.skin] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[config.hairColor] ?? HAIR_COLORS[0];
  const headId = eq.head ?? 'head_human';
  const dragon = headId === 'head_dragon';
  const face = headId === 'head_orc' ? '#86a95d' : dragon ? '#3f9b74' : skin;
  const o = OUTFIT[eq.outfit ?? 'outfit_suit'] ?? OUTFIT.outfit_suit!;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Ground ring in the player's color so you always know who is who.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  root.add(ring);

  // Legs
  const mkLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(0.15 * side, 0.5, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.4, 10), toon(o.pants), 0, -0.2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), toon(o.shoes), 0, -0.44, 0.05));
    body.add(g);
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // Torso
  const torso = new THREE.Group();
  torso.position.y = 0.78;
  body.add(torso);
  if (eq.outfit === 'outfit_mage') {
    torso.add(mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.75, 14), toon(o.main), 0, -0.12, 0));
    torso.add(mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 20), toon(o.trim), 0, -0.46, 0).rotateX(Math.PI / 2));
  } else {
    torso.add(mesh(new THREE.CapsuleGeometry(0.29, 0.28, 4, 14), toon(o.main), 0, 0, 0));
  }
  if (eq.outfit === 'outfit_suit' || eq.outfit === 'outfit_gold' || eq.outfit === 'outfit_iron' || !eq.outfit) {
    // Shirt and tie: this is still an office.
    torso.add(mesh(new THREE.BoxGeometry(0.18, 0.3, 0.05), toon('#f6f4ef'), 0, 0.08, 0.27));
    torso.add(mesh(new THREE.BoxGeometry(0.07, 0.28, 0.06), toon(o.trim), 0, 0.03, 0.3));
  }
  if (eq.outfit === 'outfit_iron' || eq.outfit === 'outfit_gold') {
    const plate = eq.outfit === 'outfit_gold' ? '#f0c95a' : '#b7c0c9';
    torso.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), toon(plate), -0.3, 0.2, 0));
    torso.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), toon(plate), 0.3, 0.2, 0));
  }
  if (eq.outfit === 'outfit_sweater') {
    torso.add(mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), toon(o.trim), 0, 0.27, 0).rotateX(Math.PI / 2));
  }

  // Arms (pivot at the shoulder)
  const mkArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(0.36 * side, 0.98, 0);
    g.add(mesh(new THREE.CapsuleGeometry(0.08, 0.26, 4, 8), toon(o.main), 0, -0.2, 0));
    g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(face), 0, -0.42, 0));
    body.add(g);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  const hand = new THREE.Group();
  hand.position.set(0, -0.44, 0.04);
  armR.add(hand);
  addWeapon(hand, eq.weapon ?? null);

  // Head
  const head = new THREE.Group();
  head.position.y = 1.36;
  body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.4, 20, 16), toon(face));
  skull.scale.set(1, 0.95, 0.95);
  head.add(skull);
  if (headId === 'head_elf') {
    for (const s of [-1, 1]) head.add(mesh(new THREE.ConeGeometry(0.08, 0.32, 6), toon(face), 0.42 * s, 0.05, 0).rotateZ(-s * 1.2));
  }
  if (headId === 'head_orc') {
    for (const s of [-1, 1]) head.add(mesh(new THREE.ConeGeometry(0.04, 0.12, 6), toon('#fffbe8'), 0.12 * s, -0.16, 0.34));
  }
  if (dragon) {
    head.add(scaled(mesh(new THREE.SphereGeometry(0.24, 14, 10), toon('#58b38c'), 0, -0.08, 0.3), 1.1, 0.7, 1));
    for (const s of [-1, 1]) head.add(mesh(new THREE.ConeGeometry(0.07, 0.34, 8), toon('#e8d9a8'), 0.22 * s, 0.38, -0.05).rotateZ(-s * 0.35));
  }
  // Eyes
  const eyeColor = eq.eyes === 'eyes_glow' ? '#bffbff' : '#1d2a33';
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(eq.eyes === 'eyes_happy' ? 0.045 : 0.06, 10, 8), toon(eyeColor, eq.eyes === 'eyes_glow' ? '#22c3d6' : undefined), 0.14 * s, dragon ? 0.08 : 0.02, 0.36);
    eye.scale.set(1, eq.eyes === 'eyes_sharp' ? 0.6 : eq.eyes === 'eyes_happy' ? 0.5 : 1.25, 0.6);
    head.add(eye);
  }
  head.add(scaled(mesh(new THREE.SphereGeometry(0.05, 8, 6), toon('#ff8a8a'), -0.22, -0.08, 0.31), 1.2, 0.6, 0.5));
  head.add(scaled(mesh(new THREE.SphereGeometry(0.05, 8, 6), toon('#ff8a8a'), 0.22, -0.08, 0.31), 1.2, 0.6, 0.5));
  if (!dragon) addHair(head, eq.hair ?? null, hair);
  if (!dragon && eq.beard) addBeard(head, eq.beard, hair);
  addHeadgear(head, eq.headgear ?? null);

  // Back items
  let cape: THREE.Object3D | null = null;
  if (eq.cape) {
    const color = eq.cape === 'cape_royal' ? '#6b2fa0' : '#b52b2b';
    const geo = new THREE.PlaneGeometry(0.7, 0.95, 1, 4);
    geo.translate(0, -0.47, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), side: THREE.DoubleSide }));
    m.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.05, -0.3);
    pivot.add(m);
    if (eq.cape === 'cape_royal') pivot.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 14), toon('#f6f4ef'), 0, 0, 0.08));
    body.add(pivot);
    cape = pivot;
  }
  let wings: THREE.Group | null = null;
  if (eq.wings) {
    wings = new THREE.Group();
    wings.position.set(0, 1.0, -0.28);
    const color = eq.wings === 'wings_angel' ? '#ffffff' : eq.wings === 'wings_dragon' ? '#3f9b74' : '#ff8a1f';
    const glow = eq.wings === 'wings_phoenix' ? '#ff4d1f' : undefined;
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(0.5 * s, 0.55, 0.85 * s, 0.35);
      shape.lineTo(0.62 * s, 0.05);
      shape.lineTo(0.7 * s, -0.25);
      shape.quadraticCurveTo(0.3 * s, -0.12, 0, -0.1);
      const w = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), side: THREE.DoubleSide, emissive: glow ?? '#000', emissiveIntensity: glow ? 0.5 : 0 }));
      w.rotation.y = s * 0.5;
      w.name = s < 0 ? 'wl' : 'wr';
      wings.add(w);
    }
    body.add(wings);
  }

  // Pet floats next to its owner.
  let pet: THREE.Group | null = null;
  if (eq.pet) {
    pet = new THREE.Group();
    pet.position.set(-0.75, 1.35, -0.2);
    const color = eq.pet === 'pet_cat' ? '#f0a35e' : eq.pet === 'pet_dragon_green' ? '#58b38c' : eq.pet === 'pet_dragon_red' ? '#d64545' : '#f0c95a';
    pet.add(mesh(new THREE.SphereGeometry(0.16, 12, 10), toon(color)));
    pet.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), toon(color), 0, 0.17, 0.05));
    for (const s of [-1, 1]) {
      pet.add(mesh(new THREE.ConeGeometry(0.04, 0.09, 4), toon(color), 0.07 * s, 0.3, 0.05));
      pet.add(mesh(new THREE.SphereGeometry(0.02, 6, 4), toon('#1d2a33'), 0.05 * s, 0.19, 0.16));
      if (eq.pet !== 'pet_cat') pet.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 3), toon(color), 0.16 * s, 0.05, -0.05).rotateZ(-s * 1.3));
    }
    root.add(pet);
  }

  let aura: THREE.Object3D | null = null;
  if (eq.effect) {
    const color = eq.effect === 'effect_fire' ? '#ff7a2b' : eq.effect === 'effect_mythic' ? '#9b6bff' : '#ffd95e';
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    m.rotation.x = Math.PI / 2;
    m.position.y = 0.1;
    const sparks = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color }));
      const a = (i / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.6, 0.3 + (i % 3) * 0.45, Math.sin(a) * 0.6);
      sparks.add(s);
    }
    const g = new THREE.Group();
    g.add(m, sparks);
    root.add(g);
    aura = g;
  }

  // Block bubble, dizzy stars and dodge trail; hidden until needed.
  const barrier = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#7fd3ff', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  barrier.rotation.x = Math.PI / 2;
  barrier.position.set(0, 0.85, 0.05);
  barrier.visible = false;
  root.add(barrier);

  const stars = new THREE.Group();
  stars.position.y = 1.9;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: '#ffd95e' }));
    const a = (i / 3) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
    stars.add(s);
  }
  stars.visible = false;
  root.add(stars);

  const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 1.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.25, depthWrite: false }));
  trail.position.y = 0.8;
  trail.visible = false;
  root.add(trail);

  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), new THREE.MeshBasicMaterial({ color: '#ffd95e', transparent: true, opacity: 0.3, wireframe: true, depthWrite: false }));
  shield.position.y = 0.85;
  shield.visible = false;
  root.add(shield);

  return { root, body, head, armL, armR, legL, legR, cape, wings, pet, aura, barrier, stars, trail, shield };
}

function addWeapon(hand: THREE.Group, id: string | null) {
  const g = new THREE.Group();
  hand.add(g);
  switch (id) {
    case 'weapon_sword':
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.75, 0.03), toon('#dfe6ec'), 0, 0.5, 0));
      g.add(mesh(new THREE.BoxGeometry(0.28, 0.05, 0.06), toon('#c8962e'), 0, 0.12, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), toon('#6b4029'), 0, 0.02, 0));
      break;
    case 'weapon_staff':
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.1, 8), toon('#7a5233'), 0, 0.3, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(0.1), toon('#bffbff', '#22c3d6'), 0, 0.9, 0));
      break;
    case 'weapon_stapler':
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), toon('#6b4029'), 0, 0.3, 0));
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.12), toon('#c0392b'), 0.1, 0.62, 0));
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.05, 0.13), toon('#2d2d33'), 0.1, 0.53, 0));
      break;
    case 'weapon_mug':
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 12), toon('#f4efe6'), 0, 0.08, 0.06));
      g.add(mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 10), toon('#f4efe6'), 0.11, 0.08, 0.06));
      g.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 12), toon('#6b4029'), 0, 0.18, 0.06));
      break;
    default:
      // A rolled-up report: everyone gets something to swing.
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), toon('#f6f4ef'), 0, 0.2, 0));
  }
}

function addHair(head: THREE.Group, id: string | null, color: string) {
  const m = toon(color);
  switch (id) {
    case 'hair_short': {
      const cap = mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), m, 0, 0.04, -0.02);
      head.add(cap);
      break;
    }
    case 'hair_long': {
      head.add(mesh(new THREE.SphereGeometry(0.43, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), m, 0, 0.03, -0.02));
      head.add(mesh(new THREE.BoxGeometry(0.78, 0.6, 0.3), m, 0, -0.22, -0.2));
      break;
    }
    case 'hair_bun':
      head.add(mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), m, 0, 0.04, -0.02));
      head.add(mesh(new THREE.SphereGeometry(0.16, 12, 10), m, 0, 0.44, -0.12));
      head.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), toon('#e8c766'), 0, 0.46, -0.12).rotateZ(1.2));
      break;
    case 'hair_mohawk':
      for (let i = 0; i < 5; i++) head.add(mesh(new THREE.ConeGeometry(0.07, 0.28, 6), m, 0, 0.42 - Math.abs(i - 2) * 0.03, 0.2 - i * 0.12).rotateX(-0.3 + i * 0.15));
      break;
    case 'hair_flame':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const f = mesh(new THREE.ConeGeometry(0.1, 0.42, 6), toon(i % 2 ? '#ff9f1c' : '#ff4d1f', '#ff4d1f'), Math.cos(a) * 0.2, 0.42, Math.sin(a) * 0.2 - 0.05);
        f.name = 'flame';
        head.add(f);
      }
      break;
  }
}

function addBeard(head: THREE.Group, id: string, color: string) {
  if (id === 'beard_wizard') {
    head.add(mesh(new THREE.ConeGeometry(0.26, 0.7, 10), toon('#e9e6df'), 0, -0.45, 0.24).rotateX(Math.PI));
  } else if (id === 'beard_viking') {
    head.add(mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(color), 0, -0.1, 0.12));
    for (const s of [-1, 1]) head.add(mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.3, 6), toon(color), 0.12 * s, -0.45, 0.28));
  } else {
    const b = mesh(new THREE.SphereGeometry(0.37, 14, 10, 0, Math.PI * 2, Math.PI / 1.8, Math.PI / 3), toon(color), 0, 0, 0.03);
    head.add(b);
  }
}

function addHeadgear(head: THREE.Group, id: string | null) {
  switch (id) {
    case 'headgear_knight':
      head.add(mesh(new THREE.SphereGeometry(0.44, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon('#a9b2bb'), 0, 0.02, 0));
      head.add(mesh(new THREE.BoxGeometry(0.62, 0.07, 0.1), toon('#7d8790'), 0, 0.12, 0.38));
      head.add(mesh(new THREE.ConeGeometry(0.08, 0.35, 6), toon('#c0392b'), 0, 0.6, -0.05).rotateX(-0.5));
      break;
    case 'headgear_viking':
      head.add(mesh(new THREE.SphereGeometry(0.44, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon('#8a929b'), 0, 0.04, 0));
      head.add(mesh(new THREE.TorusGeometry(0.43, 0.05, 6, 24), toon('#6b5238'), 0, 0.06, 0).rotateX(Math.PI / 2));
      for (const s of [-1, 1]) head.add(mesh(new THREE.ConeGeometry(0.08, 0.38, 8), toon('#f2ead2'), 0.48 * s, 0.32, 0).rotateZ(-s * 0.8));
      break;
    case 'headgear_wizard':
      head.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 20), toon('#3a2766'), 0, 0.26, 0));
      head.add(mesh(new THREE.ConeGeometry(0.36, 0.85, 16), toon('#5b3f93'), 0, 0.68, -0.05).rotateX(-0.15));
      head.add(mesh(new THREE.OctahedronGeometry(0.07), toon('#e8c766', '#e8c766'), 0, 0.6, 0.29));
      break;
    case 'headgear_crown':
    case 'headgear_mythic': {
      const mythic = id === 'headgear_mythic';
      const gold = toon(mythic ? '#c9b6ff' : '#f0c95a', mythic ? '#7a5cff' : undefined);
      head.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 16, 1, true), gold, 0, 0.36, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        head.add(mesh(new THREE.ConeGeometry(0.06, 0.18, 4), gold, Math.cos(a) * 0.28, 0.5, Math.sin(a) * 0.28));
      }
      head.add(mesh(new THREE.OctahedronGeometry(0.06), toon(mythic ? '#38d6e0' : '#d64545', mythic ? '#38d6e0' : undefined), 0, 0.36, 0.3));
      break;
    }
  }
}
