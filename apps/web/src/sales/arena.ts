import * as THREE from 'three';
import {
  BRANCHES,
  MODELS,
  STATIONS,
  ZONE_IDS,
  actionHint,
  stationInReach,
  workSecondsFor,
  zoneBit,
  type AvatarConfig,
  type Item,
  type Order,
  type SalesEvent,
  type SalesWorld,
  type Worker,
  type ZoneId,
} from '@inbox/shared';
import { buildAvatar, type AvatarRig } from '../office/avatar3d';
import { sfx } from '../office/sfx';
import { buildMachine, buildPaper, buildSalesScene, setAccessory, textSprite, type MachineModel, type SalesScene } from './scene3d';
import { SalesHud } from './hud';

export interface TeamInfo {
  id: string;
  name: string;
  avatar: AvatarConfig;
  me: boolean;
}

const ME_COLOR = '#3ec1ff';
const MATE_COLORS = ['#ff5d6c', '#7ddc5a', '#c58cff'];

/** Customers who walk in: business people from the branches. */
const CUSTOMERS: AvatarConfig[] = [
  { skin: 1, hairColor: 0, equipped: { head: 'head_human', eyes: 'eyes_dot', hair: 'hair_short', outfit: 'outfit_suit', beard: 'beard_stubble' } },
  { skin: 0, hairColor: 2, equipped: { head: 'head_human', eyes: 'eyes_happy', hair: 'hair_bun', outfit: 'outfit_sweater' } },
  { skin: 3, hairColor: 0, equipped: { head: 'head_human', eyes: 'eyes_sharp', hair: 'hair_long', outfit: 'outfit_suit' } },
  { skin: 2, hairColor: 5, equipped: { head: 'head_human', eyes: 'eyes_dot', outfit: 'outfit_sweater', beard: 'beard_viking' } },
  { skin: 4, hairColor: 1, equipped: { head: 'head_human', eyes: 'eyes_happy', hair: 'hair_short', outfit: 'outfit_iron' } },
  { skin: 1, hairColor: 3, equipped: { head: 'head_elf', eyes: 'eyes_dot', hair: 'hair_long', outfit: 'outfit_suit' } },
  { skin: 0, hairColor: 4, equipped: { head: 'head_human', eyes: 'eyes_sharp', hair: 'hair_mohawk', outfit: 'outfit_sweater' } },
];

interface Actor {
  info: TeamInfo;
  color: string;
  rig: AvatarRig;
  tag: THREE.Sprite;
  facing: number;
  walk: number;
  last: { x: number; z: number };
  heldKey: string;
  held: THREE.Object3D | null;
  machine: MachineModel | null;
  /** The colored ring at the feet. */
  ring: THREE.Object3D | null;
}

interface Customer {
  order: Order;
  rig: AvatarRig;
  card: THREE.Sprite;
  cardKey: string;
  /** Leaving: happy or angry, seconds since. */
  leaving: 'happy' | 'angry' | null;
  t: number;
  x: number;
}

interface Placed {
  key: string;
  obj: THREE.Object3D;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
}

interface Popup {
  sprite: THREE.Sprite;
  life: number;
}

const SPOT_X = (slot: number) => STATIONS.find((s) => s.kind === 'meson' && s.slot === slot)!.x;

/**
 * Three.js view of A Toda Máquina. It only draws: the online match or the offline practice hands
 * it the world each animation frame (with your own worker predicted), plus the events of each step.
 */
export class SalesArena {
  readonly hud: SalesHud;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  private world3d: SalesScene;
  private actors = new Map<string, Actor>();
  private customers = new Map<number, Customer>();
  private placed = new Map<number, Placed>();
  private bars = new Map<number, { bg: THREE.Sprite; fill: THREE.Sprite }>();
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private clock = new THREE.Clock();
  private resize: ResizeObserver;
  private camTarget = new THREE.Vector3(0, 0, 1.5);
  private camReady = false;
  private shake = 0;
  private ownersKey = '';
  readonly meId: string | null;
  private last: SalesWorld | null = null;

