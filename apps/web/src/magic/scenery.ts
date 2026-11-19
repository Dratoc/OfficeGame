import * as THREE from 'three';
import { GATE_HALF_WIDTH, magicMap, roadX, type MfFort, type MfMap, type MfMapId } from '@inbox/shared';
import { textSprite } from '../sales/scene3d';
import { toon } from '../office/avatar3d';
import { TEAM_LOOKS } from './models';

/**
 * The valley: grass with a dirt road between the two camps, pine and oak forests on the flanks,
 * rocks to fight around, snowy mountains on the horizon, tents and banners at each camp and two
 * ruined watchtowers at the enemy's. Trees and rocks are instanced so the whole forest is a
 * handful of draw calls.
 */

function groundTexture(map: MfMap): THREE.CanvasTexture {
  const size = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const span = map.half * 2 + 40;
  const px = (x: number) => ((x + span / 2) / span) * size;
  c.fillStyle = '#6fae4f';
  c.fillRect(0, 0, size, size);
  // Patches of lighter and darker grass.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 4 + rnd() * 26;
    c.fillStyle = rnd() < 0.5 ? 'rgba(140, 196, 96, 0.22)' : 'rgba(76, 134, 58, 0.22)';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  // Little flowers.
  for (let i = 0; i < 900; i++) {
    c.fillStyle = ['#f4e36b', '#ffffff', '#e98ac2'][i % 3]!;
    c.fillRect(rnd() * size, rnd() * size, 2, 2);
  }
  // The road, drawn along its curve (texture y grows with world z).
  const road = (width: number, color: string) => {
    c.strokeStyle = color;
    c.lineWidth = (width / span) * size;
    c.lineCap = 'round';
    c.beginPath();
    for (let z = -map.half - 10; z <= map.half + 10; z += 2) {
      const x = px(roadX(z));
      const y = px(z);
      if (z === -map.half - 10) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  };
  road(7.5, '#a78a5c');
  road(5.5, '#c3a676');
  // Trampled dirt around each camp.
  for (const camp of [map.playerSpawn, map.enemyCamp]) {
    const g = c.createRadialGradient(px(camp.x), px(camp.z), 0, px(camp.x), px(camp.z), (14 / span) * size);
    g.addColorStop(0, 'rgba(183, 152, 104, 0.9)');
    g.addColorStop(1, 'rgba(183, 152, 104, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(px(camp.x), px(camp.z), (14 / span) * size, 0, Math.PI * 2);
    c.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function tent(color: string): THREE.Group {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.4, 4), toon(color));
  cloth.position.y = 1.2;
  cloth.rotation.y = Math.PI / 4;
  cloth.castShadow = true;
  g.add(cloth);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), toon('#3a2a20'));
  door.position.set(0, 0.55, 1.21);
  door.rotation.x = -0.45;
  g.add(door);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7), toon('#6b4a32'));
  pole.position.y = 2.6;
  g.add(pole);
  return g;
}

function banner(color: string): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 4.2, 8), toon('#6b4a32'));
  pole.position.y = 2.1;
  pole.castShadow = true;
  g.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8, 1, 3), new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide }));
  cloth.position.set(0.58, 3.2, 0);
  cloth.castShadow = true;
  g.add(cloth);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toon('#e8c45a'));
  top.position.y = 4.25;
  g.add(top);
  g.userData.cloth = cloth;
  return g;
}

function campfire(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), toon('#5b3a24'));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i * Math.PI) / 4;
    log.position.y = 0.1;
    g.add(log);
  }
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 7), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 }));
  fire.position.y = 0.5;
  g.add(fire);
  const light = new THREE.PointLight('#ffb05a', 6, 9, 1.6);
  light.position.y = 1;
  g.add(light);
  g.userData.fire = fire;
  return g;
}

function tower(): THREE.Group {
  const g = new THREE.Group();
  const stone = toon('#a9a49a');
  const dark = toon('#87827a');
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 7, 12), stone);
  base.position.y = 3.5;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  // Broken battlements.
  for (let i = 0; i < 8; i++) {
    if (i === 2 || i === 5) continue;
    const a = (i / 8) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7 + (i % 3) * 0.3, 0.6), dark);
    m.position.set(Math.sin(a) * 2.05, 7.35, Math.cos(a) * 2.05);
    m.rotation.y = a;
    m.castShadow = true;
    g.add(m);
  }
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12, 0, Math.PI), toon('#3a2a20'));
  door.position.set(0, 0.01, 2.51);
  door.scale.y = 2;
  g.add(door);
  return g;
}

export interface Scenery {
  group: THREE.Group;
  animate(t: number): void;
  /** Conquest: flags, owner colors and capture progress of the fortresses. */
  updateForts(forts: MfFort[]): void;
}

const NEUTRAL = '#e9e4d6';
const LETTERS = ['A', 'B', 'C'];

