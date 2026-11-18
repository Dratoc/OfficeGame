import * as THREE from 'three';
import { TRACK, locate, mulberry32, pointAt, type ObstacleKind, type Track } from '@inbox/shared';
import { mesh, toon } from '../office/avatar3d';
import { furniture } from '../office/office3d';

/**
 * The open-plan office where the chair race happens: carpet tiles, a track of grey carpet
 * between rows of cubicle partitions, red and white curbs, the start arch, and desks, plants
 * and water coolers on the infield. The partitions follow the same edges the server uses.
 */

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A flat strip that follows the track, from `from` to `to` meters to the right of the center line. */
function strip(track: Track, from: number, to: number, y: number, vScale: number): THREE.BufferGeometry {
  const { samples } = track;
  const n = samples.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = samples[i % n]!;
    const nx = -p.tz;
    const nz = p.tx;
    const s = i === n ? track.length : p.s;
    pos.push(p.x + nx * from, y, p.z + nz * from, p.x + nx * to, y, p.z + nz * to);
    uv.push(0, s / vScale, 1, s / vScale);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface RaceScene {
  group: THREE.Group;
  update(time: number): void;
}

export function buildRaceScene(track: Track = TRACK): RaceScene {
  const group = new THREE.Group();
  const hw = track.halfWidth;

  // Office carpet tiles everywhere.
  const tiles = canvasTexture(256, 256, (c) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        c.fillStyle = (x + y) % 2 ? '#5f7b9b' : '#56708f';
        c.fillRect(x * 64, y * 64, 64, 64);
        c.fillStyle = 'rgba(255,255,255,0.05)';
        for (let k = 0; k < 8; k++) c.fillRect(x * 64 + ((k * 23) % 60), y * 64 + ((k * 41) % 60), 2, 2);
      }
  });
  tiles.repeat.set(24, 16);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 64), new THREE.MeshToonMaterial({ map: tiles }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // The track: darker carpet with a dashed center line.
  const road = canvasTexture(128, 256, (c) => {
    c.fillStyle = '#3d4554';
    c.fillRect(0, 0, 128, 256);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let k = 0; k < 120; k++) c.fillRect((k * 37) % 128, (k * 59) % 256, 2, 2);
    c.fillStyle = '#e8c766';
    c.fillRect(61, 0, 6, 128);
  });
  const roadMesh = new THREE.Mesh(strip(track, -hw, hw, 0.012, 6), new THREE.MeshToonMaterial({ map: road }));
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // Curbs on both edges.
  const curb = canvasTexture(16, 64, (c) => {
    c.fillStyle = '#d64545';
    c.fillRect(0, 0, 16, 32);
    c.fillStyle = '#f6f4ef';
    c.fillRect(0, 32, 16, 32);
  });
  const curbMat = new THREE.MeshToonMaterial({ map: curb });
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(strip(track, side < 0 ? -hw : hw - 0.4, side < 0 ? -hw + 0.4 : hw, 0.02, 2), curbMat);
    m.receiveShadow = true;
    group.add(m);
  }

  // Cubicle partitions along both edges, one panel every 2 meters.
  const panelLen = 2;
  const count = Math.floor(track.length / panelLen);
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(panelLen - 0.06, 0.85, 0.12), new THREE.MeshToonMaterial({ color: '#ffffff' }), count * 2);
  const trims = new THREE.InstancedMesh(new THREE.BoxGeometry(panelLen, 0.06, 0.16), new THREE.MeshToonMaterial({ color: '#cfd5de' }), count * 2);
  panels.castShadow = true;
  panels.receiveShadow = true;
  const fabric = [new THREE.Color('#4f8a9a'), new THREE.Color('#5b6f86'), new THREE.Color('#7a8aa0')];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let k = 0;
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) * panelLen;
    for (const side of [-1, 1]) {
      const p = pointAt(track, s, side * (hw + 0.12));
      q.setFromAxisAngle(up, -Math.atan2(p.tz, p.tx));
      m4.compose(new THREE.Vector3(p.x, 0.43, p.z), q, new THREE.Vector3(1, 1, 1));
      panels.setMatrixAt(k, m4);
      panels.setColorAt(k, fabric[(i + (side > 0 ? 1 : 0)) % fabric.length]!);
      m4.compose(new THREE.Vector3(p.x, 0.88, p.z), q, new THREE.Vector3(1, 1, 1));
      trims.setMatrixAt(k, m4);
      k++;
    }
  }
  group.add(panels, trims);

  // Checkered start line and the arch over it.
  const checks = canvasTexture(128, 32, (c) => {
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 8; x++) {
        c.fillStyle = (x + y) % 2 ? '#1b1f2a' : '#ffffff';
        c.fillRect(x * 16, y * 16, 16, 16);
      }
  });
  checks.wrapS = checks.wrapT = THREE.ClampToEdgeWrapping;
  const start = pointAt(track, 0);
  const angle = Math.atan2(start.tz, start.tx);
  // In the arch's frame, +x runs along the track and z across it.
  const arch = new THREE.Group();
  arch.position.set(start.x, 0, start.z);
  arch.rotation.y = -angle;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1.2, hw * 2), new THREE.MeshBasicMaterial({ map: checks }));
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.03;
  arch.add(line);
  for (const side of [-1, 1]) arch.add(mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), toon('#5b5f68'), 0, 1.7, side * (hw + 0.4)));
  const sign = canvasTexture(512, 96, (c) => {
    c.fillStyle = '#2f5fa8';
    c.fillRect(0, 0, 512, 96);
    c.fillStyle = '#e8c766';
    c.fillRect(0, 0, 512, 8);
    c.fillRect(0, 88, 512, 8);
    c.fillStyle = '#ffffff';
    c.font = '900 46px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SALIDA · META', 256, 50);
  });
  sign.wrapS = sign.wrapT = THREE.ClampToEdgeWrapping;
  // The text goes on the faces that look along the track, toward the drivers.
  const signMat = new THREE.MeshBasicMaterial({ map: sign });
  const blue = toon('#2f5fa8');
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, hw * 2 + 1.1), [signMat, signMat, blue, blue, blue, blue]);
  board.position.y = 3.2;
  arch.add(board);
  group.add(arch);

  // Furniture on the infield and around the track, kept clear of the partitions.
  const rnd = mulberry32(7);
  const kinds: ObstacleKind[] = ['desk', 'desk', 'plant', 'cooler', 'printer', 'plant', 'shelf'];
  for (let x = -34; x <= 34; x += 5.5) {
    for (let z = -22; z <= 22; z += 5.5) {
      const jx = x + (rnd() - 0.5) * 2;
      const jz = z + (rnd() - 0.5) * 2;
      const spot = locate(track, jx, jz);
      if (Math.abs(spot.side) < hw + 2.4 || rnd() < 0.35) continue;
      const kind = kinds[Math.floor(rnd() * kinds.length)]!;
      const size = kind === 'desk' ? { hw: 1.2, hd: 0.6 } : kind === 'printer' ? { hw: 0.55, hd: 0.4 } : kind === 'shelf' ? { hw: 0.9, hd: 0.3 } : { hw: 0.32, hd: 0.32 };
      const f = furniture({ kind, x: jx, z: jz, ...size, turn: Math.floor(rnd() * 4) });
      group.add(f);
    }
  }

  // Office walls with windows, far around the floor.
  const windows = canvasTexture(512, 128, (c) => {
    c.fillStyle = '#c9b48f';
    c.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 4; i++) {
      const g = c.createLinearGradient(0, 16, 0, 104);
      g.addColorStop(0, '#9fd3ff');
      g.addColorStop(1, '#e8f6ff');
      c.fillStyle = g;
      c.fillRect(20 + i * 124, 18, 96, 86);
      c.fillStyle = '#6b5a4a';
      c.fillRect(66 + i * 124, 18, 4, 86);
      c.fillRect(20 + i * 124, 58, 96, 4);
    }
  });
  windows.repeat.set(6, 1);
  const wallMat = new THREE.MeshToonMaterial({ map: windows });
  const walls: [number, number, number, number][] = [
    [0, -32, 96, 0],
    [0, 32, 96, Math.PI],
    [-48, 0, 64, Math.PI / 2],
    [48, 0, 64, -Math.PI / 2],
  ];
  for (const [x, z, len, rot] of walls) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(len, 7), wallMat);
    w.position.set(x, 3.5, z);
    w.rotation.y = rot;
    group.add(w);
  }

  // Hanging lamps that sway a little.
  const lamps: THREE.Object3D[] = [];
  for (let i = 0; i < 10; i++) {
    const p = pointAt(track, (i / 10) * track.length + 4);
    const lamp = new THREE.Group();
    lamp.position.set(p.x, 6.5, p.z);
    lamp.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), toon('#5b5f68'), 0, -0.7, 0));
    lamp.add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.35, 16, 1, true), toon('#f6f4ef', '#fff3c4')).translateY(-1.5));
    group.add(lamp);
    lamps.push(lamp);
  }

  return {
    group,
    update(time: number) {
      lamps.forEach((l, i) => (l.rotation.z = Math.sin(time * 0.8 + i) * 0.03));
    },
  };
}