  constructor(private container: HTMLElement, team: TeamInfo[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'sm-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#1d2230');
    this.scene.add(new THREE.HemisphereLight('#eef3ff', '#6b5a4a', 1.7));
    const sun = new THREE.DirectionalLight('#fff3dd', 2.0);
    sun.position.set(-10, 26, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 16;
    sc.bottom = -16;
    sc.far = 70;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    this.world3d = buildSalesScene();
    this.scene.add(this.world3d.group);

    let next = 0;
    for (const info of team) {
      const color = info.me ? ME_COLOR : MATE_COLORS[next++ % MATE_COLORS.length]!;
      const rig = buildAvatar(info.avatar, color);
      rig.barrier.visible = false;
      rig.shield.visible = false;
      rig.root.scale.setScalar(1.15);
      this.scene.add(rig.root);
      const tag = textSprite(info.me ? 'Tú' : info.name, { color, size: 50 });
      tag.material.depthTest = false;
      tag.renderOrder = 10;
      tag.scale.multiplyScalar(2.1);
      this.scene.add(tag);
      this.actors.set(info.id, { info, color, rig, tag, facing: Math.PI / 2, walk: 0, last: { x: 0, z: 0 }, heldKey: '', held: null, machine: null, ring: rig.root.children.find((c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.RingGeometry) ?? null });
    }
    this.meId = team.find((t) => t.me)?.id ?? null;
    this.hud = new SalesHud(container);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  private fit() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  colorOf(id: string) {
    return this.actors.get(id)?.color ?? '#ffffff';
  }

  /** Feed the events of a simulation step. */
  events(list: SalesEvent[], world: SalesWorld) {
    for (const e of list) {
      const mine = e.by === this.meId;
      const st = e.station !== undefined ? STATIONS[e.station] : undefined;
      const at = st ? new THREE.Vector3(st.x, 1.6, st.z) : new THREE.Vector3(0, 1.6, 0);
      switch (e.type) {
        case 'arrive':
          if (world.orders.length <= 2 || mine) sfx.beep();
          break;
        case 'take':
          if (mine) sfx.go();
          break;
        case 'place':
        case 'pickup':
          if (mine) sfx.block();
          break;
        case 'written':
          this.popup('¡Orden lista!', '#ffd95e', at);
          sfx.meeting();
          break;
        case 'stamped':
          this.popup('¡Timbrada!', '#ff7b7b', at);
          this.burst(at, ['#d63a3a', '#ffffff'], 10);
          sfx.hit();
          break;
        case 'machine':
          if (mine) sfx.whoosh();
          break;
        case 'return':
          if (mine) this.hud.toast('Máquina devuelta: tienes la orden de nuevo', '#ffffff');
          break;
        case 'accessory':
          if (mine) sfx.block();
          break;
        case 'served': {
          this.popup(`+${e.n}`, '#7ddc5a', at);
          this.burst(at, ['#ffd95e', '#7ddc5a', '#3ec1ff', '#ffffff'], 26);
          const c = this.customers.get(e.order!);
          if (c) {
            c.leaving = 'happy';
            c.t = 0;
          }
          sfx.heal();
          if (mine) this.hud.toast(`¡Cliente #${e.order} feliz!`, '#7ddc5a');
          break;
        }
        case 'wrong':
          this.popup(`-${e.n} s`, '#ff6b6b', at);
          this.hud.toast(e.text ?? 'Pedido equivocado', '#ff8a8a', 2400);
          this.shake = 0.3;
          sfx.ko();
          break;
        case 'lost': {
          const c = this.customers.get(e.order!);
          if (c) {
            c.leaving = 'angry';
            c.t = 0;
            this.popup('¡Se fue enojado!', '#ff6b6b', c.rig.root.position.clone().add(new THREE.Vector3(0, 1.4, 0)));
          }
          this.hud.toast(`El cliente #${e.order} se cansó de esperar`, '#ff8a8a', 2200);
          this.shake = 0.4;
          sfx.hit();
          break;
        }
        case 'nope':
          if (mine && e.text) this.hud.toast(e.text, '#ffb3b3', 1600);
          break;
        case 'goal':
          this.hud.banner('¡Meta cumplida!', `Jornada ${e.n}: llegan más clientes${Number(e.text) > 0 ? ` · +${e.text} por tiempo` : ''}`, 2600);
          this.burst(new THREE.Vector3(0, 2, 2), ['#ffd95e', '#ff5d6c', '#3ec1ff', '#7ddc5a', '#ffffff'], 60);
          sfx.go();
          break;
        case 'over':
          this.shake = 0.8;
          this.hud.banner('¡Queman todo!', e.text === 'time' ? 'Se acabó el tiempo sin cumplir la meta' : 'Demasiados clientes enojados', 0);
          sfx.ko();
          break;
        case 'zones':
          this.hud.toast('Cambió el reparto de zonas', '#7fd3ff', 2200);
          break;
      }
    }
  }

  private burst(at: THREE.Vector3, colors: string[], n: number) {
    for (let i = 0; i < n; i++) {
      const geo = i % 2 === 0 ? new THREE.PlaneGeometry(0.18, 0.22) : new THREE.OctahedronGeometry(0.07);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      this.scene.add(m);
      this.particles.push({ mesh: m, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, life: 0, max: 0.6 + Math.random() * 0.5 });
    }
  }

  private popup(text: string, color: string, at: THREE.Vector3) {
    const sprite = textSprite(text, { color, size: 60 });
    sprite.material.depthTest = false;
    sprite.renderOrder = 11;
    sprite.position.copy(at).add(new THREE.Vector3(0, 0.8, 0));
    this.scene.add(sprite);
    this.popups.push({ sprite, life: 0 });
  }

  private cardFor(o: Order): { key: string; draw: (c: CanvasRenderingContext2D) => void } {
    const pct = Math.max(0, o.left / o.patience);
    const bucket = Math.ceil(pct * 20);
    const key = `${o.status}|${bucket}`;
    return {
      key,
      draw: (c) => {
        // A compact speech card: order number, branch color, machine color and patience.
        const W = 256;
        const H = 128;
        c.clearRect(0, 0, W, H);
        c.fillStyle = '#fbf8f0';
        c.beginPath();
        c.roundRect(6, 6, W - 12, H - 30, 22);
        c.fill();
        c.beginPath();
        c.moveTo(W / 2 - 14, H - 25);
        c.lineTo(W / 2, H - 6);
        c.lineTo(W / 2 + 14, H - 25);
        c.fill();
        c.fillStyle = BRANCHES[o.branch].color;
        c.beginPath();
        c.roundRect(6, 6, 30, H - 30, [22, 0, 0, 22]);
        c.fill();
        c.fillStyle = '#1b1f2a';
        c.font = '900 50px system-ui, sans-serif';
        c.textBaseline = 'middle';
        c.fillText(`#${o.id}`, 46, 44);
        c.fillStyle = MODELS[o.model].color;
        c.strokeStyle = '#1b1f2a';
        c.lineWidth = 3;
        c.beginPath();
        c.roundRect(W - 70, 22, 44, 44, 8);
        c.fill();
        c.stroke();
        if (o.accessory) {
          c.fillStyle = '#1b1f2a';
          c.font = '900 30px system-ui, sans-serif';
          c.fillText('+', W - 98, 46);
        }
        c.fillStyle = '#e3e7ee';
        c.fillRect(46, 78, W - 72, 12);
        c.fillStyle = pct < 0.25 ? '#e5484d' : pct < 0.5 ? '#f2b705' : '#3fb27f';
        c.fillRect(46, 78, (W - 72) * pct, 12);
      },
    };
  }

  private syncCustomers(world: SalesWorld) {
    for (const o of world.orders) {
      let c = this.customers.get(o.id);
      if (!c) {
        const rig = buildAvatar(CUSTOMERS[o.id % CUSTOMERS.length]!, BRANCHES[o.branch].color);
        rig.barrier.visible = false;
        rig.shield.visible = false;
        rig.root.rotation.y = Math.PI;
        this.scene.add(rig.root);
        const cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 128;
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const card = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        card.renderOrder = 9;
        card.scale.set(2.3, 1.15, 1);
        this.scene.add(card);
        c = { order: o, rig, card, cardKey: '', leaving: null, t: 0, x: SPOT_X(o.slot) };
        this.customers.set(o.id, c);
      }
      c.order = o;
      const { key, draw } = this.cardFor(o);
      if (key !== c.cardKey) {
        c.cardKey = key;
        const tex = c.card.material.map as THREE.CanvasTexture;
        draw((tex.image as HTMLCanvasElement).getContext('2d')!);
        tex.needsUpdate = true;
      }
    }
    // Customers whose order disappeared without an event (a missed frame) just leave.
    for (const [id, c] of this.customers) {
      if (!c.leaving && !world.orders.some((o) => o.id === id)) {
        c.leaving = 'happy';
        c.t = 0;
      }
    }
  }

  private poseCustomers(dt: number, time: number) {
    for (const [id, c] of this.customers) {
      const r = c.rig;
      r.body.position.set(0, 0, 0);
      r.body.rotation.set(0, 0, 0);
      r.head.rotation.set(0, 0, 0);
      r.armL.rotation.set(0, 0, 0.12);
      r.armR.rotation.set(0, 0, -0.12);
      r.legL.rotation.set(0, 0, 0);
      r.legR.rotation.set(0, 0, 0);
      r.stars.visible = false;
      r.trail.visible = false;
      if (c.leaving) {
        c.t += dt;
        // Walk off along the sidewalk.
        const dir = c.x < -7 ? -1 : 1;
        c.x += dir * dt * (c.leaving === 'angry' ? 5 : 3);
        r.root.position.set(c.x, 0, 10.2 + Math.min(1, c.t) * 0.8);
        r.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const s = Math.sin(time * 14);
        r.legL.rotation.x = s * 0.7;
        r.legR.rotation.x = -s * 0.7;
        if (c.leaving === 'happy') {
          r.armL.rotation.set(0, 0, 2.5 + s * 0.2);
          r.armR.rotation.set(0, 0, -2.5 - s * 0.2);
        } else {
          r.armL.rotation.x = -s;
          r.armR.rotation.x = s;
          r.stars.visible = true;
          r.stars.rotation.y = time * 8;
        }
        c.card.visible = false;
        if (c.t > 4) {
          this.scene.remove(r.root, c.card);
          c.card.material.map?.dispose();
          c.card.material.dispose();
          this.customers.delete(id);
        }
        continue;
      }
      const o = c.order;
      const pct = o.left / o.patience;
      r.root.position.set(c.x, 0, 9.85);
      r.root.rotation.y = Math.PI;
      r.body.position.y = Math.sin(time * 3 + id) * 0.02;
      if (pct < 0.25) {
        // Tapping a foot and shaking a fist.
        r.legR.rotation.x = Math.max(0, Math.sin(time * 14)) * -0.4;
        r.armR.rotation.set(-2.4 + Math.sin(time * 16) * 0.3, 0, -0.3);
        r.head.rotation.z = Math.sin(time * 12) * 0.1;
      } else if (o.status === 'waiting') {
        // Waving to get attention.
        r.armR.rotation.set(0, 0, -2.6 + Math.sin(time * 6 + id) * 0.35);
      }
      c.card.visible = true;
      c.card.position.set(c.x, 3.3, 10.0);
    }
  }

  /** What a station shows on top: papers on desks and pass counters. */
  private syncStations(world: SalesWorld) {
    world.stations.forEach((st, id) => {
      const def = STATIONS[id]!;
      const spot = this.world3d.itemSpot.get(id);
      const key = st.item ? this.itemKey(st.item) : '';
      const cur = this.placed.get(id);
      if ((cur?.key ?? '') !== key) {
        if (cur) this.scene.remove(cur.obj);
        this.placed.delete(id);
        if (st.item && spot) {
          const obj = this.itemObject(st.item, 0.55);
          obj.position.copy(spot);
          if (st.item.kind === 'maquina') obj.position.y = 0;
          this.scene.add(obj);
          this.placed.set(id, { key, obj });
        }
      }
      // Work progress over desks.
      const total = workSecondsFor(def.kind);
      if (!total) return;
      let bar = this.bars.get(id);
      if (!bar) {
        const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#1b1f2a', depthTest: false, transparent: true, opacity: 0.8 }));
        const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#7ddc5a', depthTest: false }));
        bg.renderOrder = 12;
        fill.renderOrder = 13;
        bg.center.set(0, 0.5);
        fill.center.set(0, 0.5);
        this.scene.add(bg, fill);
        bar = { bg, fill };
        this.bars.set(id, bar);
      }
      const show = !!st.item && st.work > 0;
      bar.bg.visible = bar.fill.visible = show;
      if (show && spot) {
        const k = Math.min(1, st.work / total);
        bar.bg.position.set(spot.x - 0.65, spot.y + 1.1, spot.z);
        bar.bg.scale.set(1.3, 0.2, 1);
        bar.fill.position.set(spot.x - 0.62, spot.y + 1.1, spot.z);
        bar.fill.scale.set(1.24 * Math.max(0.01, k), 0.13, 1);
      }
    });
  }

  private itemKey(item: Item) {
    return `${item.id}|${item.kind}|${item.model ?? ''}|${item.accessory ?? ''}`;
  }

  private itemObject(item: Item, machineScale: number): THREE.Object3D {
    if (item.kind === 'maquina') {
      const m = buildMachine(item.model!);
      setAccessory(m, item.accessory);
      m.root.scale.setScalar(machineScale);
      return m.root;
    }
    const g = new THREE.Group();
    const paper = buildPaper(item.kind);
    g.add(paper);
    const tag = textSprite(`#${item.order}`, { color: '#ffffff', size: 70, width: 256 });
    tag.position.set(0, 0.7, 0);
    tag.scale.multiplyScalar(1.4);
    tag.material.depthTest = false;
    tag.renderOrder = 9;
    g.add(tag);
    return g;
  }

  private syncOwners(world: SalesWorld) {
    const owner = new Map<ZoneId, string>();
    for (const w of world.workers) if (w.active) for (const z of ZONE_IDS) if (w.zones & zoneBit(z)) owner.set(z, w.id);
    const key = ZONE_IDS.map((z) => owner.get(z) ?? '').join('|');
    if (key === this.ownersKey) return;
    this.ownersKey = key;
    for (const wall of this.world3d.walls) wall.group.visible = owner.get(wall.between[0]) !== owner.get(wall.between[1]);
    for (const z of ZONE_IDS) {
      const marks = this.world3d.zoneMarks.get(z)!;
      const id = owner.get(z);
      const color = id ? this.colorOf(id) : '#ffffff';
      (marks.border.material as THREE.LineBasicMaterial).color.set(color);
      const tint = marks.tint.material as THREE.MeshBasicMaterial;
      tint.color.set(color);
      tint.opacity = id === this.meId ? 0.1 : 0.05;
    }
  }

  /** Draws one animation frame. `world` has your own worker already predicted. */
  render(world: SalesWorld) {
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    this.last = world;
    this.world3d.update(time, world.strikes);
    this.syncOwners(world);
    this.syncCustomers(world);
    this.poseCustomers(dt, time);
    this.syncStations(world);

    for (const w of world.workers) {
      const a = this.actors.get(w.id);
      if (a) this.pose(a, w, dt, time);
    }

    const me = world.workers.find((w) => w.id === this.meId) ?? null;
    const reach = me && me.active ? stationInReach(me) : null;
    const hint = me && me.active ? actionHint(world, me) : null;
    for (const [id, ring] of this.world3d.rings) {
      const mat = ring.material as THREE.MeshBasicMaterial;
      const on = reach?.id === id;
      mat.opacity = on ? 0.85 : 0.16;
      mat.color.set(on ? (hint?.ok ? '#7ddc5a' : '#ffb3b3') : '#ffffff');
      ring.scale.setScalar(on ? 1 + Math.sin(time * 8) * 0.06 : 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.03, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += 8 * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - Math.max(0, (p.life - p.max * 0.5) / (p.max * 0.5));
      if (p.life >= p.max) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]!;
      p.life += dt;
      p.sprite.position.y += dt * 1.1;
      p.sprite.material.opacity = 1 - Math.max(0, (p.life - 0.8) / 0.5);
      if (p.life > 1.3) {
        this.scene.remove(p.sprite);
        p.sprite.material.map?.dispose();
        p.sprite.material.dispose();
        this.popups.splice(i, 1);
      }
    }

    // Camera: the whole floor on wide screens, following you on narrow ones.
    const aspect = this.camera.aspect;
    const pitch = (60 * Math.PI) / 180;
    const half = Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    let dist: number;
    if (aspect >= 1.15) {
      const byWidth = 19.5 / (half * aspect);
      const byDepth = 11 / half;
      dist = Math.max(byWidth, byDepth);
      this.camTarget.set(1.2, 0, 2.9);
    } else {
      dist = aspect < 0.8 ? 34 : 28;
      const want = me ? new THREE.Vector3(Math.max(-8, Math.min(8, me.x)), 0, Math.max(-5, Math.min(6, me.z)) + 1) : new THREE.Vector3(0, 0, 1.3);
      if (!this.camReady) this.camTarget.copy(want);
      else this.camTarget.lerp(want, Math.min(1, dt * 3));
    }
    this.camReady = true;
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 0.35;
    this.camera.position.set(
      this.camTarget.x + (Math.random() - 0.5) * sh,
      this.camTarget.y + Math.sin(pitch) * dist + (Math.random() - 0.5) * sh,
      this.camTarget.z + Math.cos(pitch) * dist,
    );
    this.camera.lookAt(this.camTarget);

    this.hud.update(world, this.meId, hint);
    this.renderer.render(this.scene, this.camera);
  }

  private pose(a: Actor, w: Worker, dt: number, time: number) {
    const r = a.rig;
    const moved = Math.hypot(w.x - a.last.x, w.z - a.last.z);
    a.last = { x: w.x, z: w.z };
    const moving = moved / Math.max(dt, 1e-3) > 0.6;
    a.walk = moving ? a.walk + dt : 0;
    r.root.position.set(w.x, 0, w.z);
    let diff = w.h - a.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.facing += diff * Math.min(1, dt * 14);
    r.root.rotation.set(0, Math.PI / 2 - a.facing, 0);
    r.root.visible = true;
    if (a.ring) a.ring.visible = w.active;

    r.body.position.set(0, 0, 0);
    r.body.rotation.set(0, 0, 0);
    r.head.rotation.set(0, 0, 0);
    r.armL.rotation.set(0, 0, 0.12);
    r.armR.rotation.set(0, 0, -0.12);
    r.legL.rotation.set(0, 0, 0);
    r.legR.rotation.set(0, 0, 0);
    r.stars.visible = false;
    r.trail.visible = false;

    if (moving) {
      const s = Math.sin(a.walk * 14);
      r.legL.rotation.x = s * 0.75;
      r.legR.rotation.x = -s * 0.75;
      r.armL.rotation.x = -s * 0.6;
      r.armR.rotation.x = s * 0.6;
      r.body.position.y = Math.abs(Math.cos(a.walk * 14)) * 0.06;
    } else {
      r.body.position.y = Math.sin(time * 3) * 0.02;
    }
    if (w.working) {
      // Writing or stamping: arms at the desk, a quick up and down.
      const k = Math.abs(Math.sin(time * 12));
      r.armR.rotation.set(-1.2 - k * 0.6, 0, -0.1);
      r.armL.rotation.set(-1.0, 0, 0.1);
      r.body.rotation.x = 0.15;
    }

    // What the worker carries.
    const key = w.held ? this.itemKey(w.held) : '';
    if (key !== a.heldKey) {
      a.heldKey = key;
      if (a.held) r.root.remove(a.held);
      a.held = null;
      a.machine = null;
      if (w.held) {
        if (w.held.kind === 'maquina') {
          const m = buildMachine(w.held.model!);
          setAccessory(m, w.held.accessory);
          m.root.scale.setScalar(MODELS[w.held.model!].id === 'camion' ? 0.42 : 0.55);
          m.root.position.set(0, 0, 1.05);
          a.machine = m;
          a.held = m.root;
        } else {
          const paper = buildPaper(w.held.kind);
          paper.position.set(0, 1.05, 0.42);
          paper.rotation.x = -0.5;
          a.held = paper;
        }
        r.root.add(a.held);
      }
    }
    if (w.held) {
      if (w.held.kind === 'maquina') {
        // Pushing the machine.
        r.armL.rotation.set(-1.35, 0, 0.15);
        r.armR.rotation.set(-1.35, 0, -0.15);
        r.body.rotation.x = 0.22;
        if (a.machine?.beacon && a.machine.beacon.visible) a.machine.beacon.rotation.y = time * 8;
      } else if (!w.working) {
        r.armL.rotation.set(-1.1, 0, 0.35);
        r.armR.rotation.set(-1.1, 0, -0.35);
      }
    }
    if (!w.active) {
      // Disconnected: asleep on their feet.
      r.body.rotation.x = 0.25;
      r.head.rotation.x = 0.4;
      r.stars.visible = true;
      r.stars.rotation.y = time * 3;
    }
    if (r.pet) {
      r.pet.position.y = 1.35 + Math.sin(time * 4) * 0.1;
      r.pet.rotation.y = Math.sin(time * 1.5) * 0.4;
    }
    if (r.cape) r.cape.rotation.x = -0.15 - (moving ? 0.3 : 0) + Math.sin(time * 6) * 0.04;
    if (r.wings) {
      const flap = Math.sin(time * 6) * 0.25;
      r.wings.children.forEach((wg) => (wg.rotation.y = (wg.name === 'wl' ? -1 : 1) * (0.5 + flap)));
    }
    if (r.aura) r.aura.rotation.y = time * 1.5;
    a.tag.position.set(w.x, 2.9, w.z);
    a.tag.material.opacity = w.active ? 1 : 0.5;
  }

  /** Latest world drawn, for the result screen. */
  get world() {
    return this.last;
  }

  dispose() {
    this.resize.disconnect();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) o.geometry?.dispose();
    });
  }
}

