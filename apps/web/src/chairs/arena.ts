import * as THREE from 'three';
import { CHAIRS, type AvatarConfig, type ChairsEvent, type Kart, type PaperBall } from '@inbox/shared';
import { buildAvatar, type AvatarRig } from '../office/avatar3d';
import { sfx } from '../office/sfx';
import { buildChair, buildRaceScene, type ChairModel, type RaceScene } from './scene3d';
import { RaceHud, type HudFrame, type RacePlayer } from './hud';

export interface RacerInfo {
  id: string;
  name: string;
  avatar: AvatarConfig;
  me: boolean;
}

export interface RaceFrame extends HudFrame {
  balls: PaperBall[];
}

const ME_COLOR = '#3ec1ff';
const RIVAL_COLORS = ['#ff5d6c', '#7ddc5a', '#c58cff'];

interface Actor {
  info: RacerInfo;
  color: string;
  chair: ChairModel;
  rig: AvatarRig;
  root: THREE.Group;
  tag: THREE.Sprite;
  heading: number;
  spin: number;
  throwT: number;
  lastHops: number;
  puff: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
  max: number;
  grow?: number;
}

interface Popup {
  sprite: THREE.Sprite;
  life: number;
}

/**
 * Three.js view of a chair race. It only draws: the online race or the offline practice hands
 * it the chairs each animation frame, plus the events of each tick. The camera chases your chair.
 */
