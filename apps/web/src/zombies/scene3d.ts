import * as THREE from 'three';
import {
  DOORS,
  FORTS,
  FORT_IDS,
  MATERIALS,
  MATERIAL_IDS,
  ZMAP,
  ZOMBIE_KINDS,
  ZPROPS,
  ZWALLS,
  type FortId,
  type Solid,
  type VehicleId,
  type WeaponId,
  type ZombieKind,
} from '@inbox/shared';
import { mesh, toon } from '../office/avatar3d';
import { textSprite } from '../sales/scene3d';

/**
 * Models for Zona Zombi, built from simple shapes like the rest of the 3D modes: the map with its
 * three strongholds, the zombies, the vehicles and the weapons. All original, toon-shaded.
 */

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const WALL_STYLE: Record<FortId, { h: number; main: string; top: string; trim: string }> = {
  castillo: { h: 2.8, main: '#b9ad97', top: '#a29680', trim: '#7d725f' },
  torre: { h: 2.6, main: '#6b5a9e', top: '#57488a', trim: '#c9a8ff' },
  corporativo: { h: 3.0, main: '#9fd3ff', top: '#5e6b7a', trim: '#e9eef3' },
};

export interface Barricade {
  group: THREE.Group;
  layers: Record<string, THREE.Object3D>;
  shown: string;
}

export interface ZombieMap {
  group: THREE.Group;
  barricades: Barricade[];
  shopRings: Map<FortId, THREE.Mesh>;
  doorRings: THREE.Mesh[];
  keepers: THREE.Group[];
  glow: THREE.Object3D[];
  update(time: number): void;
}

