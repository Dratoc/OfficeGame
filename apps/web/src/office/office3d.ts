import * as THREE from 'three';
import { OFFICE_ARENA, OFFICE_OBSTACLES, type Obstacle } from '@inbox/shared';
import { mesh, toon } from './avatar3d';

/**
 * The office where the fight happens: carpet, a back wall with windows over a medieval town,
 * guild banners and torches, plus one model per piece of furniture from OFFICE_OBSTACLES
 * (the same boxes the server uses for collisions).
 */

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface OfficeScene {
  group: THREE.Group;
  /** Torch lights flicker. */
  update(time: number): void;
}

export function buildOffice(): OfficeScene {
  const group = new THREE.Group();
  const { halfW, halfD } = OFFICE_ARENA;

  // Wooden floor around, carpet tiles on the play area.
  const wood = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#8a6440';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#7d5a39' : '#946c45';
      c.fillRect(0, i * 32, 256, 30);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(((i * 97) % 256) | 0, i * 32, 3, 30);
    }
  });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(8, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshToonMaterial({ map: wood }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const carpet = canvasTexture(256, 256, (c) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        c.fillStyle = (x + y) % 2 ? '#56708f' : '#5f7b9b';
        c.fillRect(x * 64, y * 64, 64, 64);
        c.fillStyle = 'rgba(255,255,255,0.04)';
        for (let k = 0; k < 6; k++) c.fillRect(x * 64 + ((k * 23) % 60), y * 64 + ((k * 41) % 60), 2, 2);
      }
  });
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
  carpet.repeat.set(halfW / 2, halfD / 2);
  const play = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), new THREE.MeshToonMaterial({ map: carpet }));
  play.rotation.x = -Math.PI / 2;
  play.position.y = 0.005;
  play.receiveShadow = true;
  group.add(play);

  // Round guild rug in the middle: the dueling ground.
  const rug = canvasTexture(512, 512, (c) => {
    c.translate(256, 256);
    c.fillStyle = '#8f2d2d';
    c.beginPath();
    c.arc(0, 0, 250, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#e8c766';
    c.lineWidth = 14;
    c.beginPath();
    c.arc(0, 0, 222, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, 0, 196, 0, Math.PI * 2);
    c.stroke();
    // A crossed sword and quill: the guild of office knights.
    c.fillStyle = '#e8c766';
    c.rotate(Math.PI / 4);
    c.fillRect(-10, -150, 20, 300);
    c.fillRect(-50, 90, 100, 18);
    c.rotate(-Math.PI / 2);
    c.beginPath();
    c.moveTo(0, -160);
    c.quadraticCurveTo(48, -40, 0, 150);
    c.quadraticCurveTo(-48, -40, 0, -160);
    c.fill();
  });
  const rugMesh = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshToonMaterial({ map: rug, transparent: true }));
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.position.y = 0.012;
  rugMesh.receiveShadow = true;
  group.add(rugMesh);

  // Carpet border strips.
  const trim = toon('#3b4a63');
  for (const s of [-1, 1]) {
    const a = mesh(new THREE.BoxGeometry(halfW * 2 + 0.3, 0.04, 0.15), trim, 0, 0.02, s * (halfD + 0.07));
    const b = mesh(new THREE.BoxGeometry(0.15, 0.04, halfD * 2 + 0.3), trim, s * (halfW + 0.07), 0.02, 0);
    a.castShadow = b.castShadow = false;
    group.add(a, b);
  }

  addBackWall(group, halfW, halfD);
  addPartitions(group, halfW, halfD);
  for (const o of OFFICE_OBSTACLES) group.add(furniture(o));

  // Torches on the wall, with lights that flicker.
  const torches: THREE.PointLight[] = [];
  for (const x of [-4.6, 4.6]) {
    const t = new THREE.Group();
    t.position.set(x, 2.3, -halfD - 0.55);
    t.add(mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.45, 8), toon('#4a3626'), 0, 0, 0.12).rotateX(0.5));
    const flame = mesh(new THREE.ConeGeometry(0.11, 0.3, 8), toon('#ffb347', '#ff7a1a'), 0, 0.3, 0.24);
    flame.name = 'flame';
    t.add(flame);
    const light = new THREE.PointLight('#ff9a4a', 4, 7, 1.6);
    light.position.set(0, 0.4, 0.5);
    t.add(light);
    torches.push(light);
    group.add(t);
  }

  return {
    group,
    update(time: number) {
      torches.forEach((l, i) => {
        l.intensity = 3.6 + Math.sin(time * 9 + i * 2) * 0.5 + Math.sin(time * 23 + i) * 0.3;
      });
    },
  };
}

