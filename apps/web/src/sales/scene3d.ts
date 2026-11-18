import * as THREE from 'three';
import { ACCESSORIES, BRANCHES, COUNTER_BOX, MODELS, STATIONS, ZONES, type AccessoryId, type ItemKind, type ModelId, type StationDef, type ZoneId } from '@inbox/shared';
import { mesh, toon } from '../office/avatar3d';
import { furniture } from '../office/office3d';

/**
 * The machinery dealership where A Toda Máquina happens, seen from above: the sales counter on
 * the street, the order desks, management with its stamps, the machine yard and the dispatch
 * area with its accessory racks and one loading dock per branch. Everything is built from simple
 * shapes in the same cartoon style as the rest of the game.
 */

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
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

/** A flat sign with text, for station labels painted on the floor or hung on walls. */
export function textSprite(text: string, opts: { color?: string; bg?: string; size?: number; width?: number } = {}): THREE.Sprite {
  const width = opts.width ?? 512;
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = 112;
  const c = cv.getContext('2d')!;
  let size = opts.size ?? 52;
  c.font = `800 ${size}px system-ui, sans-serif`;
  while (size > 20 && c.measureText(text).width > width - 40) {
    size -= 2;
    c.font = `800 ${size}px system-ui, sans-serif`;
  }
  const tw = c.measureText(text).width;
  if (opts.bg) {
    c.fillStyle = opts.bg;
    const w = tw + 44;
    const x = (width - w) / 2;
    c.beginPath();
    c.roundRect(x, 16, w, 80, 22);
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(255,255,255,.9)';
    c.stroke();
  }
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (!opts.bg) {
    c.lineWidth = 9;
    c.strokeStyle = 'rgba(15,18,28,.85)';
    c.strokeText(text, width / 2, 57);
  }
  c.fillStyle = opts.color ?? '#ffffff';
  c.fillText(text, width / 2, 57);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((width / 112) * 0.55, 0.55, 1);
  return s;
}