/** Everything that doesn't move: ground, roads, strongholds, shops and props. */
export function buildZombieMap(): ZombieMap {
  const group = new THREE.Group();
  const H = ZMAP.half;

  // Ground: grass with dirt roads from the plaza to each stronghold, painted on one big texture.
  const S = 1024;
  const toTex = (v: number) => ((v + H) / (2 * H)) * S;
  const ground = canvasTexture(S, S, (c) => {
    c.fillStyle = '#4f7a3c';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) {
      c.fillStyle = i % 3 ? 'rgba(30,60,20,.18)' : 'rgba(140,190,90,.14)';
      const x = (i * 7919) % S;
      const y = (i * 104729) % S;
      c.fillRect(x, y, 3 + (i % 5), 2 + (i % 4));
    }
    c.lineCap = 'round';
    for (const id of FORT_IDS) {
      const p = FORTS[id].pad;
      c.strokeStyle = '#8a7556';
      c.lineWidth = 46;
      c.beginPath();
      c.moveTo(toTex(0), toTex(0));
      c.lineTo(toTex(p.x), toTex(p.z));
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.08)';
      c.lineWidth = 4;
      c.setLineDash([18, 22]);
      c.stroke();
      c.setLineDash([]);
    }
    // The plaza.
    c.fillStyle = '#9b9488';
    c.beginPath();
    c.arc(toTex(0), toTex(0), (8 / (2 * H)) * S, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#7d776c';
    c.lineWidth = 6;
    c.stroke();
    // Courtyards.
    const floors: Record<FortId, string> = { castillo: '#a69a83', torre: '#4c4170', corporativo: '#c9ced6' };
    for (const id of FORT_IDS) {
      const f = FORTS[id];
      c.fillStyle = floors[id];
      c.fillRect(toTex(f.cx - f.hw), toTex(f.cz - f.hd), ((2 * f.hw) / (2 * H)) * S, ((2 * f.hd) / (2 * H)) * S);
      c.strokeStyle = 'rgba(0,0,0,.12)';
      c.lineWidth = 1;
      const step = (1.5 / (2 * H)) * S;
      for (let x = toTex(f.cx - f.hw); x < toTex(f.cx + f.hw); x += step) {
        c.beginPath();
        c.moveTo(x, toTex(f.cz - f.hd));
        c.lineTo(x, toTex(f.cz + f.hd));
        c.stroke();
      }
      for (let y = toTex(f.cz - f.hd); y < toTex(f.cz + f.hd); y += step) {
        c.beginPath();
        c.moveTo(toTex(f.cx - f.hw), y);
        c.lineTo(toTex(f.cx + f.hw), y);
        c.stroke();
      }
      // Parking pad.
      // Parking pad: light asphalt with a painted yellow frame, so it never reads as a shadow.
      const px = toTex(f.pad.x - 4);
      const pz = toTex(f.pad.z - 2.6);
      const pw = (8 / (2 * H)) * S;
      const ph = (5.2 / (2 * H)) * S;
      c.fillStyle = '#8b8a86';
      c.fillRect(px, pz, pw, ph);
      c.strokeStyle = '#f2c230';
      c.lineWidth = 2;
      c.setLineDash([5, 3]);
      c.strokeRect(px + 1.5, pz + 1.5, pw - 3, ph - 3);
      c.setLineDash([]);
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, 2 * H), new THREE.MeshToonMaterial({ map: ground }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // Beyond the edge: dark woods.
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(6 * H, 6 * H), new THREE.MeshBasicMaterial({ color: '#25331f' }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.05;
  group.add(outside);
  const fence = toon('#3d2c1e');
  for (let i = -H; i <= H; i += 3) {
    for (const [x, z] of [
      [i, -H - 0.4],
      [i, H + 0.4],
      [-H - 0.4, i],
      [H + 0.4, i],
    ] as const)
      group.add(mesh(new THREE.ConeGeometry(0.9, 3.2, 6), toon('#2f4a26'), x, 1.6, z));
  }
  void fence;

  // Plaza fountain.
  group.add(mesh(new THREE.CylinderGeometry(2, 2.2, 0.6, 20), toon('#8e877a'), 0, 0.3, 0));
  const water = mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.1, 20), new THREE.MeshBasicMaterial({ color: '#4fa3d8' }), 0, 0.62, 0);
  group.add(water);
  group.add(mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 10), toon('#8e877a'), 0, 1.1, 0));

  const glow: THREE.Object3D[] = [];

  // Walls of the strongholds.
  for (const w of ZWALLS) {
    if (w.kind !== 'wall' || !w.fort) continue;
    const st = WALL_STYLE[w.fort];
    const g = new THREE.Group();
    g.position.set(w.x, 0, w.z);
    if (w.fort === 'corporativo') {
      // Glass between concrete posts.
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w.hw * 2, st.h, w.hd * 2), new THREE.MeshPhongMaterial({ color: st.main, transparent: true, opacity: 0.55, shininess: 90 }));
      glass.position.y = st.h / 2;
      g.add(glass);
      g.add(mesh(new THREE.BoxGeometry(w.hw * 2 + 0.1, 0.35, w.hd * 2 + 0.1), toon(st.top), 0, st.h, 0));
      g.add(mesh(new THREE.BoxGeometry(w.hw * 2 + 0.1, 0.4, w.hd * 2 + 0.1), toon(st.top), 0, 0.2, 0));
      const along = w.hw > w.hd;
      const len = along ? w.hw * 2 : w.hd * 2;
      for (let s = -len / 2; s <= len / 2 + 0.01; s += 2.5) g.add(mesh(new THREE.BoxGeometry(0.25, st.h, 0.25), toon(st.trim), along ? s : 0, st.h / 2, along ? 0 : s));
    } else {
      g.add(mesh(new THREE.BoxGeometry(w.hw * 2, st.h, w.hd * 2), toon(st.main), 0, st.h / 2, 0));
      const along = w.hw > w.hd;
      const len = along ? w.hw * 2 : w.hd * 2;
      // Crenellations, or glowing runes for the tower.
      for (let s = -len / 2 + 0.4; s < len / 2 - 0.2; s += 1.1) {
        const c = mesh(new THREE.BoxGeometry(along ? 0.55 : w.hw * 2 + 0.1, 0.45, along ? w.hd * 2 + 0.1 : 0.55), toon(st.top), along ? s : 0, st.h + 0.22, along ? 0 : s);
        g.add(c);
      }
      if (w.fort === 'torre') {
        const rune = new THREE.Mesh(new THREE.BoxGeometry(w.hw * 2 + (along ? 0 : 0.04), 0.12, w.hd * 2 + (along ? 0.04 : 0)), new THREE.MeshBasicMaterial({ color: st.trim }));
        rune.position.y = st.h * 0.62;
        g.add(rune);
        glow.push(rune);
      }
    }
    group.add(g);
  }

  // Corner towers of the castle and posts at every door.
  {
    const f = FORTS.castillo;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const x = f.cx + sx * f.hw;
      const z = f.cz + sz * f.hd;
      group.add(mesh(new THREE.CylinderGeometry(1.2, 1.35, 4.2, 12), toon('#b0a48d'), x, 2.1, z));
      group.add(mesh(new THREE.ConeGeometry(1.5, 1.8, 12), toon('#9a3b33'), x, 5.1, z));
    }
    const flag = mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), toon('#3d2c1e'), f.cx - f.hw, 6.6, f.cz - f.hd);
    group.add(flag);
    const cloth = mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshToonMaterial({ color: '#c0392b', side: THREE.DoubleSide, gradientMap: null }), f.cx - f.hw + 0.55, 7.3, f.cz - f.hd);
    group.add(cloth);
    glow.push(cloth);
  }
  for (const d of DOORS) {
    const st = WALL_STYLE[d.fort];
    const along = d.nz !== 0;
    for (const s of [-1, 1]) {
      const x = along ? d.x + s * 1.85 : d.x;
      const z = along ? d.z : d.z + s * 1.85;
      group.add(mesh(new THREE.BoxGeometry(0.7, st.h + 0.7, 0.7), toon(d.fort === 'corporativo' ? '#5e6b7a' : st.top), x, (st.h + 0.7) / 2, z));
    }
    const lintel = mesh(new THREE.BoxGeometry(along ? 4.4 : 0.7, 0.5, along ? 0.7 : 4.4), toon(d.fort === 'corporativo' ? '#5e6b7a' : st.top), d.x, st.h + 0.45, d.z);
    group.add(lintel);
  }

  // The magic tower itself.
  for (const s of ZWALLS) {
    if (s.kind !== 'tower') continue;
    group.add(mesh(new THREE.CylinderGeometry(1.8, 2.1, 11, 14), toon('#5a4a8c'), s.x, 5.5, s.z));
    group.add(mesh(new THREE.ConeGeometry(2.5, 3.6, 14), toon('#3b2f66'), s.x, 12.8, s.z));
    const orb = mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshBasicMaterial({ color: '#bffbff' }), s.x, 15.2, s.z);
    group.add(orb);
    glow.push(orb);
    for (let k = 0; k < 4; k++) {
      const win = mesh(new THREE.BoxGeometry(0.5, 0.8, 0.1), new THREE.MeshBasicMaterial({ color: '#ffd95e' }), s.x + Math.cos(k * 1.57) * 1.85, 4 + k * 1.8, s.z + Math.sin(k * 1.57) * 1.85);
      win.rotation.y = -k * 1.57 + Math.PI / 2;
      group.add(win);
    }
  }

  // A tall office block behind the corporate courtyard, for skyline.
  {
    const f = FORTS.corporativo;
    const tower = new THREE.Group();
    tower.position.set(f.cx + f.hw + 5, 0, f.cz);
    tower.add(mesh(new THREE.BoxGeometry(6, 16, 10), toon('#4b5866'), 0, 8, 0));
    const windows = canvasTexture(128, 256, (c) => {
      c.fillStyle = '#4b5866';
      c.fillRect(0, 0, 128, 256);
      for (let y = 8; y < 256; y += 20) for (let x = 8; x < 128; x += 20) {
        c.fillStyle = (x * y) % 7 === 0 ? '#ffe9a8' : '#7fb8e6';
        c.fillRect(x, y, 12, 12);
      }
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(10, 16), new THREE.MeshBasicMaterial({ map: windows }));
    face.rotation.y = -Math.PI / 2;
    face.position.set(-3.01, 8, 0);
    tower.add(face);
    const sign = textSprite('CORP S.A.', { color: '#ffffff', bg: '#2563eb', size: 60 });
    sign.position.set(0, 17.2, 0);
    sign.scale.multiplyScalar(3);
    tower.add(sign);
    group.add(tower);
  }

  // Shop counters, shopkeepers and signs.
  const shopRings = new Map<FortId, THREE.Mesh>();
  const keepers: THREE.Group[] = [];
  const COUNTER: Record<FortId, string> = { castillo: '#7a5233', torre: '#3b2f66', corporativo: '#e9eef3' };
  for (const id of FORT_IDS) {
    const f = FORTS[id];
    const c = f.counter;
    group.add(mesh(new THREE.BoxGeometry(c.hw * 2, 1.05, c.hd * 2), toon(COUNTER[id]), c.x, 0.52, c.z));
    group.add(mesh(new THREE.BoxGeometry(c.hw * 2 + 0.1, 0.1, c.hd * 2 + 0.2), toon(id === 'corporativo' ? '#2563eb' : '#c8962e'), c.x, 1.07, c.z));
    // Goods on display.
    const goods: Record<FortId, string[]> = { castillo: ['#dfe6ec', '#8a5a2b', '#9aa4ae'], torre: ['#bffbff', '#ff9a3c', '#b48cff'], corporativo: ['#2d2d33', '#ff8a00', '#9aa7b4'] };
    goods[id].forEach((col, i) => group.add(mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), toon(col), c.x - 1.2 + i * 1.2, 1.25, c.z)));
    const keeper = buildKeeper(id);
    keeper.position.set(c.x, 0, c.z - Math.sign(f.shopSpot.z - c.z) * 1.1);
    keeper.rotation.y = f.shopSpot.z > c.z ? 0 : Math.PI;
    group.add(keeper);
    keepers.push(keeper);
    const sign = textSprite(f.shop, { color: '#ffffff', bg: f.color, size: 54 });
    sign.position.set(c.x, 3.9, c.z);
    sign.scale.multiplyScalar(2.1);
    group.add(sign);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.75, 32), new THREE.MeshBasicMaterial({ color: '#ffd95e', transparent: true, opacity: 0.5, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.shopSpot.x, 0.04, f.shopSpot.z);
    group.add(ring);
    shopRings.set(id, ring);
    // Name of the stronghold over its main door.
    const d = DOORS.find((x) => x.fort === id)!;
    const name = textSprite(f.name, { color: f.color, size: 56 });
    name.position.set(d.x + d.nx * 1.2, WALL_STYLE[id].h + 2.1, d.z + d.nz * 1.2);
    name.scale.multiplyScalar(2.2);
    group.add(name);
  }

  // Doors: barricades and the ring where you stand to put them up.
  const barricades: Barricade[] = [];
  const doorRings: THREE.Mesh[] = [];
  for (const d of DOORS) {
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);
    g.rotation.y = d.nz !== 0 ? 0 : Math.PI / 2;
    const layers: Record<string, THREE.Object3D> = {};
    for (const m of MATERIAL_IDS) {
      const l = new THREE.Group();
      const col = MATERIALS[m].color;
      if (m === 'madera') {
        for (let i = 0; i < 4; i++) {
          const p = mesh(new THREE.BoxGeometry(3.6, 0.32, 0.18), toon(i % 2 ? '#8a5a2b' : col), 0, 0.45 + i * 0.6, 0);
          p.rotation.z = (i % 2 ? 1 : -1) * 0.12;
          l.add(p);
        }
      } else if (m === 'acero') {
        l.add(mesh(new THREE.BoxGeometry(3.4, 2.4, 0.16), toon(col), 0, 1.25, 0));
        for (let i = -1; i <= 1; i++) l.add(mesh(new THREE.BoxGeometry(0.12, 2.4, 0.22), toon('#6b7785'), i * 1.1, 1.25, 0));
      } else {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 0.1), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false }));
        wall.position.y = 1.3;
        l.add(wall);
        const sigil = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        sigil.position.set(0, 1.3, 0.08);
        l.add(sigil);
        glow.push(sigil);
      }
      l.visible = false;
      g.add(l);
      layers[m] = l;
    }
    group.add(g);
    barricades.push({ group: g, layers, shown: '' });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(d.in.x * 0.5 + d.x * 0.5, 0.05, d.in.z * 0.5 + d.z * 0.5);
    group.add(ring);
    doorRings.push(ring);
  }

  for (const p of ZPROPS) group.add(buildProp(p));

  return {
    group,
    barricades,
    shopRings,
    doorRings,
    keepers,
    glow,
    update(time: number) {
      glow.forEach((o, i) => {
        if (o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry) o.rotation.y = Math.sin(time * 3 + i) * 0.3;
        else o.rotation.z = time * (0.5 + (i % 3) * 0.3);
        o.scale.setScalar(1 + Math.sin(time * 2 + i) * 0.04);
      });
      water.rotation.y = time * 0.3;
      keepers.forEach((k, i) => (k.children[0]!.position.y = Math.sin(time * 2 + i) * 0.03));
    },
  };
}