interface FortVis {
  flag: THREE.Mesh;
  floor: THREE.Mesh;
  signs: THREE.Sprite[];
  owner: number;
}

/** Stone walls with battlements, towers on the corners and by each gate, a courtyard and a flag. */
function fortress(f: { x: number; z: number; half: number }, index: number): { group: THREE.Group; vis: FortVis } {
  const g = new THREE.Group();
  g.position.set(f.x, 0, f.z);
  const stone = toon('#b3ab9c');
  const dark = toon('#8f8879');
  const h = f.half;
  const len = h - GATE_HALF_WIDTH - 0.2;
  const mid = GATE_HALF_WIDTH + 0.2 + len / 2;
  const wallGeo = new THREE.BoxGeometry(len, 3.2, 1.5);
  const merlon = new THREE.BoxGeometry(0.7, 0.6, 1.5);
  for (const side of [0, 1, 2, 3]) {
    const rot = (side * Math.PI) / 2;
    for (const sign of [-1, 1]) {
      const seg = new THREE.Group();
      seg.rotation.y = rot;
      const w = new THREE.Mesh(wallGeo, stone);
      w.position.set(sign * mid, 1.6, h);
      w.castShadow = w.receiveShadow = true;
      seg.add(w);
      for (let t = GATE_HALF_WIDTH + 0.6; t < h - 0.5; t += 1.4) {
        const m = new THREE.Mesh(merlon, dark);
        m.position.set(sign * t, 3.5, h);
        m.castShadow = true;
        seg.add(m);
      }
      // Gate towers on both sides of each gate.
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 4.4, 10), dark);
      post.position.set(sign * (GATE_HALF_WIDTH + 0.5), 2.2, h);
      post.castShadow = true;
      seg.add(post);
      g.add(seg);
    }
  }
  for (const [x, z] of [
    [h, h],
    [-h, h],
    [h, -h],
    [-h, -h],
  ] as const) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 5.2, 12), stone);
    t.position.set(x, 2.6, z);
    t.castShadow = true;
    g.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.8, 12), toon('#7b4b3a'));
    roof.position.set(x, 6.1, z);
    g.add(roof);
  }
  // Courtyard: its color shows the owner.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(h * 2 - 1.2, h * 2 - 1.2), new THREE.MeshLambertMaterial({ color: NEUTRAL, transparent: true, opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.03;
  floor.receiveShadow = true;
  g.add(floor);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 8), toon('#6b4a32'));
  pole.position.y = 3.5;
  pole.castShadow = true;
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshToonMaterial({ color: NEUTRAL, side: THREE.DoubleSide }));
  flag.position.set(0.95, 6.3, 0);
  flag.castShadow = true;
  g.add(flag);
  // A big letter over each fortress, readable from anywhere: neutral, yours, the enemy's.
  const signs = [NEUTRAL, '#2f6fe0', '#c8382f'].map((bg, i) => {
    const sp = textSprite(LETTERS[index] ?? '?', { bg, color: i === 0 ? '#1b1f2a' : '#ffffff', size: 64, width: 160 });
    sp.position.set(0, 9.5, 0);
    sp.scale.set(2.6, 1.8, 1);
    sp.visible = i === 0;
    (sp.material as THREE.SpriteMaterial).depthTest = false;
    sp.renderOrder = 20;
    g.add(sp);
    return sp;
  });
  return { group: g, vis: { flag, floor, signs, owner: -2 } };
}