/** Text painted flat on the floor. */
function floorText(text: string, color: string, w = 4, h = 0.7): THREE.Mesh {
  const tex = canvasTexture(
    512,
    90,
    (c) => {
      let size = 64;
      c.font = `900 ${size}px system-ui, sans-serif`;
      while (size > 20 && c.measureText(text).width > 490) {
        size -= 2;
        c.font = `900 ${size}px system-ui, sans-serif`;
      }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = color;
      c.fillText(text, 256, 48);
    },
    false,
  );
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export interface MachineModel {
  root: THREE.Group;
  /** Accessory meshes, shown or hidden. */
  acc: Record<AccessoryId, THREE.Object3D | null>;
  beacon: THREE.Object3D | null;
}

/**
 * A machine of the catalog, about real size, facing +z (forks or cab forward), standing on y = 0.
 * Accessories are built in and hidden; `setAccessory` shows the right one.
 */
export function buildMachine(model: ModelId): MachineModel {
  const root = new THREE.Group();
  const color = MODELS[model].color;
  const dark = '#2e3440';
  const wheel = (x: number, z: number, r = 0.22, w = 0.18) => {
    const m = mesh(new THREE.CylinderGeometry(r, r, w, 14), toon('#1d2027'), x, r, z);
    m.rotation.z = Math.PI / 2;
    root.add(m);
  };
  const acc: MachineModel['acc'] = { horquillas: null, bateria: null, baliza: null };
  let beacon: THREE.Object3D | null = null;
  const addBeacon = (y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(0, y, z);
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 10), toon('#2e3440')));
    g.add(mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ff9f1a', '#ff7b00'), 0, 0.03, 0));
    root.add(g);
    acc.baliza = g;
    beacon = g;
  };

  if (model === 'electrica' || model === 'gas') {
    // Counterbalanced forklift: body, counterweight, overhead guard, mast and forks.
    root.add(mesh(new THREE.BoxGeometry(1.0, 0.55, 1.35), toon(color), 0, 0.55, -0.1));
    root.add(mesh(new THREE.BoxGeometry(1.02, 0.5, 0.35), toon(dark), 0, 0.6, -0.72));
    root.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.45), toon('#22252b'), 0, 0.88, -0.2));
    root.add(mesh(new THREE.BoxGeometry(0.5, 0.45, 0.1), toon('#22252b'), 0, 1.1, -0.42));
    for (const [x, z] of [[-0.42, 0.42], [0.42, 0.42], [-0.42, -0.6], [0.42, -0.6]] as const) root.add(mesh(new THREE.BoxGeometry(0.06, 1.25, 0.06), toon(dark), x, 1.4, z));
    root.add(mesh(new THREE.BoxGeometry(0.95, 0.05, 1.15), toon(dark), 0, 2.02, -0.09));
    root.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), toon('#c0392b'), 0.2, 1.06, 0.25));
    // Mast and carriage.
    for (const x of [-0.32, 0.32]) root.add(mesh(new THREE.BoxGeometry(0.09, 2.0, 0.09), toon('#4a4f5a'), x, 1.05, 0.62));
    root.add(mesh(new THREE.BoxGeometry(0.75, 0.3, 0.06), toon('#4a4f5a'), 0, 0.35, 0.7));
    const forks = new THREE.Group();
    for (const x of [-0.22, 0.22]) forks.add(mesh(new THREE.BoxGeometry(0.1, 0.05, 0.85), toon('#5d636e'), x, 0.1, 1.12));
    root.add(forks);
    const longForks = new THREE.Group();
    for (const x of [-0.22, 0.22]) longForks.add(mesh(new THREE.BoxGeometry(0.11, 0.06, 1.5), toon(ACCESSORIES.horquillas.color), x, 0.12, 1.45));
    root.add(longForks);
    acc.horquillas = longForks;
    // A brand-free stripe and wheels.
    root.add(mesh(new THREE.BoxGeometry(1.02, 0.08, 1.0), toon('#1d2027'), 0, 0.56, 0.0));
    wheel(-0.48, 0.35, 0.26, 0.2);
    wheel(0.48, 0.35, 0.26, 0.2);
    wheel(-0.45, -0.6, 0.2);
    wheel(0.45, -0.6, 0.2);
    if (model === 'gas') {
      // LPG tank strapped on the back.
      const tank = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 14), toon('#e8e8e8'), 0, 1.05, -0.78);
      tank.rotation.z = Math.PI / 2;
      root.add(tank);
      root.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), toon('#c0392b'), 0.42, 1.05, -0.78));
    } else {
      const batt = mesh(new THREE.BoxGeometry(0.36, 0.34, 0.28), toon(ACCESSORIES.bateria.color), 0.6, 0.55, -0.35);
      root.add(batt);
      acc.bateria = batt;
    }
    addBeacon(2.05, -0.45);
  } else if (model === 'transpaleta') {
    // Powered pallet truck: low body, tiller and long forks.
    root.add(mesh(new THREE.BoxGeometry(0.75, 0.75, 0.55), toon(color), 0, 0.5, -0.35));
    root.add(mesh(new THREE.BoxGeometry(0.76, 0.12, 0.56), toon('#1d2027'), 0, 0.12, -0.35));
    for (const x of [-0.2, 0.2]) root.add(mesh(new THREE.BoxGeometry(0.17, 0.08, 1.2), toon('#4a4f5a'), x, 0.08, 0.5));
    const tiller = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), toon('#22252b'), 0, 1.15, -0.7);
    tiller.rotation.x = -0.45;
    root.add(tiller);
    root.add(mesh(new THREE.BoxGeometry(0.4, 0.06, 0.08), toon('#22252b'), 0, 1.55, -0.9));
    const batt = mesh(new THREE.BoxGeometry(0.32, 0.28, 0.24), toon(ACCESSORIES.bateria.color), 0.48, 0.42, -0.35);
    root.add(batt);
    acc.bateria = batt;
    wheel(0, -0.5, 0.15, 0.3);
  } else {
    // A light truck: cab, flatbed with a crate and dual rear wheels.
    root.add(mesh(new THREE.BoxGeometry(1.5, 1.15, 1.15), toon(color), 0, 1.0, 1.25));
    root.add(mesh(new THREE.BoxGeometry(1.38, 0.5, 0.05), toon('#9fd4ff'), 0, 1.3, 1.84));
    root.add(mesh(new THREE.BoxGeometry(1.55, 0.25, 0.1), toon('#22252b'), 0, 0.55, 1.86));
    root.add(mesh(new THREE.BoxGeometry(1.6, 0.18, 2.3), toon('#4a4f5a'), 0, 0.6, -0.6));
    root.add(mesh(new THREE.BoxGeometry(1.6, 0.45, 0.06), toon('#6b7280'), 0, 0.9, -1.72));
    for (const x of [-0.79, 0.79]) root.add(mesh(new THREE.BoxGeometry(0.05, 0.45, 2.3), toon('#6b7280'), x, 0.9, -0.6));
    root.add(mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), toon('#c99a62'), 0, 1.0, -0.55));
    wheel(-0.7, 1.25, 0.3, 0.25);
    wheel(0.7, 1.25, 0.3, 0.25);
    wheel(-0.7, -1.2, 0.3, 0.32);
    wheel(0.7, -1.2, 0.3, 0.32);
    addBeacon(1.62, 1.2);
  }
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  const m: MachineModel = { root, acc, beacon };
  setAccessory(m, null);
  return m;
}