function buildKeeper(id: FortId): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const outfit: Record<FortId, string> = { castillo: '#6b4029', torre: '#5b3f93', corporativo: '#2d3f5c' };
  body.add(mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 10), toon(outfit[id]), 0, 1.0, 0));
  body.add(mesh(new THREE.SphereGeometry(0.34, 14, 12), toon('#f1c9a5'), 0, 1.75, 0));
  if (id === 'castillo') body.add(mesh(new THREE.BoxGeometry(0.75, 0.55, 0.06), toon('#3d2c1e'), 0, 1.1, 0.33)); // apron
  if (id === 'torre') body.add(mesh(new THREE.ConeGeometry(0.4, 0.8, 12), toon('#3b2f66'), 0, 2.25, 0));
  if (id === 'corporativo') body.add(mesh(new THREE.BoxGeometry(0.12, 0.4, 0.04), toon('#c0392b'), 0, 1.25, 0.36));
  body.add(mesh(new THREE.SphereGeometry(0.05, 6, 6), toon('#1b1f2a'), -0.12, 1.8, 0.3));
  body.add(mesh(new THREE.SphereGeometry(0.05, 6, 6), toon('#1b1f2a'), 0.12, 1.8, 0.3));
  return g;
}

function buildProp(p: Solid): THREE.Group {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.rot ?? 0;
  switch (p.kind) {
    case 'tree':
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 7), toon('#6b4029'), 0, 0.8, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(1.3, 0), toon('#3f7a37'), 0, 2.4, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(0.9, 0), toon('#4f9445'), 0.3, 3.3, 0.1));
      break;
    case 'rock':
      g.add(mesh(new THREE.DodecahedronGeometry(0.95, 0), toon('#8a8a86'), 0, 0.45, 0));
      g.add(mesh(new THREE.DodecahedronGeometry(0.5, 0), toon('#9a9a95'), 0.7, 0.3, 0.3));
      break;
    case 'wreck': {
      const rust = toon('#8a4b2f');
      g.add(mesh(new THREE.BoxGeometry(2.1, 0.6, 1.3), rust, 0, 0.5, 0));
      g.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 1.15), toon('#6e3a24'), -0.2, 1.05, 0));
      for (const [x, z] of [
        [-0.7, -0.66],
        [0.7, -0.66],
        [-0.7, 0.66],
      ] as const) {
        const w = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), toon('#1b1b1f'), x, 0.3, z);
        w.rotation.x = Math.PI / 2;
        g.add(w);
      }
      g.rotation.z = 0.05;
      break;
    }
    case 'crate':
      g.add(mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), toon('#a87a45'), 0, 0.5, 0));
      g.add(mesh(new THREE.BoxGeometry(1.04, 0.12, 1.04), toon('#7a5233'), 0, 0.5, 0));
      break;
    default:
      break;
  }
  return g;
}