function addBackWall(group: THREE.Group, halfW: number, halfD: number) {
  const z = -halfD - 0.85;
  const wall = mesh(new THREE.BoxGeometry(halfW * 2 + 6, 4.2, 0.3), toon('#e9dfc8'), 0, 2.1, z);
  wall.receiveShadow = true;
  group.add(wall);
  // Stone base, like an old keep turned into an office.
  group.add(mesh(new THREE.BoxGeometry(halfW * 2 + 6, 0.7, 0.36), toon('#8c8a84'), 0, 0.35, z + 0.02));

  const view = canvasTexture(256, 192, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 192);
    g.addColorStop(0, '#7ec4f2');
    g.addColorStop(1, '#d9f0ff');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 192);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(60, 40, 30, 10, 0, 0, Math.PI * 2);
    c.ellipse(190, 30, 24, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#7a9a6a';
    c.fillRect(0, 150, 256, 42);
    // Castle on the hill.
    c.fillStyle = '#9aa2b5';
    c.fillRect(70, 90, 120, 62);
    c.fillRect(60, 70, 26, 82);
    c.fillRect(174, 70, 26, 82);
    c.fillRect(116, 56, 28, 40);
    for (let i = 0; i < 6; i++) c.fillRect(72 + i * 20, 82, 10, 10);
    c.fillStyle = '#c0392b';
    for (const [x, y] of [[73, 70], [187, 70], [130, 56]] as const) {
      c.beginPath();
      c.moveTo(x - 15, y);
      c.lineTo(x, y - 22);
      c.lineTo(x + 15, y);
      c.fill();
    }
    c.fillStyle = '#5a4a3a';
    c.fillRect(120, 124, 20, 28);
  });
  for (const x of [-6.6, -2.2, 2.2, 6.6]) {
    const frame = mesh(new THREE.BoxGeometry(2.0, 1.6, 0.1), toon('#6b4a2e'), x, 2.35, z + 0.18);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), new THREE.MeshBasicMaterial({ map: view }));
    glass.position.set(x, 2.35, z + 0.24);
    const bar = mesh(new THREE.BoxGeometry(0.06, 1.4, 0.04), toon('#6b4a2e'), x, 2.35, z + 0.26);
    const bar2 = mesh(new THREE.BoxGeometry(1.8, 0.06, 0.04), toon('#6b4a2e'), x, 2.35, z + 0.26);
    group.add(frame, glass, bar, bar2);
  }

  // Guild banners between the windows.
  const banner = (color: string, emblem: 'crown' | 'stapler' | 'mug') =>
    canvasTexture(128, 256, (c) => {
      c.fillStyle = color;
      c.fillRect(0, 0, 128, 256);
      c.fillStyle = '#e8c766';
      c.fillRect(0, 0, 128, 12);
      c.fillRect(8, 0, 6, 256);
      c.fillRect(114, 0, 6, 256);
      c.translate(64, 110);
      if (emblem === 'crown') {
        c.beginPath();
        c.moveTo(-36, 20);
        c.lineTo(-36, -20);
        c.lineTo(-18, 0);
        c.lineTo(0, -30);
        c.lineTo(18, 0);
        c.lineTo(36, -20);
        c.lineTo(36, 20);
        c.closePath();
        c.fill();
      } else if (emblem === 'stapler') {
        c.fillRect(-38, 6, 76, 14);
        c.fillRect(-38, -14, 70, 14);
        c.fillRect(-38, -14, 10, 34);
      } else {
        c.fillRect(-24, -26, 40, 50);
        c.lineWidth = 8;
        c.strokeStyle = '#e8c766';
        c.beginPath();
        c.arc(20, 0, 14, -Math.PI / 2, Math.PI / 2);
        c.stroke();
        c.fillRect(-10, -48, 4, 14);
        c.fillRect(2, -52, 4, 18);
      }
    });
  const banners: [number, string, 'crown' | 'stapler' | 'mug'][] = [
    [-8.8, '#2f5fa8', 'mug'],
    [-4.4, '#a8322f', 'crown'],
    [0, '#2f7a52', 'stapler'],
    [4.4, '#a8322f', 'crown'],
    [8.8, '#2f5fa8', 'mug'],
  ];
  for (const [x, color, emblem] of banners) {
    const geo = new THREE.PlaneGeometry(0.9, 1.8);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // A notched bottom edge.
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0 && Math.abs(pos.getX(i)) < 0.1) pos.setY(i, pos.getY(i) + 0.25);
    const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: banner(color, emblem), side: THREE.DoubleSide }));
    m.position.set(x, 2.6, z + 0.2);
    group.add(m, mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), toon('#6b4a2e'), x, 3.52, z + 0.22).rotateZ(Math.PI / 2));
  }

  // Office clock.
  const clock = canvasTexture(128, 128, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(64, 64, 60, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2d3f5c';
    c.lineWidth = 8;
    c.stroke();
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(64, 64);
    c.lineTo(64, 24);
    c.moveTo(64, 64);
    c.lineTo(94, 70);
    c.stroke();
  });
  const clk = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), new THREE.MeshBasicMaterial({ map: clock }));
  clk.position.set(0, 3.6, z + 0.17);
  group.add(clk);
}