export class ChairsArena {
  readonly hud: RaceHud;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 160);
  private world: RaceScene;
  private sun: THREE.DirectionalLight;
  private actors = new Map<string, Actor>();
  private balls = new Map<number, THREE.Mesh>();
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private clock = new THREE.Clock();
  private resize: ResizeObserver;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camReady = false;
  private shake = 0;
  private ballGeo = new THREE.IcosahedronGeometry(0.24, 0);
  private ballMat = new THREE.MeshLambertMaterial({ color: '#fbf8f0', flatShading: true });
  readonly meId: string | null;

  constructor(private container: HTMLElement, racers: RacerInfo[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'cr-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#202638');
    this.scene.fog = new THREE.Fog('#202638', 45, 95);
    this.scene.add(new THREE.HemisphereLight('#e6efff', '#6b5a4a', 1.6));
    this.sun = new THREE.DirectionalLight('#fff3dd', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.far = 60;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    this.world = buildRaceScene();
    this.scene.add(this.world.group);

    let next = 0;
    const players: RacePlayer[] = [];
    for (const info of racers) {
      const color = info.me ? ME_COLOR : RIVAL_COLORS[next++ % RIVAL_COLORS.length]!;
      players.push({ id: info.id, name: info.name, me: info.me, color });
      const chair = buildChair(color);
      const rig = buildAvatar(info.avatar, color);
      // Sit down: hips on the cushion, legs forward, no ground ring.
      rig.root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry instanceof THREE.RingGeometry) o.visible = false;
      });
      rig.barrier.visible = false;
      rig.shield.visible = false;
      rig.root.position.set(0, 0.07, -0.05);
      rig.root.scale.setScalar(0.92);
      chair.seat.add(rig.root);
      const root = new THREE.Group();
      root.add(chair.root);
      this.scene.add(root);
      const tag = this.nameTag(info.me ? 'Tú' : info.name, color);
      this.scene.add(tag);
      this.actors.set(info.id, { info, color, chair, rig, root, tag, heading: 0, spin: 0, throwT: 9, lastHops: -1, puff: 0 });
    }
    this.meId = racers.find((r) => r.me)?.id ?? null;
    this.hud = new RaceHud(container, players);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  private nameTag(text: string, color: string) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 64;
    const c = cv.getContext('2d')!;
    c.font = '800 30px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(15,18,28,0.85)';
    c.strokeText(text, 128, 32);
    c.fillStyle = color;
    c.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(2, 0.5, 1);
    s.renderOrder = 10;
    return s;
  }

  private fit() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 75 : 60;
    this.camera.updateProjectionMatrix();
  }

  /** Feed the events of a simulation tick. */
  events(list: ChairsEvent[]) {
    for (const e of list) {
      const target = this.actors.get(e.target);
      const by = this.actors.get(e.by);
      const at = new THREE.Vector3(e.x, 1.1, e.z);
      switch (e.type) {
        case 'fire':
          if (by) by.throwT = 0;
          if (e.by === this.meId) sfx.shot();
          break;
        case 'hit':
          this.burst(at, ['#ffffff', '#f6f4ef', '#ffd95e'], 16);
          this.popup('¡Zas!', target?.info.id === this.meId ? '#ff6b6b' : '#ffd95e', at);
          sfx.hit();
          if (e.target === this.meId) {
            this.shake = 0.45;
            this.hud.toast(`¡${by?.info.name ?? 'Alguien'} te dio! Giras sin control`, '#ff8a8a');
          }
          if (e.by === this.meId) {
            this.hud.toast('¡Le diste! Turbo activado', '#ffd95e');
            sfx.go();
          }
          break;
        case 'bump':
          if (e.by === this.meId || e.target === this.meId) {
            sfx.block();
            this.shake = Math.max(this.shake, 0.15);
          }
          break;
        case 'lap':
          if (e.by === this.meId) {
            this.hud.banner(e.n === 2 ? '¡Última vuelta!' : `Vuelta ${(e.n ?? 1) + 1}`, '', 1300);
            sfx.go();
          }
          break;
        case 'finish':
          this.burst(at, ['#ffd95e', '#ff5d6c', '#3ec1ff', '#7ddc5a', '#ffffff'], 40);
          if (e.by === this.meId) sfx.heal();
          else if (by) this.popup(`¡${by.info.name} llegó!`, '#ffd95e', at);
          break;
      }
    }
  }

  private burst(at: THREE.Vector3, colors: string[], n: number) {
    for (let i = 0; i < n; i++) {
      const geo = i % 2 === 0 ? new THREE.PlaneGeometry(0.18, 0.22) : new THREE.OctahedronGeometry(0.06);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      this.scene.add(m);
      this.particles.push({ mesh: m, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, spin: (Math.random() - 0.5) * 12, life: 0, max: 0.6 + Math.random() * 0.5 });
    }
  }

  /** Fire extinguisher foam behind a boosted chair. */
  private foam(x: number, z: number, h: number) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: Math.random() < 0.3 ? '#ffd95e' : '#ffffff', transparent: true, opacity: 0.9 }));
    m.position.set(x - Math.cos(h) * 0.55 + (Math.random() - 0.5) * 0.2, 0.55 + Math.random() * 0.2, z - Math.sin(h) * 0.55 + (Math.random() - 0.5) * 0.2);
    this.scene.add(m);
    this.particles.push({ mesh: m, vx: -Math.cos(h) * 3 + (Math.random() - 0.5), vy: 0.6 + Math.random(), vz: -Math.sin(h) * 3 + (Math.random() - 0.5), spin: 0, life: 0, max: 0.35, grow: 1.2 });
  }

  private popup(text: string, color: string, at: THREE.Vector3) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 96;
    const c = cv.getContext('2d')!;
    let size = 56;
    c.font = `900 ${size}px system-ui, sans-serif`;
    while (size > 24 && c.measureText(text).width > 480) {
      size -= 4;
      c.font = `900 ${size}px system-ui, sans-serif`;
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 10;
    c.strokeStyle = '#1b1f2a';
    c.strokeText(text, 256, 48);
    c.fillStyle = color;
    c.fillText(text, 256, 48);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(3.2, 0.6, 1);
    sprite.position.copy(at).add(new THREE.Vector3(0, 1.2, 0));
    sprite.renderOrder = 11;
    this.scene.add(sprite);
    this.popups.push({ sprite, life: 0 });
  }

  private drawBalls(list: PaperBall[], dt: number) {
    const alive = new Set<number>();
    for (const b of list) {
      alive.add(b.id);
      let m = this.balls.get(b.id);
      if (!m) {
        m = new THREE.Mesh(this.ballGeo, this.ballMat);
        m.castShadow = true;
        this.scene.add(m);
        this.balls.set(b.id, m);
      }
      m.position.set(b.x, 0.95, b.z);
      m.rotation.x += dt * 14;
      m.rotation.y += dt * 9;
    }
    for (const [id, m] of this.balls) {
      if (alive.has(id)) continue;
      this.scene.remove(m);
      this.balls.delete(id);
    }
  }

  /** Draws one animation frame. */
  render(frame: RaceFrame) {
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    this.world.update(time);

    for (const k of frame.karts) {
      const a = this.actors.get(k.id);
      if (a) this.pose(a, k, dt, time);
    }
    this.drawBalls(frame.balls, dt);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      if (!p.grow) p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.03, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      if (p.grow) p.mesh.scale.setScalar(1 + (p.life / p.max) * p.grow);
      p.mesh.rotation.x += p.spin * dt;
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
      p.sprite.material.opacity = 1 - Math.max(0, (p.life - 0.5) / 0.4);
      if (p.life > 0.9) {
        this.scene.remove(p.sprite);
        p.sprite.material.map?.dispose();
        p.sprite.material.dispose();
        this.popups.splice(i, 1);
      }
    }

    // Chase camera behind your chair (or the leader, for spectators).
    const followId = this.meId ?? frame.karts[0]?.id;
    const me = frame.karts.find((k) => k.id === followId);
    const a = followId ? this.actors.get(followId) : undefined;
    if (me && a) {
      const h = a.heading;
      const fx = Math.cos(h);
      const fz = Math.sin(h);
      const back = 5.2 + Math.min(1.6, Math.abs(me.v) * 0.08);
      const want = new THREE.Vector3(me.x - fx * back, 3.1, me.z - fz * back);
      const look = new THREE.Vector3(me.x + fx * 4, 0.9, me.z + fz * 4);
      if (!this.camReady) {
        this.camPos.copy(want);
        this.camLook.copy(look);
        this.camReady = true;
      }
      this.camPos.lerp(want, Math.min(1, dt * 6));
      this.camLook.lerp(look, Math.min(1, dt * 8));
      this.shake = Math.max(0, this.shake - dt);
      const sh = this.shake * 0.3;
      this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
      this.camera.lookAt(this.camLook);
      // A wider view at full turbo.
      const fov = (this.container.clientWidth / Math.max(1, this.container.clientHeight) < 1 ? 75 : 60) + (me.boostT > 0 ? 8 : 0);
      if (Math.abs(this.camera.fov - fov) > 0.1) {
        this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 5);
        this.camera.updateProjectionMatrix();
      }
      this.sun.position.set(me.x - 8, 20, me.z + 10);
      this.sun.target.position.set(me.x, 0, me.z);
    }

    // Labels right next to the camera would cover the screen.
    for (const act of this.actors.values()) act.tag.visible = act.tag.position.distanceTo(this.camera.position) > 4.5;
    for (const p of this.popups) p.sprite.visible = p.sprite.position.distanceTo(this.camera.position) > 4.5;

    this.hud.update(frame);
    this.renderer.render(this.scene, this.camera);
  }

  private pose(a: Actor, k: Kart, dt: number, time: number) {
    let diff = k.h - a.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.heading += Math.abs(diff) > 1.5 ? diff : diff * Math.min(1, dt * 20);
    // Spin around after a hit.
    if (k.spinT > 0) a.spin += dt * 16;
    else a.spin = a.spin % (Math.PI * 2) > 0.05 ? a.spin + Math.min(dt * 16, Math.PI * 2 - (a.spin % (Math.PI * 2))) : 0;
    if (a.lastHops >= 0 && k.hops > a.lastHops) sfx.whoosh();
    a.lastHops = k.hops;
    const hop = k.hopT > 0 ? Math.sin((1 - k.hopT / CHAIRS.hop.seconds) * Math.PI) * 0.7 : 0;
    a.root.position.set(k.x, hop, k.z);
    a.root.rotation.set(0, Math.PI / 2 - a.heading - a.spin, 0);
    // Lean into turns and tilt sideways during a hop.
    const lean = Math.max(-0.25, Math.min(0.25, -diff * 3));
    a.chair.seat.rotation.z = k.hopT > 0 ? -k.hopDir * 0.35 : lean;
    a.chair.base.rotation.y += dt * k.v * 0.6;
    a.tag.position.set(k.x, 2.6 + hop, k.z);

    const r = a.rig;
    r.body.rotation.set(-0.08, 0, 0);
    r.body.position.set(0, 0, 0);
    r.head.rotation.set(0, 0, 0);
    // Legs out in front, kicking along like on a real office chair.
    const kick = Math.abs(k.v) > 0.5 && k.boostT <= 0 ? Math.sin(time * 12) * 0.25 : 0;
    r.legL.rotation.set(-1.25 + kick, 0, 0);
    r.legR.rotation.set(-1.25 - kick, 0, 0);
    r.armL.rotation.set(-0.35, 0, 0.35);
    r.armR.rotation.set(-0.35, 0, -0.35);
    a.throwT += dt;
    if (a.throwT < 0.3) {
      // Throw a paper ball overhand.
      const t = a.throwT / 0.3;
      r.armR.rotation.set(-2.8 + 2.4 * t, 0, -0.2);
    }
    r.stars.visible = k.spinT > 0;
    if (k.spinT > 0) {
      r.stars.rotation.y = time * 6;
      r.head.rotation.z = Math.sin(time * 14) * 0.2;
    }
    r.trail.visible = k.boostT > 0;
    if (k.boostT > 0) {
      (r.trail.material as THREE.MeshBasicMaterial).color.set('#ffe066');
      (r.trail.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(time * 16) * 0.08;
      a.puff += dt;
      while (a.puff > 0.05) {
        a.puff -= 0.05;
        this.foam(k.x, k.z, k.h);
      }
    }
    if (k.done) {
      // Celebrate at the finish.
      r.armL.rotation.set(0, 0, 2.6 + Math.sin(time * 8) * 0.2);
      r.armR.rotation.set(0, 0, -2.6 - Math.sin(time * 8) * 0.2);
    }
    if (r.cape) r.cape.rotation.x = -0.4 - Math.min(0.6, Math.abs(k.v) * 0.05) + Math.sin(time * 14) * 0.06;
    if (r.pet) {
      r.pet.position.y = 1.35 + Math.sin(time * 4) * 0.1;
      r.pet.rotation.y = Math.sin(time * 1.5) * 0.4;
    }
    if (r.wings) {
      const flap = Math.sin(time * 6) * 0.25;
      r.wings.children.forEach((w) => (w.rotation.y = (w.name === 'wl' ? -1 : 1) * (0.5 + flap)));
    }
    if (r.aura) r.aura.rotation.y = time * 1.5;
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