// ───────────────────────────── Zombies ─────────────────────────────

export interface ZombieRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  flash: THREE.Material[];
}

const SKINS = ['#8fbf6a', '#9cc77a', '#7fae5e', '#a3b86c'];
const SHIRTS = ['#6d7f99', '#8a5a7a', '#a0825a', '#5a8a7a', '#7a6a5a', '#b2524a'];

/** A shambling zombie. Small ones are short and quick, big ones are huge and spiky. */
export function buildZombie(kind: ZombieKind, seed: number): ZombieRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skinCol = kind === 2 ? '#6f8f4f' : SKINS[seed % SKINS.length]!;
  const shirtCol = kind === 2 ? '#4a3a33' : SHIRTS[seed % SHIRTS.length]!;
  const skin = new THREE.MeshToonMaterial({ color: skinCol });
  const shirt = new THREE.MeshToonMaterial({ color: shirtCol });
  const pants = new THREE.MeshToonMaterial({ color: kind === 2 ? '#2d2a26' : '#3d4554' });
  const flash = [skin, shirt, pants];
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), shirt);
  torso.position.y = 1.0;
  torso.castShadow = true;
  body.add(torso);
  // Torn shirt bits and a belly patch.
  body.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.02), skin, 0.12, 0.92, 0.19));
  const head = new THREE.Group();
  head.position.set(0, 1.58, 0.04);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.46), skin);
  skull.castShadow = true;
  head.add(skull);
  head.add(mesh(new THREE.SphereGeometry(0.075, 8, 8), toon('#fff6c2', '#ffe066'), -0.12, 0.04, 0.23));
  head.add(mesh(new THREE.SphereGeometry(0.055, 8, 8), toon('#fff6c2', '#ffe066'), 0.13, 0.06, 0.23));
  head.add(mesh(new THREE.BoxGeometry(0.26, 0.06, 0.02), toon('#3a1f1f'), 0, -0.13, 0.235));
  if (seed % 3 === 0) head.add(mesh(new THREE.BoxGeometry(0.52, 0.12, 0.48), toon('#3d2c1e'), 0, 0.26, 0));
  const mkArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.42, 1.28, 0);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), shirt);
    sleeve.position.y = -0.12;
    g.add(sleeve);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.16), skin);
    arm.position.y = -0.42;
    arm.castShadow = true;
    g.add(arm);
    body.add(g);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  const mkLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.17, 0.66, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), pants);
    leg.position.y = -0.32;
    leg.castShadow = true;
    g.add(leg);
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.1, 0.32), toon('#2a2522'), 0, -0.62, 0.04));
    root.add(g);
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  if (kind === 2) {
    // Bone spikes on the back and big fists.
    for (let i = 0; i < 4; i++) body.add(mesh(new THREE.ConeGeometry(0.08, 0.32, 6), toon('#e9e4d8'), -0.18 + (i % 2) * 0.36, 1.05 + Math.floor(i / 2) * 0.25, -0.24));
    for (const arm of [armL, armR]) arm.add(mesh(new THREE.BoxGeometry(0.28, 0.24, 0.28), skin, 0, -0.68, 0));
  }
  root.scale.setScalar(ZOMBIE_KINDS[kind].scale);
  return { root, body, head, armL, armR, legL, legR, flash };
}