function addPartitions(group: THREE.Group, halfW: number, halfD: number) {
  const fabric = toon('#7b8aa6');
  const frame = toon('#c9ced8');
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z = -halfD + 1.7 + k * 3.3;
      const p = mesh(new THREE.BoxGeometry(0.12, 1.25, 3.1), fabric, s * (halfW + 0.45), 0.62, z);
      p.receiveShadow = true;
      group.add(p, mesh(new THREE.BoxGeometry(0.16, 0.06, 3.1), frame, s * (halfW + 0.45), 1.27, z));
    }
  }
}

/** One piece of office furniture, also used to decorate the Chair Race track. */
export function furniture(o: Obstacle): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);
  g.rotation.y = ((o.turn ?? 0) * Math.PI) / 2;
  const w = o.hw * 2;
  const d = o.hd * 2;
  switch (o.kind) {
    case 'desk': {
      g.add(mesh(new THREE.BoxGeometry(w, 0.08, d), toon('#c99a62'), 0, 0.76, 0));
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.add(mesh(new THREE.BoxGeometry(0.07, 0.74, 0.07), toon('#5b5f68'), x * (o.hw - 0.08), 0.37, z * (o.hd - 0.08)));
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.6, d - 0.1), toon('#9a764c'), o.hw - 0.4, 0.4, 0));
      // Monitor with the inbox open.
      const screen = new THREE.Group();
      screen.position.set(-0.2, 0.8, -0.2);
      screen.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), toon('#22252b'), 0, 0.38, 0));
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42), new THREE.MeshBasicMaterial({ color: '#7fb4ff' }));
      s.position.set(0, 0.38, 0.03);
      screen.add(s);
      for (let i = 0; i < 4; i++) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5 - (i % 2) * 0.15, 0.04), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        line.position.set(-0.05, 0.5 - i * 0.08, 0.035);
        screen.add(line);
      }
      screen.add(mesh(new THREE.BoxGeometry(0.06, 0.15, 0.06), toon('#22252b'), 0, 0.1, 0));
      g.add(screen);
      g.add(mesh(new THREE.BoxGeometry(0.55, 0.03, 0.18), toon('#e6e8ec'), -0.2, 0.81, 0.2));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), toon('#c0392b'), 0.5, 0.86, 0.2));
      // A small stack of paper and a quill.
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.08, 0.22), toon('#fbf8f0'), 0.55, 0.84, -0.2));
      // Chair, pushed back.
      const chair = new THREE.Group();
      chair.position.set(-0.2, 0, o.hd + 0.45);
      chair.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14), toon('#2e3440'), 0, 0.48, 0));
      chair.add(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), toon('#2e3440'), 0, 0.8, 0.25));
      chair.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.44, 6), toon('#8a8f99'), 0, 0.24, 0));
      chair.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 5), toon('#8a8f99'), 0, 0.03, 0));
      g.add(chair);
      break;
    }
    case 'printer':
      g.add(mesh(new THREE.BoxGeometry(w, 0.7, d), toon('#d9dce2'), 0, 0.35, 0));
      g.add(mesh(new THREE.BoxGeometry(w - 0.1, 0.12, d - 0.1), toon('#9aa1ad'), 0, 0.76, 0));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.03, 0.32), toon('#ffffff'), 0, 0.84, 0.05));
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.06, 0.02), toon('#2ecc71', '#2ecc71'), 0.3, 0.6, o.hd + 0.01));
      break;
    case 'cooler':
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.95, 0.5), toon('#eef0f3'), 0, 0.47, 0));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 14), new THREE.MeshToonMaterial({ color: '#7fc8ff', transparent: true, opacity: 0.7 })).translateY(1.25));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), toon('#2f6fd6'), -0.1, 0.75, 0.27));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), toon('#d64545'), 0.1, 0.75, 0.27));
      break;
    case 'plant':
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.45, 12), toon('#c46a3c'), 0, 0.22, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(0.26, 10, 8), toon(i % 2 ? '#3f9b5a' : '#4fb36a'), Math.cos(a) * 0.15, 0.7 + (i % 2) * 0.15, Math.sin(a) * 0.15));
      }
      g.add(mesh(new THREE.SphereGeometry(0.26, 10, 8), toon('#58c27a'), 0, 1.0, 0));
      break;
    case 'shelf': {
      g.add(mesh(new THREE.BoxGeometry(w, 1.6, d), toon('#8a6440'), 0, 0.8, 0));
      const colors = ['#c0392b', '#2f5fa8', '#e8c766', '#2f7a52', '#6b2fa0'];
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 6; i++)
          g.add(mesh(new THREE.BoxGeometry(0.2, 0.38, 0.4), toon(colors[(i + row * 2) % colors.length]!), -o.hw + 0.2 + i * 0.27, 0.32 + row * 0.5, 0.06));
      // A display helmet on top.
      g.add(mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#a9b2bb'), 0.4, 1.6, 0));
      g.add(mesh(new THREE.ConeGeometry(0.05, 0.22, 6), toon('#c0392b'), 0.4, 1.86, 0));
      break;
    }
  }
  return g;
}