export function setAccessory(m: MachineModel, accessory: AccessoryId | null | undefined) {
  for (const [id, o] of Object.entries(m.acc)) if (o) o.visible = id === accessory;
}

/** Paper in the game: a request, an order, or a stamped order. */
export function buildPaper(kind: ItemKind): THREE.Group {
  const g = new THREE.Group();
  const header = kind === 'solicitud' ? '#4f8fe0' : kind === 'oc' ? '#e8b83a' : '#e8b83a';
  const sheet = mesh(new THREE.BoxGeometry(0.46, 0.03, 0.6), toon('#fbf8f0'));
  g.add(sheet);
  g.add(mesh(new THREE.BoxGeometry(0.46, 0.035, 0.12), toon(header), 0, 0.002, -0.24));
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.32 - (i % 2) * 0.1, 0.034, 0.03), toon('#9aa1ad'), -0.04, 0.003, -0.08 + i * 0.09));
  if (kind === 'oc' || kind === 'oc_ok') g.add(mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), toon('#2e3440'), 0, 0.004, 0.22));
  if (kind === 'oc_ok') {
    const stamp = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 18), toon('#d63a3a'), 0.12, 0.01, 0.12);
    g.add(stamp);
  }
  return g;
}

/** Accessory as it looks on the rack. */
function accessoryProp(id: AccessoryId): THREE.Group {
  const g = new THREE.Group();
  if (id === 'horquillas') {
    for (const x of [-0.18, 0.18]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.06, 1.3), toon(ACCESSORIES.horquillas.color), x, 0.04, 0));
  } else if (id === 'bateria') {
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.4, 0.35), toon(ACCESSORIES.bateria.color), 0, 0.2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), toon('#d63a3a'), -0.15, 0.43, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), toon('#22252b'), 0.15, 0.43, 0));
  } else {
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 12), toon('#2e3440'), 0, 0.04, 0));
    g.add(mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ff9f1a', '#ff7b00'), 0, 0.08, 0));
  }
  return g;
}

export interface Wall {
  /** The two areas it separates. */
  between: [ZoneId, ZoneId];
  group: THREE.Group;
}

export interface SalesScene {
  group: THREE.Group;
  walls: Wall[];
  /** Where each station's item is drawn. */
  itemSpot: Map<number, THREE.Vector3>;
  /** Floor rings around the station spots, lit when you can use them. */
  rings: Map<number, THREE.Mesh>;
  /** Colored borders and labels of each area, tinted with the owner's color. */
  zoneMarks: Map<ZoneId, { border: THREE.LineSegments; label: THREE.Mesh; tint: THREE.Mesh }>;
  /** Fires in the street, one per angry customer. */
  fires: THREE.Group[];
  update(time: number, strikes: number): void;
}

/** Half width of the opening around a pass counter. */
const GAP = 1.35;

