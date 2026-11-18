import * as THREE from 'three';
import {
  DOORS,
  FORTS,
  MATERIAL_IDS,
  SHOP,
  VEHICLES,
  VEHICLE_IDS,
  WEAPONS,
  WEAPON_IDS,
  ZOMBIE_KINDS,
  doorInReach,
  shopAt,
  useHint,
  type AvatarConfig,
  type Survivor,
  type Vehicle,
  type ZEvent,
  type ZombieView,
} from '@inbox/shared';
import { buildAvatar, type AvatarRig } from '../office/avatar3d';
import { sfx } from '../office/sfx';
import { textSprite } from '../sales/scene3d';
import { AIMED, SHOT_COLORS, buildVehicle, buildWeapon, buildZombie, buildZombieMap, type VehicleModel, type ZombieMap, type ZombieRig } from './scene3d';
import { ZombieHud } from './hud';

export interface TeamInfo {
  id: string;
  name: string;
  avatar: AvatarConfig;
  me: boolean;
}

const ME_COLOR = '#3ec1ff';
const MATE_COLORS = ['#ff5d6c', '#ffd95e', '#c58cff', '#7ddc5a', '#ff9a3c'];
const DEFAULT_AVATAR: AvatarConfig = { skin: 1, hairColor: 0, equipped: { head: 'head_human', eyes: 'eyes_dot', hair: 'hair_short', outfit: 'outfit_suit' } };

interface Actor {
  info: TeamInfo;
  color: string;
  rig: AvatarRig;
  tag: THREE.Sprite;
  facing: number;
  weapon: THREE.Group | null;
  weaponId: number;
  ring: THREE.Mesh;
  hurt: number;
}

interface ZActor {
  rig: ZombieRig;
  bar: { bg: THREE.Sprite; fill: THREE.Sprite } | null;
  walk: number;
  facing: number;
  /** Dying: seconds since. */
  dead: number;
  hurt: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  gravity: number;
}

interface Popup {
  sprite: THREE.Sprite;
  life: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size: number;
}

/**
 * Three.js view of Zona Zombi. It only draws: the online match or the offline practice hands it
 * the world each animation frame (with your own player predicted), plus the events of each step.
 */
export class ZombieArena {
  readonly hud: ZombieHud;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  private sun: THREE.DirectionalLight;
  private map: ZombieMap;
  private actors = new Map<string, Actor>();
  private zombies = new Map<number, ZActor>();
  private killed = new Set<number>();
  private cars = new Map<number, VehicleModel & { bar: { bg: THREE.Sprite; fill: THREE.Sprite } }>();
  private shots = new Map<number, THREE.Mesh>();
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private rings: Ring[] = [];
  private clock = new THREE.Clock();
  private resize: ResizeObserver;
  private camTarget = new THREE.Vector3();
  private camReady = false;
  private shake = 0;
  private zoom = 1;
  readonly meId: string | null;
  private team: TeamInfo[];
  private nextColor = 0;