export function buildScenery(mapId: MfMapId = 'skirmish', myTeam = 0): Scenery {
  const look = (team: number) => (team === myTeam ? 0 : 1);
  const map = magicMap(mapId);
  const group = new THREE.Group();
  const span = map.half * 2 + 40;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshLambertMaterial({ map: groundTexture(map) }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  // Far fields beyond the playable area.
  const far = new THREE.Mesh(new THREE.RingGeometry(span * 0.7, 420, 48), new THREE.MeshLambertMaterial({ color: '#5f9a47' }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.02;
  group.add(far);

  // Forest: instanced trunks and crowns (pines are stacked cones, oaks are blobs).
  const trees = map.obstacles.filter((o) => o.kind === 'tree');
  const pines = trees.filter((_, i) => i % 3 !== 0);
  const oaks = trees.filter((_, i) => i % 3 === 0);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const inst = (g: THREE.BufferGeometry, mat: THREE.Material, list: typeof trees, place: (o: (typeof trees)[number], i: number) => [number, number, number]) => {
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((o, i) => {
      const [y, s, rot] = place(o, i);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m4.compose(v.set(o.x, y * o.size, o.z), q, sc.setScalar(s * o.size));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  };
  const trunk = new THREE.CylinderGeometry(0.18, 0.26, 1.6, 7);
  inst(trunk, toon('#6b4a32'), trees, () => [0.8, 1, 0]);
  inst(new THREE.ConeGeometry(1.5, 2.6, 8), toon('#2f7a4a'), pines, (o) => [2.6, 1, o.x]);
  inst(new THREE.ConeGeometry(1.15, 2.2, 8), toon('#3a8f55'), pines, (o) => [3.9, 1, o.z]);
  inst(new THREE.ConeGeometry(0.75, 1.6, 8), toon('#48a462'), pines, (o) => [5, 1, o.x + o.z]);
  inst(new THREE.IcosahedronGeometry(1.6, 1), toon('#5aa344'), oaks, (o) => [2.9, 1, o.x]);
  inst(new THREE.IcosahedronGeometry(1.1, 1), toon('#6dbb52'), oaks, (o) => [3.9, 1, o.z]);
  const rocks = map.obstacles.filter((o) => o.kind === 'rock');
  inst(new THREE.DodecahedronGeometry(1, 0), toon('#9a9a92'), rocks, (o) => [0.35, 1.15, o.x * 3]);
  inst(new THREE.DodecahedronGeometry(0.55, 0), toon('#b3b3aa'), rocks, (o) => [0.2, 1, o.z * 5]);

  for (const o of map.obstacles.filter((x) => x.kind === 'tower')) {
    const t = tower();
    t.position.set(o.x, 0, o.z);
    t.rotation.y = Math.PI;
    group.add(t);
  }

  // Mountains around the valley.
  const mount = new THREE.ConeGeometry(1, 1, 7);
  const snow = new THREE.ConeGeometry(1, 1, 7);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + (i % 2) * 0.1;
    const r = map.half + 38 + (i % 3) * 14;
    const h = 30 + ((i * 37) % 23);
    const w = 22 + ((i * 13) % 12);
    const m = new THREE.Mesh(mount, toon(i % 2 ? '#7b8794' : '#6c7884'));
    m.scale.set(w, h, w);
    m.position.set(Math.sin(a) * r, h / 2 - 1, Math.cos(a) * r);
    group.add(m);
    const s = new THREE.Mesh(snow, toon('#f4f7fb'));
    s.scale.set(w * 0.36, h * 0.36, w * 0.36);
    s.position.set(m.position.x, h - 1 - h * 0.18, m.position.z);
    group.add(s);
  }

  // Camps.
  const fires: THREE.Group[] = [];
  const cloths: THREE.Mesh[] = [];
  const camps = [map.playerSpawn, map.enemyCamp];
  camps.forEach((camp, team) => {
    const color = TEAM_LOOKS[look(team)]!.main;
    const back = team === 0 ? -1 : 1;
    for (const o of map.obstacles.filter((x) => x.kind === 'tent' && x.team === team)) {
      const t = tent(color);
      t.position.set(o.x, 0, o.z);
      t.rotation.y = team === 0 ? 0 : Math.PI;
      group.add(t);
    }
    for (const dx of [-4, 4]) {
      const b = banner(color);
      b.position.set(camp.x + dx, 0, camp.z + 9 * back);
      group.add(b);
      cloths.push(b.userData.cloth as THREE.Mesh);
    }
    const f = campfire();
    f.position.set(camp.x, 0, camp.z + 5 * back);
    group.add(f);
    fires.push(f);
  });

  const forts = map.forts.map((f, i) => {
    const built = fortress(f, i);
    group.add(built.group);
    return built.vis;
  });

  return {
    group,
    updateForts(list) {
      list.forEach((f, i) => {
        const v = forts[i];
        if (!v) return;
        // The flag climbs as the fortress is taken, in the color of whoever is taking it.
        const towards = f.capture > 0 ? 0 : 1;
        const color = Math.abs(f.capture) < 0.02 ? NEUTRAL : TEAM_LOOKS[look(towards)]!.main;
        (v.flag.material as THREE.MeshToonMaterial).color.set(color);
        v.flag.position.y = 1.2 + Math.abs(f.capture) * 5.1;
        if (v.owner !== f.owner) {
          v.owner = f.owner;
          (v.floor.material as THREE.MeshLambertMaterial).color.set(f.owner < 0 ? NEUTRAL : TEAM_LOOKS[look(f.owner)]!.main);
          v.signs.forEach((s, k) => (s.visible = k === (f.owner < 0 ? 0 : f.owner === myTeam ? 1 : 2)));
        }
      });
    },
    animate(t: number) {
      forts.forEach((v, i) => (v.flag.rotation.y = Math.sin(t * 2.2 + i) * 0.2));
      cloths.forEach((c, i) => (c.rotation.y = Math.sin(t * 2 + i) * 0.25));
      fires.forEach((f, i) => {
        const fire = f.userData.fire as THREE.Mesh;
        fire.scale.set(1 + Math.sin(t * 13 + i) * 0.12, 1 + Math.sin(t * 9 + i) * 0.2, 1);
      });
    },
  };
}