// ───────────────────────────── Vehicles ─────────────────────────────

export interface VehicleModel {
  root: THREE.Group;
  /** Turns with speed. */
  wheels: THREE.Object3D[];
  /** Where the driver sits. */
  seat: THREE.Vector3;
  float: boolean;
}

/** Vehicles look toward +z, like the avatars. */
export function buildVehicle(kind: VehicleId): VehicleModel {
  const root = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const wheel = (x: number, z: number, r: number, w: number, col = '#1b1b1f') => {
    const m = mesh(new THREE.CylinderGeometry(r, r, w, 14), toon(col), x, r, z);
    m.rotation.z = Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    root.add(g);
    wheels.push(m);
    return m;
  };
  let seat = new THREE.Vector3(0, 0.5, 0);
  let float = false;
  switch (kind) {
    case 'carro': {
      root.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 1.9), toon('#8a5a2b'), 0, 0.85, -0.1));
      root.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 0.12), toon('#6b4029'), 0, 1.3, 0.8));
      for (const s of [-1, 1]) {
        root.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 1.9), toon('#6b4029'), s * 0.78, 1.25, -0.1));
        wheel(s * 0.9, -0.3, 0.6, 0.16, '#5b3f22');
        // Scythes on the hubs.
        const blade = mesh(new THREE.BoxGeometry(0.7, 0.06, 0.12), toon('#dfe6ec'), s * 1.3, 0.6, -0.3);
        root.add(blade);
      }
      // Pole and a shield with the castle colors.
      root.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), toon('#6b4029'), 0, 0.7, 1.5));
      root.add(mesh(new THREE.BoxGeometry(0.7, 0.8, 0.08), toon('#c0392b'), 0, 1.0, 2.15));
      root.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.09), toon('#ffd95e'), 0, 1.0, 2.16));
      seat = new THREE.Vector3(0, 0.95, -0.3);
      break;
    }
    case 'alfombra': {
      const tex = canvasTexture(128, 256, (c) => {
        c.fillStyle = '#8a2b3a';
        c.fillRect(0, 0, 128, 256);
        c.strokeStyle = '#ffd95e';
        c.lineWidth = 8;
        c.strokeRect(10, 10, 108, 236);
        c.fillStyle = '#3b6fb6';
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(64, 40 + i * 52);
          c.lineTo(94, 62 + i * 52);
          c.lineTo(64, 84 + i * 52);
          c.lineTo(34, 62 + i * 52);
          c.fill();
        }
      });
      const rug = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 2.4), [toon('#8a2b3a'), toon('#8a2b3a'), new THREE.MeshToonMaterial({ map: tex }), toon('#8a2b3a'), toon('#8a2b3a'), toon('#8a2b3a')]);
      rug.castShadow = true;
      root.add(rug);
      for (const z of [-1.2, 1.2]) for (let x = -0.6; x <= 0.61; x += 0.3) root.add(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.2), toon('#ffd95e'), x, 0, z + Math.sign(z) * 0.1));
      seat = new THREE.Vector3(0, 0.05, 0);
      float = true;
      break;
    }
    case 'auto': {
      root.add(mesh(new THREE.BoxGeometry(1.5, 0.55, 2.6), toon('#e5484d'), 0, 0.6, 0));
      root.add(mesh(new THREE.BoxGeometry(1.3, 0.5, 1.3), toon('#b83a3e'), 0, 1.1, -0.2));
      root.add(mesh(new THREE.BoxGeometry(1.22, 0.36, 0.05), new THREE.MeshBasicMaterial({ color: '#9fd3ff' }), 0, 1.12, 0.46));
      root.add(mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: '#fff6c2' }), -0.5, 0.65, 1.31));
      root.add(mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: '#fff6c2' }), 0.5, 0.65, 1.31));
      for (const [x, z] of [
        [-0.78, 0.85],
        [0.78, 0.85],
        [-0.78, -0.85],
        [0.78, -0.85],
      ] as const)
        wheel(x, z, 0.32, 0.22);
      seat = new THREE.Vector3(0, 0.55, -0.2);
      break;
    }
    case 'camion': {
      root.add(mesh(new THREE.BoxGeometry(2.0, 0.7, 3.2), toon('#f2b705'), 0, 0.85, -0.3));
      root.add(mesh(new THREE.BoxGeometry(1.8, 0.9, 1.2), toon('#d99e00'), 0, 1.6, 0.4));
      root.add(mesh(new THREE.BoxGeometry(1.6, 0.45, 0.05), new THREE.MeshBasicMaterial({ color: '#9fd3ff' }), 0, 1.75, 1.01));
      root.add(mesh(new THREE.BoxGeometry(1.9, 0.6, 1.3), toon('#5e6b7a'), 0, 1.45, -1.2));
      // The plow.
      const plow = mesh(new THREE.BoxGeometry(2.9, 0.9, 0.18), toon('#c8962e'), 0, 0.55, 1.75);
      plow.rotation.x = -0.25;
      root.add(plow);
      for (let i = -1; i <= 1; i++) root.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), toon('#4a4f55'), i * 0.8, 0.7, 1.4));
      for (const [x, z] of [
        [-1.05, 0.7],
        [1.05, 0.7],
        [-1.05, -1.3],
        [1.05, -1.3],
      ] as const)
        wheel(x, z, 0.48, 0.34);
      const beacon = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 8), new THREE.MeshBasicMaterial({ color: '#ff8a00' }), 0, 2.15, 0.4);
      root.add(beacon);
      seat = new THREE.Vector3(0, 1.05, 0.35);
      break;
    }
  }
  return { root, wheels, seat, float };
}

