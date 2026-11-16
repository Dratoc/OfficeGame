import * as THREE from 'three';
import { OFFICE, type AvatarConfig, type Fighter, type OfficeEvent } from '@inbox/shared';
import { buildAvatar, type AvatarRig } from './avatar3d';
import { buildOffice, type OfficeScene } from './office3d';
import { Hud } from './hud';
import { sfx } from './sfx';

export interface ArenaPlayer {
  id: string;
  name: string;
  avatar: AvatarConfig;
  me: boolean;
}

export interface ArenaFrame {
  fighters: Fighter[];
  /** Milliseconds left on the clock, or null before it starts. */
  remainingMs: number | null;
  /** Whole seconds before the fight starts, or null. */
  countdown: number | null;
}

const ME_COLOR = '#3ec1ff';
const RIVAL_COLOR = '#ff5d6c';

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
  max: number;
}

interface Popup {
  sprite: THREE.Sprite;
  life: number;
}

interface Actor {
  player: ArenaPlayer;
  rig: AvatarRig;
  tag: THREE.Sprite;
  tagCanvas: HTMLCanvasElement;
  tagHp: number;
  facing: number;
  flash: number;
}

/**
 * Three.js view of an Office Battle. It only draws: whoever drives it (the online match or the
 * offline practice) hands it the fighters each animation frame, plus the events of each tick.
 */
export class OfficeArena {
  readonly hud: Hud;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
  private office: OfficeScene;
  private actors = new Map<string, Actor>();
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shake = 0;
  private clock = new THREE.Clock();
  private resize: ResizeObserver;
  private camTarget = new THREE.Vector3(0, 0.6, 0);