export interface ChairModel {
  root: THREE.Group;
  /** The seat and everything on it: spins on a hit, tilts in turns. */
  seat: THREE.Group;
  base: THREE.Group;
  wheels: THREE.Object3D[];
}

/** An office chair on five wheels, upholstered in the player's color. */
export function buildChair(color: string): ChairModel {
  const root = new THREE.Group();
  const base = new THREE.Group();
  root.add(base);
  const metal = toon('#8a8f99');
  const dark = toon('#2e3440');
  const wheels: THREE.Object3D[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.09), metal, Math.cos(a) * 0.25, 0.12, Math.sin(a) * 0.25);
    leg.rotation.y = -a;
    base.add(leg);
    const wheel = mesh(new THREE.SphereGeometry(0.075, 10, 8), dark, Math.cos(a) * 0.48, 0.075, Math.sin(a) * 0.48);
    base.add(wheel);
    wheels.push(wheel);
  }
  base.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.38, 10), metal, 0, 0.32, 0));

  const seat = new THREE.Group();
  seat.position.y = 0.5;
  root.add(seat);
  const cushion = toon(color);
  seat.add(mesh(new THREE.BoxGeometry(0.78, 0.14, 0.74), cushion, 0, 0.04, 0.02));
  seat.add(mesh(new THREE.BoxGeometry(0.72, 0.8, 0.12), cushion, 0, 0.5, -0.36));
  seat.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), metal, 0, 0.16, -0.38));
  for (const side of [-1, 1]) {
    seat.add(mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), dark, side * 0.4, 0.2, 0.02));
    seat.add(mesh(new THREE.BoxGeometry(0.1, 0.05, 0.42), dark, side * 0.4, 0.33, 0.04));
  }
  return { root, seat, base, wheels };
}