/** A wall segment along x (horizontal) or z, with gaps for pass counters. */
function wallSegment(from: number, to: number, fixed: number, alongX: boolean, gaps: number[], height: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const cuts = [...gaps].sort((a, b) => a - b);
  let start = from;
  const pieces: [number, number][] = [];
  for (const c of cuts) {
    pieces.push([start, c - GAP]);
    start = c + GAP;
  }
  pieces.push([start, to]);
  for (const [a, b] of pieces) {
    if (b - a < 0.05) continue;
    const len = b - a;
    const mid = (a + b) / 2;
    const geo = alongX ? new THREE.BoxGeometry(len, height, 0.22) : new THREE.BoxGeometry(0.22, height, len);
    const w = mesh(geo, toon(color), alongX ? mid : fixed, height / 2, alongX ? fixed : mid);
    w.receiveShadow = true;
    g.add(w);
    const capGeo = alongX ? new THREE.BoxGeometry(len, 0.06, 0.3) : new THREE.BoxGeometry(0.3, 0.06, len);
    g.add(mesh(capGeo, toon('#e9e4d8'), alongX ? mid : fixed, height + 0.03, alongX ? fixed : mid));
  }
  // Window frames over the pass counters.
  for (const c of cuts) {
    const x = alongX ? c : fixed;
    const z = alongX ? fixed : c;
    const top = mesh(alongX ? new THREE.BoxGeometry(GAP * 2, 0.12, 0.26) : new THREE.BoxGeometry(0.26, 0.12, GAP * 2), toon('#e9e4d8'), x, height + 0.5, z);
    g.add(top);
    for (const s of [-GAP, GAP]) g.add(mesh(new THREE.BoxGeometry(0.1, height + 0.5, 0.1), toon('#e9e4d8'), alongX ? x + s : x, (height + 0.5) / 2, alongX ? z : z + s));
  }
  return g;
}