  constructor(private container: HTMLElement, players: ArenaPlayer[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'ob-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#202638');
    this.scene.fog = new THREE.Fog('#202638', 24, 40);
    this.scene.add(new THREE.HemisphereLight('#e6efff', '#6b5a4a', 1.5));
    const sun = new THREE.DirectionalLight('#fff3dd', 2.2);
    sun.position.set(-5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -11;
    sc.right = 11;
    sc.top = 9;
    sc.bottom = -9;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    this.office = buildOffice();
    this.scene.add(this.office.group);

    players.forEach((p) => {
      const rig = buildAvatar(p.avatar, p.me ? ME_COLOR : RIVAL_COLOR);
      rig.root.scale.setScalar(1.22);
      this.scene.add(rig.root);
      const tagCanvas = document.createElement('canvas');
      tagCanvas.width = 256;
      tagCanvas.height = 64;
      const tex = new THREE.CanvasTexture(tagCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      tag.scale.set(1.6, 0.4, 1);
      tag.renderOrder = 10;
      this.scene.add(tag);
      this.actors.set(p.id, { player: p, rig, tag, tagCanvas, tagHp: -1, facing: 0, flash: 0 });
    });

    this.hud = new Hud(container, players, { me: ME_COLOR, rival: RIVAL_COLOR });

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  private fit() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole floor in view on narrow screens.
    this.camera.fov = w / h < 1.2 ? 62 : w / h < 1.5 ? 50 : 42;
    this.camera.updateProjectionMatrix();
  }

  /** Feed the events of a simulation tick: hits, blocks, dodges, knockouts. */
  events(list: OfficeEvent[]) {
    for (const e of list) {
      const target = this.actors.get(e.target);
      const by = this.actors.get(e.by);
      const at = new THREE.Vector3(e.x, 1.0, e.z);
      switch (e.type) {
        case 'hit':
          this.burst(at, ['#ffffff', '#f6f4ef', '#ffd95e'], 14, true);
          this.popup(`-${e.dmg}`, target?.player.me ? '#ff6b6b' : '#ffd95e', at);
          if (target) target.flash = 0.25;
          this.shake = Math.max(this.shake, target?.player.me ? 0.35 : 0.2);
          sfx.hit();
          break;
        case 'block':
          this.burst(at, ['#7fd3ff', '#ffffff'], 10, false);
          this.popup('¡Bloqueo!', '#7fd3ff', at);
          this.shake = Math.max(this.shake, 0.1);
          sfx.block();
          break;
        case 'dodge':
          this.popup('¡Esquivó!', '#b6ff8a', at);
          sfx.whoosh();
          break;
        case 'whiff':
          if (by?.player.me) sfx.swing();
          break;
        case 'ko':
          this.burst(at, ['#ffd95e', '#ff5d6c', '#3ec1ff', '#ffffff'], 40, true);
          this.shake = 0.6;
          sfx.ko();
          break;
      }
    }
  }

  private burst(at: THREE.Vector3, colors: string[], n: number, paper: boolean) {
    for (let i = 0; i < n; i++) {
      // Office papers fly when someone gets hit.
      const geo = paper && i % 2 === 0 ? new THREE.PlaneGeometry(0.16, 0.2) : new THREE.OctahedronGeometry(0.05);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      this.scene.add(m);
      this.particles.push({ mesh: m, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, spin: (Math.random() - 0.5) * 12, life: 0, max: 0.6 + Math.random() * 0.5 });
    }
  }

  private popup(text: string, color: string, at: THREE.Vector3) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 96;
    const c = cv.getContext('2d')!;
    c.font = '900 56px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 10;
    c.strokeStyle = '#1b1f2a';
    c.strokeText(text, 128, 48);
    c.fillStyle = color;
    c.fillText(text, 128, 48);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(1.6, 0.6, 1);
    sprite.position.copy(at).add(new THREE.Vector3(0, 1.0, 0));
    sprite.renderOrder = 11;
    this.scene.add(sprite);
    this.popups.push({ sprite, life: 0 });
  }

  private drawTag(a: Actor, hp: number) {
    if (a.tagHp === hp) return;
    a.tagHp = hp;
    const c = a.tagCanvas.getContext('2d')!;
    c.clearRect(0, 0, 256, 64);
    c.font = '700 26px system-ui, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(15,18,28,0.85)';
    const name = a.player.me ? 'Tú' : a.player.name;
    c.strokeText(name, 128, 26);
    c.fillStyle = '#ffffff';
    c.fillText(name, 128, 26);
    c.fillStyle = 'rgba(15,18,28,0.85)';
    c.fillRect(48, 38, 160, 18);
    const pct = hp / OFFICE.maxHp;
    c.fillStyle = pct > 0.5 ? '#4cd964' : pct > 0.25 ? '#ffcc00' : '#ff3b30';
    c.fillRect(51, 41, 154 * pct, 12);
    (a.tag.material.map as THREE.CanvasTexture).needsUpdate = true;
  }

  /** Draws one animation frame. */
  render(frame: ArenaFrame) {
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    this.office.update(time);

    const mid = new THREE.Vector3();
    let count = 0;
    for (const f of frame.fighters) {
      const a = this.actors.get(f.id);
      if (!a) continue;
      this.pose(a, f, dt, time);
      this.drawTag(a, f.hp);
      a.tag.position.set(f.x, 2.75, f.z);
      mid.x += f.x;
      mid.z += f.z;
      count++;
    }
    if (count) mid.divideScalar(count);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.03, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y <= 0.03) {
        p.vx *= 0.8;
        p.vz *= 0.8;
      }
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * 0.7 * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - Math.max(0, (p.life - p.max * 0.6) / (p.max * 0.4));
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

    // Camera: a fixed angle that leans toward the fight, with a little shake on hits.
    this.camTarget.lerp(new THREE.Vector3(mid.x * 0.35, 0.6, mid.z * 0.3), Math.min(1, dt * 3));
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 0.25;
    this.camera.position.set(this.camTarget.x + (Math.random() - 0.5) * sh, 9 + (Math.random() - 0.5) * sh, this.camTarget.z + 9.2);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y, this.camTarget.z - 0.4);