// ───────────────────────────── Weapons in hand ─────────────────────────────

/**
 * A weapon for the right hand. Melee weapons point up from the fist like Office Battle's; guns
 * and wands point along the arm, so they aim forward when the arm is raised.
 */
export function buildWeapon(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'bate':
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.8, 8), toon('#c8962e'), 0, 0.38, 0));
      break;
    case 'espada':
      g.add(mesh(new THREE.BoxGeometry(0.09, 0.85, 0.03), toon('#dfe6ec'), 0, 0.55, 0));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.07), toon('#c8962e'), 0, 0.13, 0));
      break;
    case 'martillo':
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8), toon('#6b4029'), 0, 0.4, 0));
      g.add(mesh(new THREE.BoxGeometry(0.42, 0.26, 0.26), toon('#7d8790'), 0, 0.9, 0));
      break;
    case 'ballesta':
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), toon('#6b4029'), 0, -0.22, 0.05));
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), toon('#4a3a2a'), 0, -0.42, 0.05));
      break;
    case 'baston':
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.1, 8), toon('#7a5233'), 0, -0.1, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(0.11), toon('#ffb36b', '#ff6a00'), 0, -0.68, 0));
      break;
    case 'rayo':
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 8), toon('#2d2d33'), 0, -0.2, 0));
      g.add(mesh(new THREE.OctahedronGeometry(0.08), toon('#dffbff', '#7fe3ff'), 0, -0.5, 0));
      break;
    case 'hielo':
      g.add(mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 16), toon('#dffbff', '#7fd3ff'), 0, -0.02, 0));
      break;
    case 'pistola':
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.32, 0.09), toon('#2d2d33'), 0, -0.14, 0.04));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.16), toon('#2d2d33'), 0, 0, -0.04));
      break;
    case 'escopeta':
      g.add(mesh(new THREE.BoxGeometry(0.09, 0.8, 0.09), toon('#2d2d33'), 0, -0.3, 0.04));
      g.add(mesh(new THREE.BoxGeometry(0.11, 0.3, 0.12), toon('#6b4029'), 0, 0.1, 0.02));
      break;
    case 'motosierra':
      g.add(mesh(new THREE.BoxGeometry(0.24, 0.26, 0.3), toon('#ff8a00'), 0, -0.05, 0.08));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.75, 0.14), toon('#b4bcc4'), 0, -0.5, 0.1));
      break;
  }
  return g;
}

/** Whether the weapon is held pointing forward (guns and wands) or swung (melee). */
export const AIMED: ReadonlySet<WeaponId> = new Set(['ballesta', 'baston', 'rayo', 'pistola', 'escopeta', 'motosierra', 'hielo']);

export const SHOT_COLORS: Record<string, string> = { bolt: '#e9e4d8', fire: '#ff7a1a', zap: '#9ff3ff', bullet: '#ffe066', pellet: '#ffd95e' };