export function buildSalesScene(): SalesScene {
  const group = new THREE.Group();

  // Ground outside: street and sidewalk.
  const street = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#3a3f4b';
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(255,255,255,.04)';
    for (let i = 0; i < 260; i++) c.fillRect((i * 97) % 256, (i * 57) % 256, 2, 2);
  });
  street.repeat.set(10, 8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshToonMaterial({ map: street }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);
  const sidewalk = mesh(new THREE.BoxGeometry(30, 0.08, 3.2), toon('#a9a49a'), -0.5, 0.02, 10.6);
  sidewalk.receiveShadow = true;
  group.add(sidewalk);
  for (let x = -15; x <= 14; x += 1.6) group.add(mesh(new THREE.BoxGeometry(0.04, 0.09, 3.2), toon('#8f8a80'), x, 0.03, 10.6));

  // Floors of each area.
  const carpet = (a: string, b: string) =>
    canvasTexture(128, 128, (c) => {
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) {
          c.fillStyle = (x + y) % 2 ? a : b;
          c.fillRect(x * 64, y * 64, 64, 64);
        }
      c.fillStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < 40; i++) c.fillRect((i * 37) % 128, (i * 61) % 128, 2, 2);
    });
  const concrete = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#9ea3a8';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(0,0,0,.12)';
    c.lineWidth = 2;
    c.strokeRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(0,0,0,.05)';
    for (let i = 0; i < 120; i++) c.fillRect((i * 53) % 256, (i * 91) % 256, 3, 3);
  });
  const floors: Record<ZoneId, THREE.Texture> = {
    recepcion: carpet('#c9d6e2', '#bfcedb'),
    gerencia: carpet('#8a4f4f', '#7f4747'),
    patio: concrete,
    despacho: concrete.clone(),
  };
  for (const z of Object.values(ZONES)) {
    const tex = floors[z.id];
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set((z.x1 - z.x0) / (z.id === 'patio' || z.id === 'despacho' ? 4 : 2), (z.z1 - z.z0) / (z.id === 'patio' || z.id === 'despacho' ? 4 : 2));
    tex.needsUpdate = true;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(z.x1 - z.x0, z.z1 - z.z0), new THREE.MeshToonMaterial({ map: tex }));
    f.rotation.x = -Math.PI / 2;
    f.position.set((z.x0 + z.x1) / 2, 0.01, (z.z0 + z.z1) / 2);
    f.receiveShadow = true;
    group.add(f);
  }

  // Outer walls: tall at the back, low elsewhere so the camera sees in.
  group.add(wallSegment(-14.1, 14.1, -9.1, true, [], 2.4, '#d9d2c3'));
  group.add(wallSegment(-9.1, 9.1, -14.1, false, [], 1.0, '#d9d2c3'));
  // The right wall has one door per loading dock.
  group.add(wallSegment(-9.1, 9.1, 14.1, false, [1.9, 4.6, 7.3], 1.0, '#d9d2c3'));
  group.add(wallSegment(0, 14.1, 9.1, true, [], 0.8, '#d9d2c3'));

  // Inner walls, shown only between areas of different players.
  const walls: Wall[] = [
    { between: ['recepcion', 'gerencia'], group: wallSegment(-14, 0, 0, true, [-4.55], 1.0, '#cfc6b4') },
    { between: ['gerencia', 'patio'], group: wallSegment(-9, 0, 0, false, [-4.55], 1.0, '#cfc6b4') },
    { between: ['patio', 'despacho'], group: wallSegment(0, 14, 0, true, [7.05], 1.0, '#cfc6b4') },
    { between: ['recepcion', 'despacho'], group: wallSegment(0, 9, 0, false, [4.55], 1.0, '#cfc6b4') },
  ];
  for (const w of walls) group.add(w.group);

  // Painted guides in the yard and dispatch.
  const yellow = new THREE.MeshBasicMaterial({ color: '#f2c230' });
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.1), yellow);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
    m.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
    group.add(m);
  };
  for (let i = 0; i <= 4; i++) line(1.0 + i * 3.1, -9, 1.0 + i * 3.1, -5.6);
  line(1.0, -5.6, 13.4, -5.6);
  // Hazard stripes along the docks.
  const hazard = canvasTexture(64, 64, (c) => {
    c.fillStyle = '#f2c230';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#22252b';
    for (let i = -64; i < 64; i += 24) {
      c.beginPath();
      c.moveTo(i, 64);
      c.lineTo(i + 12, 64);
      c.lineTo(i + 76, 0);
      c.lineTo(i + 64, 0);
      c.fill();
    }
  });
  hazard.repeat.set(1, 14);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 9), new THREE.MeshBasicMaterial({ map: hazard }));
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(13.75, 0.02, 4.5);
  group.add(strip);

  // The sales counter, with a glass front and a bell.
  const c = COUNTER_BOX;
  const cw = c.x1 - c.x0;
  const cx = (c.x0 + c.x1) / 2;
  const cz = (c.z0 + c.z1) / 2;
  group.add(mesh(new THREE.BoxGeometry(cw, 1.0, c.z1 - c.z0), toon('#2f5fa8'), cx, 0.5, cz));
  group.add(mesh(new THREE.BoxGeometry(cw + 0.1, 0.08, c.z1 - c.z0 + 0.15), toon('#e9e4d8'), cx, 1.04, cz));
  group.add(mesh(new THREE.BoxGeometry(cw, 0.08, 0.06), toon('#f2c230'), cx, 0.75, c.z1 + 0.01));
  const counterSign = floorText('MESÓN DE VENTAS', '#ffffff', 5, 0.55);
  counterSign.rotation.x = 0;
  counterSign.position.set(cx, 0.45, c.z1 + 0.02);
  group.add(counterSign);
  group.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 14), toon('#d8b04a'), c.x1 - 0.4, 1.12, cz));
  // The rest of the front: a low wall up to the dispatch area.
  group.add(wallSegment(-14.1, c.x0, 9.1, true, [], 0.8, '#d9d2c3'));
  group.add(wallSegment(c.x1, 0, 9.1, true, [], 0.8, '#d9d2c3'));

  const itemSpot = new Map<number, THREE.Vector3>();
  const rings = new Map<number, THREE.Mesh>();
  const ringGeo = new THREE.RingGeometry(0.42, 0.55, 28);

  const addRing = (s: StationDef) => {
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(s.x, 0.03, s.z);
    group.add(r);
    rings.set(s.id, r);
  };

  for (const s of STATIONS) {
    switch (s.kind) {
      case 'meson':
        itemSpot.set(s.id, new THREE.Vector3(s.x, 1.1, 8.5));
        addRing(s);
        break;
      case 'oc': {
        const desk = furniture({ kind: 'desk', x: -13.35, z: s.z, hw: 0.75, hd: 0.6, turn: 1 });
        // No chair: the player stands there.
        desk.remove(desk.children[desk.children.length - 1]!);
        group.add(desk);
        itemSpot.set(s.id, new THREE.Vector3(-13.1, 0.86, s.z + 0.15));
        addRing(s);
        break;
      }
      case 'timbre': {
        const b = s.box!;
        const x = (b.x0 + b.x1) / 2;
        const z = (b.z0 + b.z1) / 2;
        group.add(mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.85, b.z1 - b.z0), toon('#5a3a26'), x, 0.42, z));
        group.add(mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 0.1, 0.06, b.z1 - b.z0 + 0.1), toon('#7a5236'), x, 0.87, z));
        // The big stamp and its ink pad.
        const stamp = new THREE.Group();
        stamp.position.set(x + 0.55, 0.9, z);
        stamp.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 14), toon('#d63a3a'), 0, 0.06, 0));
        stamp.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), toon('#2e3440'), 0, 0.23, 0));
        stamp.add(mesh(new THREE.SphereGeometry(0.09, 12, 8), toon('#2e3440'), 0, 0.38, 0));
        stamp.name = 'stamp';
        group.add(stamp);
        group.add(mesh(new THREE.BoxGeometry(0.3, 0.03, 0.22), toon('#22252b'), x - 0.55, 0.91, z));
        // Manager's chair behind the desk.
        group.add(mesh(new THREE.BoxGeometry(0.6, 0.9, 0.12), toon('#22252b'), x, 0.85, b.z0 + 0.15));
        itemSpot.set(s.id, new THREE.Vector3(x - 0.05, 0.92, z + 0.1));
        addRing(s);
        break;
      }
      case 'bay': {
        const m = buildMachine(s.model!);
        m.root.position.set(s.x, 0, -7.95);
        m.root.rotation.y = 0;
        group.add(m.root);
        const sign = textSprite(MODELS[s.model!].short, { bg: MODELS[s.model!].color, color: '#1b1f2a', size: 46 });
        sign.position.set(s.x, 3.2, -8.6);
        sign.scale.multiplyScalar(1.9);
        group.add(sign);
        itemSpot.set(s.id, new THREE.Vector3(s.x, 2.6, -7.9));
        addRing(s);
        break;
      }
      case 'shelf': {
        const b = s.box!;
        const x = (b.x0 + b.x1) / 2;
        const z = (b.z0 + b.z1) / 2;
        // Blue and orange pallet rack.
        for (const dx of [-0.85, 0.85]) group.add(mesh(new THREE.BoxGeometry(0.08, 1.8, 0.8), toon('#2f5fa8'), x + dx, 0.9, z));
        for (const y of [0.3, 1.05, 1.75]) group.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.85), toon('#e8772e'), x, y, z));
        for (const y of [0.34, 1.09]) {
          const p = accessoryProp(s.accessory!);
          p.position.set(x, y + 0.04, z);
          if (s.accessory === 'horquillas') p.rotation.y = Math.PI / 2;
          group.add(p);
        }
        const sign = textSprite(ACCESSORIES[s.accessory!].name, { bg: ACCESSORIES[s.accessory!].color, color: '#1b1f2a', size: 40 });
        sign.position.set(x, 2.6, z);
        sign.scale.multiplyScalar(1.6);
        group.add(sign);
        addRing(s);
        break;
      }
      case 'dock': {
        const b = BRANCHES[s.branch!];
        // Branch truck waiting outside the door.
        const truck = new THREE.Group();
        truck.position.set(16.6, 0, s.z);
        truck.rotation.y = -Math.PI / 2;
        truck.add(mesh(new THREE.BoxGeometry(1.7, 1.3, 1.3), toon(b.color), 0, 1.1, -2.2));
        truck.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 0.05), toon('#9fd4ff'), 0, 1.45, -2.86));
        truck.add(mesh(new THREE.BoxGeometry(1.8, 0.2, 3.2), toon('#4a4f5a'), 0, 0.55, 0.1));
        for (const [x, z] of [[-0.8, -2.2], [0.8, -2.2], [-0.8, 0.9], [0.8, 0.9]] as const) {
          const w = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 14), toon('#1d2027'), x, 0.3, z);
          w.rotation.z = Math.PI / 2;
          truck.add(w);
        }
        group.add(truck);
        // Dock plate and label painted on the floor.
        group.add(mesh(new THREE.BoxGeometry(1.4, 0.05, 1.3), toon('#7b8089'), 13.4, 0.03, s.z));
        const label = floorText(b.name.replace('Sucursal ', ''), b.color, 2.6, 0.6);
        label.rotation.z = Math.PI / 2;
        label.position.set(11.6, 0.03, s.z);
        group.add(label);
        const sign = textSprite(b.name, { bg: b.color, color: '#1b1f2a', size: 40 });
        sign.position.set(16.2, 3.0, s.z);
        sign.scale.multiplyScalar(1.6);
        group.add(sign);
        itemSpot.set(s.id, new THREE.Vector3(13.4, 0.1, s.z));
        addRing(s);
        break;
      }
      case 'pass': {
        const horizontal = s.z === 0;
        group.add(mesh(horizontal ? new THREE.BoxGeometry(1.15, 0.08, 0.8) : new THREE.BoxGeometry(0.8, 0.08, 1.15), toon('#e9e4d8'), s.x, 0.96, s.z));
        group.add(mesh(horizontal ? new THREE.BoxGeometry(1.1, 0.92, 0.5) : new THREE.BoxGeometry(0.5, 0.92, 1.1), toon('#b8ad97'), s.x, 0.46, s.z));
        itemSpot.set(s.id, new THREE.Vector3(s.x, 1.02, s.z));
        addRing(s);
        break;
      }
    }
  }

  // Decoration: plants, a water cooler and a sofa for customers, and a pallet stack in dispatch.
  group.add(furniture({ kind: 'plant', x: -1.2, z: 1.2, hw: 0.3, hd: 0.3 }));
  group.add(furniture({ kind: 'plant', x: -13.3, z: -1.2, hw: 0.3, hd: 0.3 }));
  group.add(furniture({ kind: 'cooler', x: -13.4, z: 7.2, hw: 0.3, hd: 0.3 }));
  group.add(furniture({ kind: 'shelf', x: -2.4, z: -8.6, hw: 1.0, hd: 0.3 }));
  group.add(furniture({ kind: 'plant', x: -1.0, z: -8.3, hw: 0.3, hd: 0.3 }));
  for (let i = 0; i < 3; i++) group.add(mesh(new THREE.BoxGeometry(1.1, 0.14, 1.1), toon('#c99a62'), 10.6, 0.07 + i * 0.15, 8.2));
  group.add(mesh(new THREE.BoxGeometry(1.0, 0.6, 1.0), toon('#b9874f'), 10.6, 0.75, 8.2));

  // Area labels and tints, colored by owner at runtime.
  const zoneMarks: SalesScene['zoneMarks'] = new Map();
  const labelAt: Record<ZoneId, [number, number]> = { recepcion: [-6.5, 4.2], gerencia: [-6.5, -3.4], patio: [7, -3.2], despacho: [6.2, 3.6] };
  for (const z of Object.values(ZONES)) {
    const inset = 0.12;
    const pts = [
      [z.x0 + inset, z.z0 + inset],
      [z.x1 - inset, z.z0 + inset],
      [z.x1 - inset, z.z1 - inset],
      [z.x0 + inset, z.z1 - inset],
    ];
    const pos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % 4]!;
      pos.push(a[0]!, 0.04, a[1]!, b[0]!, 0.04, b[1]!);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const border = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
    group.add(border);
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(z.x1 - z.x0 - 0.3, z.z1 - z.z0 - 0.3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    tint.rotation.x = -Math.PI / 2;
    tint.position.set((z.x0 + z.x1) / 2, 0.025, (z.z0 + z.z1) / 2);
    group.add(tint);
    const label = floorText(z.name.toUpperCase(), 'rgba(255,255,255,.55)', 5, 0.75);
    const [lx, lz] = labelAt[z.id];
    label.position.set(lx, 0.03, lz);
    group.add(label);
    zoneMarks.set(z.id, { border, label, tint });
  }

  // Fires in the street for angry customers: hidden until needed.
  const fires: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.position.set(-11 + i * 4.5, 0, 11.6);
    f.add(mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.7, 12), toon('#4a4f5a'), 0, 0.35, 0));
    for (let k = 0; k < 4; k++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22 - k * 0.03, 0.7 - k * 0.08, 8), new THREE.MeshBasicMaterial({ color: k % 2 ? '#ffd23f' : '#ff6b1a', transparent: true, opacity: 0.9 }));
      flame.position.set(Math.cos(k * 1.7) * 0.12, 0.95, Math.sin(k * 1.7) * 0.12);
      f.add(flame);
    }
    f.visible = false;
    group.add(f);
    fires.push(f);
  }

  const stamps: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.name === 'stamp') stamps.push(o);
  });

  return {
    group,
    walls,
    itemSpot,
    rings,
    zoneMarks,
    fires,
    update(time: number, strikes: number) {
      fires.forEach((f, i) => {
        f.visible = i < strikes;
        if (!f.visible) return;
        f.children.forEach((ch, k) => {
          if (k === 0) return;
          ch.scale.set(1, 0.8 + Math.sin(time * 9 + k * 1.3 + i) * 0.25, 1);
          ch.rotation.y = time * 2 + k;
        });
      });
      for (const s of stamps) s.rotation.y = Math.sin(time * 0.6) * 0.1;
    },
  };
}