    this.hud.update(frame);
    this.renderer.render(this.scene, this.camera);
  }

  private pose(a: Actor, f: Fighter, dt: number, time: number) {
    const r = a.rig;
    r.root.position.set(f.x, 0, f.z);
    // Turn smoothly toward where the fighter looks.
    let diff = f.facing - a.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.facing += diff * Math.min(1, dt * 18);
    r.root.rotation.set(0, Math.PI / 2 - a.facing, 0);

    // Reset to the neutral pose, then apply the action.
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

    const t = f.t;
    switch (f.action) {
      case 'idle':
        r.body.position.y = Math.sin(time * 3) * 0.02;
        r.armL.rotation.x = Math.sin(time * 3) * 0.05;
        r.armR.rotation.x = -0.3 + Math.sin(time * 3) * 0.05;
        break;
      case 'run': {
        const s = Math.sin(t * 16);
        r.legL.rotation.x = s * 0.8;
        r.legR.rotation.x = -s * 0.8;
        r.armL.rotation.x = -s * 0.7;
        r.armR.rotation.x = s * 0.7 - 0.2;
        r.body.position.y = Math.abs(Math.cos(t * 16)) * 0.07;
        r.body.rotation.x = 0.12;
        break;
      }
      case 'attack': {
        const { hitAt, duration } = OFFICE.attack;
        if (t < hitAt) {
          // Wind up: weapon behind the head.
          const k = t / hitAt;
          r.armR.rotation.x = -2.6 * k;
          r.armR.rotation.z = -0.4 * k;
          r.body.rotation.y = 0.4 * k;
        } else {
          // Swing down and across, then recover.
          const k = Math.min(1, (t - hitAt) / 0.08);
          const back = Math.max(0, (t - hitAt - 0.12) / (duration - hitAt - 0.12));
          r.armR.rotation.x = -2.6 + 3.9 * k - 1.3 * back;
          r.armR.rotation.z = -0.4 + 0.9 * k - 0.5 * back;
          r.body.rotation.y = 0.4 - 0.9 * k + 0.5 * back;
          r.body.rotation.x = 0.2 * k * (1 - back);
        }
        r.legL.rotation.x = 0.35;
        r.legR.rotation.x = -0.25;
        break;
      }
      case 'block':
        r.armL.rotation.set(-1.4, 0, 0.9);
        r.armR.rotation.set(-1.4, 0, -0.9);
        r.body.position.y = -0.06;
        r.body.rotation.x = -0.05;
        r.barrier.visible = true;
        (r.barrier.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(time * 12) * 0.06;
        break;
      case 'dodge': {
        const k = Math.min(1, t / OFFICE.dodge.duration);
        r.body.position.y = 0.45 * Math.sin(k * Math.PI) * 0.5;
        r.body.rotation.x = k * Math.PI * 2;
        r.body.position.y += 0.3 - Math.abs(Math.cos(k * Math.PI)) * 0.3;
        r.trail.visible = true;
        (r.trail.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - k);
        break;
      }
      case 'stun':
        r.body.rotation.x = -0.35;
        r.head.rotation.z = Math.sin(time * 14) * 0.2;
        r.armL.rotation.z = 0.9;
        r.armR.rotation.z = -0.9;
        r.stars.visible = true;
        r.stars.rotation.y = time * 6;
        break;
      case 'ko': {
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
    if (f.action !== 'ko') r.stars.position.set(0, 1.9, 0);

    // Cape flutters with speed, wings flap, the pet bobs, the aura spins.
    if (r.cape) r.cape.rotation.x = f.action === 'run' || f.action === 'dodge' ? -0.5 + Math.sin(time * 14) * 0.08 : -0.08 + Math.sin(time * 2) * 0.04;
    if (r.wings) {
      const flap = Math.sin(time * (f.action === 'run' ? 10 : 3)) * 0.25;
      r.wings.children.forEach((w) => (w.rotation.y = (w.name === 'wl' ? -1 : 1) * (0.5 + flap)));
    }
    if (r.pet) {
      r.pet.position.y = 1.35 + Math.sin(time * 4) * 0.1;
      r.pet.rotation.y = Math.sin(time * 1.5) * 0.4;
    }
    if (r.aura) r.aura.rotation.y = time * 1.5;
    r.head.traverse((o) => {
      if (o.name === 'flame') o.scale.y = 1 + Math.sin(time * 18 + o.position.x * 10) * 0.2;
    });

    // Flash white when hit.
    a.flash = Math.max(0, a.flash - dt);
    r.body.scale.setScalar(a.flash > 0 ? 1 + a.flash * 0.4 : 1);
  }

  dispose() {
    this.resize.disconnect();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        o.geometry?.dispose();
      }
    });
  }
}