  constructor(private container: HTMLElement, team: TeamInfo[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'zz-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#1b2418');
    this.scene.fog = new THREE.Fog('#1b2418', 48, 95);
    this.scene.add(new THREE.HemisphereLight('#e8f0ff', '#4a5a3a', 1.6));
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    this.map = buildZombieMap();
    this.scene.add(this.map.group);

    this.team = team;
    this.meId = team.find((t) => t.me)?.id ?? null;
    for (const info of team) this.actor(info.id);
    this.hud = new ZombieHud(container, this.hudPlayers());

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  private hudPlayers() {
    return [...this.actors.values()].map((a) => ({ id: a.info.id, name: a.info.name, color: a.color, me: a.info.me }));
  }

  /** Someone joined or the names arrived: add players we don't draw yet. */
  setTeam(team: TeamInfo[]) {
    this.team = team;
    for (const t of team) {
      const a = this.actors.get(t.id);
      if (a && a.info.name !== t.name) {
        // Placeholder from before the names arrived: rebuild with the real avatar.
        this.removeActor(t.id);
      }
      this.actor(t.id);
    }
    this.hud.setPlayers(this.hudPlayers());
  }

  private removeActor(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    this.scene.remove(a.rig.root, a.tag);
    this.actors.delete(id);
  }

  private actor(id: string): Actor {
    let a = this.actors.get(id);
    if (a) return a;
    const info = this.team.find((t) => t.id === id) ?? { id, name: 'Sobreviviente', avatar: DEFAULT_AVATAR, me: false };
    const color = info.me ? ME_COLOR : MATE_COLORS[this.nextColor++ % MATE_COLORS.length]!;
    // The armory weapon is replaced by the one bought in the match.
    const rig = buildAvatar({ ...info.avatar, equipped: { ...info.avatar.equipped, weapon: undefined } }, color);
    rig.barrier.visible = false;
    rig.shield.visible = false;
    rig.root.scale.setScalar(1.1);
    this.scene.add(rig.root);
    const tag = textSprite(info.me ? 'Tú' : info.name, { color, size: 50 });
    tag.material.depthTest = false;
    tag.renderOrder = 10;
    tag.scale.multiplyScalar(info.me ? 2 : 1.6);
    this.scene.add(tag);
    const ring = rig.root.children.find((c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.RingGeometry) as THREE.Mesh;
    a = { info, color, rig, tag, facing: 0, weapon: null, weaponId: -1, ring, hurt: 0 };
    this.actors.set(id, a);
    return a;
  }

  private fit() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private nameOf(id: string) {
    const a = this.actors.get(id);
    return a ? (a.info.me ? 'Tú' : a.info.name) : 'Alguien';
  }

  /** Feed the events of a simulation step. */
  events(list: ZEvent[]) {
    for (const e of list) {
      const mine = e.by === this.meId;
      const at = new THREE.Vector3(e.x, 1.2, e.z);
      switch (e.type) {
        case 'swing':
          if (mine) sfx.swing();
          break;
        case 'shot':
          if (mine || this.near(e)) sfx.shot();
          if (WEAPON_IDS[e.kind ?? 0] === 'escopeta') this.burst(at, ['#ffd95e', '#ffffff'], 5, 0.5);
          break;
        case 'nova':
          this.ring(e.x, e.z, '#bff4ff', WEAPONS.hielo.range ?? 4, 0.45);
          this.burst(at, ['#dffbff', '#7fd3ff'], 16, 1);
          if (mine) sfx.splash();
          break;
        case 'blast':
          this.ring(e.x, e.z, '#ff8a3c', e.n ?? 2, 0.35);
          this.burst(at, ['#ff7a1a', '#ffd95e', '#5a3a2a'], 18, 1.2);
          if (this.near(e)) sfx.hit();
          break;
        case 'hit':
          this.burst(at, ['#6fbf3a', '#3f7a2a'], e.kind === 2 ? 4 : 3, 0.6);
          if (mine && (e.n ?? 0) >= 8) this.popup(String(e.n), '#ffffff', at, 0.8);
          if (mine) sfx.hit();
          break;
        case 'kill': {
          const id = Number(e.target);
          this.killed.add(id);
          this.burst(at, ['#6fbf3a', '#3f7a2a', '#a33'], e.kind === 2 ? 30 : 12, e.kind === 2 ? 1.8 : 1);
          if (mine) this.popup(`+${e.n}`, '#ffd95e', at.clone().add(new THREE.Vector3(0, 0.6, 0)), 1);
          if (e.kind === 2) {
            this.shake = Math.max(this.shake, 0.4);
            this.hud.toast(`${this.nameOf(e.by)} derribó a un zombi gigante`, '#9cff6a', 2000);
          }
          break;
        }
        case 'merge':
          this.ring(e.x, e.z, '#c58cff', e.kind === 2 ? 3 : 1.8, 0.5);
          this.burst(at, ['#c58cff', '#6fbf3a'], 20, 1.4);
          this.popup(e.kind === 2 ? '¡Zombi gigante!' : '¡3 se fusionaron!', '#c58cff', at.clone().add(new THREE.Vector3(0, 1.4, 0)), 1);
          if (this.near(e, 22)) sfx.meeting();
          break;
        case 'hurt':
        case 'friendly':
          if (e.target === this.meId) {
            this.shake = Math.max(this.shake, 0.25);
            sfx.hit();
            if (e.type === 'friendly') this.hud.toast(`¡${this.nameOf(e.by)} te golpeó!`, '#ff8a8a', 1400);
          } else if (e.type === 'friendly' && mine) this.hud.toast(`¡Golpeaste a ${this.nameOf(e.target ?? '')}!`, '#ff8a8a', 1400);
          if (e.target) {
            const a = this.actors.get(e.target);
            if (a) a.hurt = 0.2;
          }
          this.burst(at, ['#ff5d6c'], 5, 0.6);
          break;
        case 'block':
          if (e.target === this.meId) sfx.block();
          this.burst(at, ['#9fd3ff', '#ffffff'], 6, 0.6);
          break;
        case 'dodge':
          if (e.target === this.meId) sfx.whoosh();
          break;
        case 'down':
          if (e.target === this.meId) {
            sfx.ko();
            this.shake = 0.5;
          } else this.hud.toast(`${this.nameOf(e.target ?? '')} cayó: ¡ayúdalo con E!`, '#ff8a8a', 2200);
          break;
        case 'revive':
        case 'respawn':
          if (e.by === this.meId || e.target === this.meId) sfx.heal();
          this.ring(e.x, e.z, '#7ddc5a', 1.6, 0.6);
          break;
        case 'buy': {
          if (!mine) break;
          const item = SHOP.find((i) => i.id === e.text);
          sfx.heal();
          this.hud.toast(item ? `Compraste: ${item.name}` : 'Compra lista', '#9cff6a', 1600);
          if (item?.kind === 'vehicle') this.hud.toast(`${item.name} te espera afuera, junto a la puerta`, '#9cff6a', 2600);
          break;
        }
        case 'nope':
          if (mine && e.text) this.hud.toast(e.text, '#ffb3b3', 1500);
          break;
        case 'barricade':
          sfx.block();
          this.burst(at, ['#c8962e', '#ffffff'], 10, 0.8);
          if (mine) this.hud.toast(`Puerta bloqueada con ${['tablones', 'acero', 'sello arcano'][e.kind ?? 0]}`, '#ffd95e');
          break;
        case 'door_hit':
          this.burst(at, ['#8a5a2b', '#cccccc'], 3, 0.6);
          break;
        case 'door_break':
          this.burst(at, ['#8a5a2b', '#cccccc', '#c58cff'], 26, 1.4);
          this.hud.toast(`¡Rompieron una barricada del ${FORTS[DOORS[e.n ?? 0]!.fort].name.toLowerCase()}!`, '#ff8a8a', 2200);
          if (this.near(e, 25)) sfx.ko();
          break;
        case 'car_in':
        case 'car_out':
          if (mine) sfx.whoosh();
          break;
        case 'car_hit':
          if ((e.n ?? 0) >= 50) {
            this.shake = Math.max(this.shake, 0.45);
            this.burst(at, ['#ffd95e', '#888888'], 14, 1.2);
            if (this.near(e)) sfx.ko();
          }
          break;
        case 'car_boom':
          this.ring(e.x, e.z, '#ff8a3c', 3.5, 0.6);
          this.burst(at, ['#ff7a1a', '#ffd95e', '#333333'], 40, 2.2);
          this.shake = Math.max(this.shake, 0.6);
          this.hud.toast(`¡Destruyeron ${VEHICLES[VEHICLE_IDS[e.kind ?? 0]!].name.toLowerCase().replace(/^(carro|auto|camión)/, 'el $1').replace(/^alfombra/, 'la alfombra')}!`, '#ff8a8a', 2200);
          sfx.ko();
          break;
        case 'ram':
          if (mine) sfx.hit();
          break;
        case 'wave':
          this.hud.banner(`Oleada ${e.n}`, `${e.kind} zombis vienen por ti`, 2200);
          sfx.go();
          break;
        case 'clear':
          this.hud.banner('¡Oleada superada!', `+${e.kind} monedas para cada uno · tienen ${20} s de descanso`, 2600);
          sfx.heal();
          break;
        case 'over':
          this.hud.banner('Cayeron todos', `Llegaron a la oleada ${e.n}`, 0);
          sfx.ko();
          break;
        case 'join':
          if (!mine) this.hud.toast(`${this.nameOf(e.by)} se unió: vienen más zombis`, '#7fd3ff', 2400);
          break;
      }
    }
  }

  private near(e: { x: number; z: number }, r = 16) {
    return this.camReady && Math.hypot(e.x - this.camTarget.x, e.z - this.camTarget.z) < r;
  }

  private burst(at: THREE.Vector3, colors: string[], n: number, power: number) {
    if (this.particles.length > 400) return;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const s = (1 + Math.random() * 3) * power;
      this.scene.add(m);
      this.particles.push({ mesh: m, vx: Math.cos(a) * s, vy: (1.5 + Math.random() * 3) * power, vz: Math.sin(a) * s, life: 0, max: 0.5 + Math.random() * 0.4, gravity: 10 });
    }
  }

  private popup(text: string, color: string, at: THREE.Vector3, scale = 1) {
    const sprite = textSprite(text, { color, size: 60 });
    sprite.material.depthTest = false;
    sprite.renderOrder = 11;
    sprite.scale.multiplyScalar(1.6 * scale);
    sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.8, 0));
    this.scene.add(sprite);
    this.popups.push({ sprite, life: 0 });
  }

  private ring(x: number, z: number, color: string, size: number, max: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.1, z);
    this.scene.add(m);
    this.rings.push({ mesh: m, life: 0, max, size });
  }

  private hpBar(): { bg: THREE.Sprite; fill: THREE.Sprite } {
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#10140f', depthTest: false, transparent: true, opacity: 0.8 }));
    const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ff5d6c', depthTest: false }));
    bg.renderOrder = 12;
    fill.renderOrder = 13;
    bg.center.set(0, 0.5);
    fill.center.set(0, 0.5);
    this.scene.add(bg, fill);
    return { bg, fill };
  }

  private placeBar(bar: { bg: THREE.Sprite; fill: THREE.Sprite }, x: number, y: number, z: number, w: number, k: number, show: boolean) {
    bar.bg.visible = bar.fill.visible = show;
    if (!show) return;
    bar.bg.position.set(x - w / 2, y, z);
    bar.bg.scale.set(w, 0.2, 1);
    bar.fill.position.set(x - w / 2 + 0.03, y, z);
    bar.fill.scale.set((w - 0.06) * Math.max(0.01, k), 0.12, 1);
  }

  private syncZombies(view: ZombieView, dt: number, time: number) {
    const seen = new Set<number>();
    for (const zb of view.zombies) {
      seen.add(zb.id);
      let z = this.zombies.get(zb.id);
      if (!z) {
        const rig = buildZombie(zb.kind, zb.id);
        this.scene.add(rig.root);
        z = { rig, bar: zb.kind > 0 ? this.hpBar() : null, walk: Math.random() * 6, facing: zb.h, dead: -1, hurt: 0 };
        this.zombies.set(zb.id, z);
      }
      const r = z.rig;
      const moved = Math.hypot(r.root.position.x - zb.x, r.root.position.z - zb.z);
      r.root.position.set(zb.x, 0, zb.z);
      let diff = zb.h - z.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      z.facing += diff * Math.min(1, dt * 10);
      r.root.rotation.y = Math.PI / 2 - z.facing;
      const speed = moved / Math.max(dt, 1e-3);
      z.walk += dt * Math.min(12, 3 + speed * 2.4);
      const s = Math.sin(z.walk);
      // Shamble with arms out.
      r.legL.rotation.x = s * 0.55;
      r.legR.rotation.x = -s * 0.55;
      r.armL.rotation.set(-1.35 + Math.sin(z.walk * 0.5) * 0.15, 0, 0.1);
      r.armR.rotation.set(-1.45 - Math.sin(z.walk * 0.5 + 1) * 0.15, 0, -0.1);
      r.body.rotation.set(0.12, 0, Math.sin(z.walk * 0.5) * 0.1);
      r.head.rotation.set(0, 0, Math.sin(time * 1.3 + zb.id) * 0.25);
      if (zb.act === 'wind') {
        const k = Math.min(1, zb.t / ZOMBIE_KINDS[zb.kind].wind);
        r.armL.rotation.x = r.armR.rotation.x = -1.4 - k * 1.4;
        r.body.rotation.x = -0.25 * k;
      } else if (zb.act === 'stun') {
        r.body.rotation.x = -0.4;
        r.head.rotation.z = Math.sin(time * 20) * 0.3;
      }
      z.hurt = Math.max(0, z.hurt - dt);
      if (z.bar) this.placeBar(z.bar, zb.x, zb.kind === 2 ? 4.6 : 2.3, zb.z, zb.kind === 2 ? 2 : 1.1, zb.hp / zb.max, zb.hp < zb.max);
    }
    for (const [id, z] of this.zombies) {
      if (seen.has(id)) continue;
      if (z.dead < 0) {
        z.dead = 0;
        if (z.bar) z.bar.bg.visible = z.bar.fill.visible = false;
        // Merged zombies vanish in the puff; killed ones fall over.
        if (!this.killed.has(id)) z.dead = 0.79;
        this.killed.delete(id);
      }
      z.dead += dt;
      const k = Math.min(1, z.dead / 0.35);
      z.rig.body.rotation.x = -k * 1.45;
      z.rig.root.position.y = -Math.max(0, z.dead - 0.45) * 1.5;
      if (z.dead > 0.8) {
        this.scene.remove(z.rig.root);
        if (z.bar) this.scene.remove(z.bar.bg, z.bar.fill);
        this.zombies.delete(id);
      }
    }
  }

  private syncCars(view: ZombieView, dt: number, time: number) {
    const seen = new Set<number>();
    for (const c of view.cars) {
      seen.add(c.id);
      let m = this.cars.get(c.id);
      if (!m) {
        const built = buildVehicle(c.kind);
        this.scene.add(built.root);
        m = { ...built, bar: this.hpBar() };
        this.cars.set(c.id, m);
      }
      m.root.position.set(c.x, m.float ? 0.7 + Math.sin(time * 3 + c.id) * 0.12 : 0, c.z);
      m.root.rotation.y = Math.PI / 2 - c.h;
      if (m.float) m.root.rotation.z = Math.sin(time * 2 + c.id) * 0.05;
      for (const w of m.wheels) w.rotation.x += (c.v * dt) / 0.4;
      const def = VEHICLES[c.kind];
      this.placeBar(m.bar, c.x, m.float ? 2.6 : 2.9, c.z, 1.8, c.hp / def.hp, c.hp < def.hp);
    }
    for (const [id, m] of this.cars) {
      if (seen.has(id)) continue;
      this.scene.remove(m.root, m.bar.bg, m.bar.fill);
      this.cars.delete(id);
    }
  }

  private syncShots(view: ZombieView) {
    const seen = new Set<number>();
    for (const p of view.shots) {
      seen.add(p.id);
      let m = this.shots.get(p.id);
      if (!m) {
        const big = p.kind === 'fire';
        const geo = p.kind === 'bolt' || p.kind === 'zap' ? new THREE.BoxGeometry(0.08, 0.08, p.kind === 'zap' ? 1.2 : 0.7) : new THREE.SphereGeometry(big ? 0.26 : p.kind === 'pellet' ? 0.07 : 0.1, 8, 6);
        m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: SHOT_COLORS[p.kind] ?? '#fff' }));
        this.scene.add(m);
        this.shots.set(p.id, m);
      }
      m.position.set(p.x, 1.1, p.z);
      m.rotation.y = Math.atan2(p.vx, p.vz);
      if (p.kind === 'fire' && Math.random() < 0.5) this.burst(m.position, ['#ff7a1a', '#ffd95e'], 1, 0.2);
    }
    for (const [id, m] of this.shots) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      this.shots.delete(id);
    }
  }

  private syncDoors(view: ZombieView, me: Survivor | null, time: number) {
    const near = me && !me.car && me.action !== 'down' ? doorInReach(me) : null;
    DOORS.forEach((d, i) => {
      const b = this.map.barricades[i]!;
      const hp = view.doors[i] ?? 0;
      const mat = hp > 0 ? MATERIAL_IDS[view.doorMat[i] ?? 0] ?? 'madera' : '';
      if (mat !== b.shown) {
        for (const [k, l] of Object.entries(b.layers)) l.visible = k === mat;
        b.shown = mat;
      }
      if (mat) b.layers[mat]!.scale.y = 0.45 + 0.55 * Math.min(1, hp / 400);
      const ring = this.map.doorRings[i]!;
      const mat2 = ring.material as THREE.MeshBasicMaterial;
      mat2.opacity = near?.id === d.id ? 0.7 + Math.sin(time * 8) * 0.2 : 0;
    });
    const shop = me && !me.car ? shopAt(me) : null;
    for (const [id, ring] of this.map.shopRings) {
      const on = shop === id;
      (ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.9 : 0.35 + Math.sin(time * 3) * 0.1;
      ring.scale.setScalar(on ? 1.05 + Math.sin(time * 8) * 0.04 : 1);
    }
  }

  /** Draws one animation frame. `view` has your own player already predicted. */
  render(view: ZombieView) {
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    this.map.update(time);
    for (const s of view.survivors) this.pose(this.actor(s.id), s, view, dt, time);
    for (const [id, a] of this.actors) {
      const s = view.survivors.find((x) => x.id === id);
      a.rig.root.visible = a.tag.visible = !!s && s.active;
    }
    this.syncZombies(view, dt, time);
    this.syncCars(view, dt, time);
    this.syncShots(view);
    const me = view.survivors.find((s) => s.id === this.meId) ?? null;
    this.syncDoors(view, me, time);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += 6 * dt;
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
      p.sprite.position.y += dt * 1.2;
      p.sprite.material.opacity = 1 - Math.max(0, (p.life - 0.6) / 0.4);
      if (p.life > 1) {
        this.scene.remove(p.sprite);
        p.sprite.material.map?.dispose();
        p.sprite.material.dispose();
        this.popups.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.life += dt;
      const k = r.life / r.max;
      r.mesh.scale.setScalar(0.2 + k * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (r.life >= r.max) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        this.rings.splice(i, 1);
      }
    }

    // Camera: follows you from above, a bit higher while driving.
    const focus = me ?? view.survivors[0];
    const aspect = this.camera.aspect;
    const wantZoom = me?.car ? 1.35 : 1;
    this.zoom += (wantZoom - this.zoom) * Math.min(1, dt * 2);
    const dist = (aspect < 0.8 ? 32 : aspect < 1.2 ? 28 : 25) * this.zoom;
    const pitch = (58 * Math.PI) / 180;
    if (focus) {
      const want = new THREE.Vector3(focus.x, 0, focus.z + 1);
      if (!this.camReady) this.camTarget.copy(want);
      else this.camTarget.lerp(want, Math.min(1, dt * 6));
      this.camReady = true;
    }
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 0.4;
    this.camera.position.set(this.camTarget.x + (Math.random() - 0.5) * sh, Math.sin(pitch) * dist + (Math.random() - 0.5) * sh, this.camTarget.z + Math.cos(pitch) * dist);
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(this.camTarget.x - 12, 30, this.camTarget.z + 14);
    this.sun.target.position.copy(this.camTarget);

    const shop = me && !me.car && me.action !== 'down' ? shopAt(me) : null;
    this.hud.update(view, this.meId, me ? useHint(view, me) : null, shop);
    this.renderer.render(this.scene, this.camera);
  }

  private pose(a: Actor, s: Survivor, view: ZombieView, dt: number, time: number) {
    const r = a.rig;
    const car = s.car ? view.cars.find((c) => c.id === s.car) : null;
    let diff = s.facing - a.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.facing += diff * Math.min(1, dt * 16);
    r.root.rotation.set(0, Math.PI / 2 - a.facing, 0);
    r.root.position.set(s.x, 0, s.z);

    r.body.position.set(0, 0, 0);
    r.body.rotation.set(0, 0, 0);
    r.head.rotation.set(0, 0, 0);
    r.armL.rotation.set(0, 0, 0.12);
    r.armR.rotation.set(0, 0, -0.12);
    r.legL.rotation.set(0, 0, 0);
    r.legR.rotation.set(0, 0, 0);
    r.barrier.visible = false;
    r.stars.visible = false;
    r.trail.visible = false;
    r.shield.visible = s.shield > 0;
    if (s.shield > 0) r.shield.rotation.y = time * 2;
    if (a.ring) a.ring.visible = !car;

    // The weapon in hand.
    if (a.weaponId !== s.wpn) {
      if (a.weapon) r.armR.remove(a.weapon);
      a.weapon = buildWeapon(WEAPON_IDS[s.wpn] ?? 'bate');
      a.weapon.position.set(0, -0.44, 0.04);
      r.armR.add(a.weapon);
      a.weaponId = s.wpn;
    }
    const wid = WEAPON_IDS[s.wpn] ?? 'bate';
    const w = WEAPONS[wid];
    const aimed = AIMED.has(wid);
    if (a.weapon) a.weapon.visible = !car;

    const t = s.t;
    if (car) {
      const m = this.cars.get(car.id);
      const seat = m?.seat ?? new THREE.Vector3(0, 0.6, 0);
      const lift = m?.float ? 0.7 + Math.sin(time * 3 + car.id) * 0.12 : 0;
      r.root.position.set(car.x + Math.sin(car.h + Math.PI / 2) * seat.z * 0 + Math.cos(car.h) * seat.z, seat.y + lift, car.z + Math.sin(car.h) * seat.z);
      a.facing = car.h;
      r.root.rotation.set(0, Math.PI / 2 - car.h, 0);
      // Seated, hands forward on the reins or the wheel.
      r.legL.rotation.x = r.legR.rotation.x = -1.4;
      r.armL.rotation.x = r.armR.rotation.x = -1.2;
      r.body.position.y = -0.35;
    } else {
      switch (s.action) {
        case 'idle':
          r.body.position.y = Math.sin(time * 3) * 0.02;
          r.armR.rotation.x = aimed ? -0.6 : -0.3;
          break;
        case 'run': {
          const k = Math.sin(t * 16);
          r.legL.rotation.x = k * 0.8;
          r.legR.rotation.x = -k * 0.8;
          r.armL.rotation.x = -k * 0.7;
          r.armR.rotation.x = aimed ? -0.8 : k * 0.7 - 0.2;
          r.body.position.y = Math.abs(Math.cos(t * 16)) * 0.07;
          r.body.rotation.x = 0.12;
          break;
        }
        case 'attack': {
          if (aimed) {
            // Aim and recoil.
            const kick = Math.max(0, 1 - t / Math.max(0.1, w.duration));
            r.armR.rotation.x = -1.55 + kick * 0.35;
            r.armL.rotation.x = wid === 'escopeta' || wid === 'ballesta' ? -1.3 : -0.3;
            r.body.rotation.x = -0.08 * kick;
            if (wid === 'hielo') {
              r.armL.rotation.set(0, 0, 2.3);
              r.armR.rotation.set(0, 0, -2.3);
            }
          } else {
            const hitAt = w.hitAt;
            if (t < hitAt) {
              const k = t / hitAt;
              r.armR.rotation.x = -2.6 * k;
              r.armR.rotation.z = -0.4 * k;
              r.body.rotation.y = 0.4 * k;
            } else {
              const k = Math.min(1, (t - hitAt) / 0.08);
              const back = Math.max(0, (t - hitAt - 0.12) / Math.max(0.05, w.duration - hitAt - 0.12));
              r.armR.rotation.x = -2.6 + 3.9 * k - 1.3 * back;
              r.armR.rotation.z = -0.4 + 0.9 * k - 0.5 * back;
              r.body.rotation.y = 0.4 - 0.9 * k + 0.5 * back;
              r.body.rotation.x = 0.2 * k * (1 - back);
            }
            r.legL.rotation.x = 0.35;
            r.legR.rotation.x = -0.25;
          }
          break;
        }
        case 'saw':
          r.armR.rotation.x = -1.45 + Math.sin(time * 60) * 0.05;
          r.armL.rotation.x = -1.3;
          r.body.rotation.x = 0.1;
          if (a.weapon) a.weapon.rotation.z = Math.sin(time * 70) * 0.04;
          break;
        case 'block':
          r.armL.rotation.set(-1.4, 0, 0.9);
          r.armR.rotation.set(-1.4, 0, -0.9);
          r.body.position.y = -0.06;
          r.barrier.visible = true;
          (r.barrier.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(time * 12) * 0.06;
          break;
        case 'dodge': {
          const k = Math.min(1, t / 0.3);
          r.body.rotation.x = k * Math.PI * 2;
          r.body.position.y = 0.3 - Math.abs(Math.cos(k * Math.PI)) * 0.3;
          r.trail.visible = true;
          (r.trail.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - k);
          break;
        }
        case 'stun':
          r.body.rotation.x = -0.3;
          r.armL.rotation.z = 0.9;
          r.armR.rotation.z = -0.9;
          break;
        case 'down': {
          const k = Math.min(1, t / 0.5);
          r.body.rotation.x = -k * Math.PI * 0.48;
          r.body.position.z = -k * 0.4;
          r.body.position.y = k * 0.25;
          r.armL.rotation.z = 1.4 * k;
          r.armR.rotation.z = -1.4 * k;
          r.stars.visible = true;
          r.stars.position.set(0, 0.5, -1.2);
          r.stars.rotation.y = time * 4;
          break;
        }
      }
    }
    if (s.action !== 'down') r.stars.position.set(0, 1.9, 0);
    a.hurt = Math.max(0, a.hurt - dt);
    if (r.pet) {
      r.pet.position.y = 1.35 + Math.sin(time * 4) * 0.1;
      r.pet.rotation.y = Math.sin(time * 1.5) * 0.4;
    }
    if (r.cape) r.cape.rotation.x = s.action === 'run' ? -0.5 + Math.sin(time * 14) * 0.08 : -0.08 + Math.sin(time * 2) * 0.04;
    if (r.aura) r.aura.rotation.y = time * 1.5;
    a.tag.position.set(r.root.position.x, r.root.position.y + 2.9, r.root.position.z);
    a.tag.material.opacity = s.action === 'down' ? 0.55 : 1;
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

export type { Vehicle };
