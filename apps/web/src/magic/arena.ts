import * as THREE from 'three';
import { ARMY, UNIT_STATS, commanderOf, magicMap, type MfEvent, type MfOrder, type MfUnit, type MfWorld } from '@inbox/shared';
import { sfx } from '../office/sfx';
import { buildUnit, RING_GEO, TEAM_LOOKS, type UnitRig } from './models';
import { buildScenery, type Scenery } from './scenery';
import { MagicHud } from './hud';

/**
 * Draws a Magic Frontiers battle: the valley, both armies with their animations, magic bolts in
 * flight, impacts, the aim reticle and the third-person camera behind the commander.
 * It only reads the world; the rules live in @inbox/shared.
 */

interface UnitVis {
  rig: UnitRig;
  ring: THREE.Mesh;
  barBg: THREE.Sprite;
  barFill: THREE.Sprite;
  walk: number;
  hurt: number;
  /** Seconds since this soldier fell, counted by the renderer so the fall plays even after the battle ends. */
  dead: number;
}

interface Particle {
  obj: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  gravity: number;
  grow: number;
  base: number;
}

interface Wave {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size: number;
}

const ORDER_COLORS: Record<MfOrder, string> = { follow: '#8fd8ff', attack: '#ff8a3d', defend: '#ffd84a' };
const CAM = { dist: 15.5, height: 11, look: 3.5 };

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

const glowMats = new Map<string, THREE.SpriteMaterial>();
function glowMat(color: string) {
  let m = glowMats.get(color);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    glowMats.set(color, m);
  }
  return m;
}

/** Plays a sound at most every `gap` ms, so fifty soldiers fighting don't turn into noise. */
const lastSound = new Map<string, number>();
function throttled(key: string, gap: number, play: () => void) {
  const now = performance.now();
  if (now - (lastSound.get(key) ?? 0) < gap) return;
  lastSound.set(key, now);
  play();
}

export class MagicArena {
  readonly hud: MagicHud;
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 600);
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private sun: THREE.DirectionalLight;
  private scenery: Scenery;
  private units = new Map<number, UnitVis>();
  private bolts = new Map<number, THREE.Group>();
  private particles: Particle[] = [];
  private waves: Wave[] = [];
  private reticle: THREE.Group;
  private reticleRune: THREE.Mesh;
  private focusMarker: THREE.Mesh;
  private ringMats: Map<string, THREE.MeshBasicMaterial> = new Map();
  private barMats: { bg: THREE.SpriteMaterial; fill: THREE.SpriteMaterial[] };
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camReady = false;
  private shake = 0;
  private resize: ResizeObserver;
  private clock = 0;
  private lastFrame = performance.now();
  /** Ids the HUD/camera care about. */
  private myTeam = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'mf-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#9fd0f2');
    this.scene.fog = new THREE.Fog('#b8dcf3', 70, 190);
    this.scene.add(new THREE.HemisphereLight('#dff1ff', '#56703c', 1.5));
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -36;
    sc.right = sc.top = 36;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    this.scenery = buildScenery();
    this.scene.add(this.scenery.group);

    // Aim reticle on the ground, with a rune circle that lights up when a volley is ready.
    this.reticle = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false }));
    this.reticleRune = new THREE.Mesh(new THREE.RingGeometry(ARMY.volleySplash - 0.12, ARMY.volleySplash, 6, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_LOOKS[0]!.magic, transparent: true, opacity: 0.7, depthWrite: false }));
    this.reticle.add(ring, dot, this.reticleRune);
    this.reticle.position.y = 0.06;
    this.scene.add(this.reticle);

    this.focusMarker = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#ff8a3d' }));
    this.focusMarker.visible = false;
    this.scene.add(this.focusMarker);

    const bar = (color: string) => new THREE.SpriteMaterial({ color, depthTest: false, transparent: true });
    this.barMats = { bg: bar('#1b1f2a'), fill: [bar('#53c7ff'), bar('#ff5a4d')] };

    this.hud = new MagicHud(container);
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

  private ringMat(team: number, order: MfOrder, selected: boolean) {
    const key = `${team}|${order}|${selected}`;
    let m = this.ringMats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: team === this.myTeam ? ORDER_COLORS[order] : '#ff4d4d', transparent: true, opacity: team !== this.myTeam ? 0.55 : selected ? 0.95 : 0.35, depthWrite: false });
      this.ringMats.set(key, m);
    }
    return m;
  }

  private visFor(u: MfUnit): UnitVis {
    let v = this.units.get(u.id);
    if (v) return v;
    const rig = buildUnit(u.kind, u.team);
    const ring = new THREE.Mesh(RING_GEO, this.ringMat(u.team, 'follow', true));
    ring.position.y = 0.04;
    if (u.kind === 'commander') ring.scale.setScalar(1.6 / 1.28);
    rig.root.add(ring);
    const barBg = new THREE.Sprite(this.barMats.bg);
    barBg.scale.set(0.9, 0.11, 1);
    const barFill = new THREE.Sprite(this.barMats.fill[u.team === this.myTeam ? 0 : 1]);
    barFill.center.set(0, 0.5);
    barFill.scale.set(0.86, 0.07, 1);
    barBg.renderOrder = 10;
    barFill.renderOrder = 11;
    this.scene.add(rig.root, barBg, barFill);
    v = { rig, ring, barBg, barFill, walk: Math.random() * 6, hurt: 0, dead: 0 };
    this.units.set(u.id, v);
    return v;
  }

  /** Sound and effects for what happened in the last simulation steps. */
  events(world: MfWorld, evs: MfEvent[]) {
    const me = commanderOf(world, this.myTeam);
    const near = (id: number, r = 30) => {
      const u = world.units[id - 1];
      return !!u && Math.hypot(u.x - me.x, u.z - me.z) < r;
    };
    for (const e of evs) {
      switch (e.t) {
        case 'hit': {
          const v = this.units.get(e.id);
          if (v) v.hurt = 0.25;
          const u = world.units[e.id - 1];
          if (u) this.sparks(u.x, 1, u.z, '#fff2c4', 4, 3);
          if (near(e.id)) throttled('hit', 70, () => sfx.hit());
          if (u && u.kind === 'commander' && u.team === this.myTeam) this.shake = Math.max(this.shake, 0.25);
          break;
        }
        case 'swing':
          if (near(e.id, 18)) throttled('swing', 90, () => sfx.swing());
          break;
        case 'cast':
          if (near(e.id, 26)) throttled('cast', e.volley ? 40 : 120, () => sfx.shot());
          break;
        case 'boom': {
          const color = TEAM_LOOKS[e.team]!.magic;
          this.sparks(e.x, Math.max(0.3, e.y), e.z, color, e.volley ? 16 : 9, e.volley ? 7 : 5);
          this.wave(e.x, e.z, color, Math.max(1.2, e.r), 0.45);
          const flash = new THREE.Sprite(glowMat(color));
          flash.position.set(e.x, Math.max(0.5, e.y), e.z);
          this.particles.push({ obj: flash, vx: 0, vy: 0, vz: 0, life: 0.25, max: 0.25, gravity: 0, grow: e.volley ? 3.2 : 2.2, base: 0.6 });
          this.scene.add(flash);
          if (Math.hypot(e.x - me.x, e.z - me.z) < 30) throttled('boom', 80, () => sfx.splash());
          break;
        }
        case 'death':
          if (near(e.id, 35)) throttled('death', 120, () => sfx.block());
          break;
        case 'order': {
          if (e.team !== this.myTeam) {
            if (e.order === 'attack') this.hud.toast('¡El enemigo ordena el ataque!');
            break;
          }
          const c = commanderOf(world, e.team);
          if (e.order === 'attack') {
            sfx.go();
            this.wave(c.x, c.z, '#ff8a3d', 9, 0.9);
            this.shake = Math.max(this.shake, 0.35);
            this.hud.warCry(e.selection);
          } else {
            sfx.beep();
            this.wave(c.x, c.z, ORDER_COLORS[e.order], 6, 0.6);
          }
          this.hud.orderGiven(e.order, e.selection);
          break;
        }
        case 'volley':
          if (e.team === this.myTeam) {
            this.wave(e.x, e.z, TEAM_LOOKS[e.team]!.magic, ARMY.volleySplash + 1, 0.7);
            this.hud.toast('¡Descarga mágica!');
          } else this.hud.toast('¡Los magos enemigos lanzan una descarga!');
          break;
        case 'select':
          if (e.team === this.myTeam) sfx.beep();
          break;
        case 'end':
          break;
      }
    }
  }

  private sparks(x: number, y: number, z: number, color: string, n: number, speed: number) {
    if (this.particles.length > 500) return;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(glowMat(color));
      s.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      this.particles.push({ obj: s, vx: Math.cos(a) * speed * (0.4 + Math.random()), vy: speed * (0.4 + up), vz: Math.sin(a) * speed * (0.4 + Math.random()), life: 0.5, max: 0.5, gravity: 14, grow: -0.6, base: 0.35 });
      this.scene.add(s);
    }
  }

  private wave(x: number, z: number, color: string, size: number, life: number) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.position.set(x, 0.08, z);
    this.scene.add(mesh);
    this.waves.push({ mesh, life, max: life, size });
  }

  /**
   * Draws a frame. `prev` holds positions from the previous simulation step and `alpha` how far we
   * are towards the current one, so movement is smooth even though the rules run at 30 steps a second.
   */
  render(world: MfWorld, alpha: number, prev: Map<number, { x: number; z: number }>, view: { yaw: number; aimX: number; aimZ: number }) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.clock += dt;
    const army = world.armies[this.myTeam]!;
    const cmd = commanderOf(world, this.myTeam);
    const pos = (u: MfUnit) => {
      const p = prev.get(u.id);
      return p ? { x: p.x + (u.x - p.x) * alpha, z: p.z + (u.z - p.z) * alpha } : { x: u.x, z: u.z };
    };

    let focus: MfUnit | null = null;
    for (const u of world.units) {
      const v = this.visFor(u);
      const p = pos(u);
      this.animateUnit(u, v, p, dt, army.selection);
      if (u.team === this.myTeam && u.alive && u.order === 'attack' && u.focus > 0 && !focus) {
        const f = world.units[u.focus - 1];
        if (f?.alive) focus = f;
      }
    }
    if (focus) {
      const p = pos(focus);
      this.focusMarker.visible = true;
      this.focusMarker.position.set(p.x, (focus.kind === 'commander' ? 3.2 : 2.5) + Math.sin(this.clock * 6) * 0.15, p.z);
      this.focusMarker.rotation.y += dt * 3;
    } else this.focusMarker.visible = false;

    this.drawBolts(world, dt);
    this.updateParticles(dt);

    // Reticle.
    this.reticle.position.x = view.aimX;
    this.reticle.position.z = view.aimZ;
    this.reticle.rotation.y += dt * 0.8;
    const ready = army.volleyCd <= 0 && world.units.some((u) => u.alive && u.team === this.myTeam && u.kind === 'mage');
    this.reticleRune.visible = ready;
    (this.reticleRune.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.clock * 5) * 0.2;

    // Camera behind and above the commander, looking a bit ahead of him.
    const cp = pos(cmd);
    const fx = Math.sin(view.yaw);
    const fz = Math.cos(view.yaw);
    const wantPos = new THREE.Vector3(cp.x - fx * CAM.dist, CAM.height, cp.z - fz * CAM.dist);
    this.avoidWalls(cp, wantPos);
    const wantLook = new THREE.Vector3(cp.x + fx * CAM.look, 1.2, cp.z + fz * CAM.look);
    if (!this.camReady) {
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
      this.camReady = true;
    }
    const k = 1 - Math.exp(-dt * 9);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, 1 - Math.exp(-dt * 12));
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 0.5;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.camLook);

    this.sun.position.set(cp.x + 30, 55, cp.z - 20);
    this.sun.target.position.set(cp.x, 0, cp.z + 6);
    this.scenery.animate(this.clock);
    this.hud.update(world, this.myTeam);
    this.renderer.render(this.scene, this.camera);
  }

  /** Keeps the camera out of towers and tents: slide it closer to the commander and up. */
  private avoidWalls(cp: { x: number; z: number }, cam: THREE.Vector3) {
    let best = 1;
    for (const o of magicMap().obstacles) {
      if (o.kind !== 'tower' && o.kind !== 'tent') continue;
      const top = o.kind === 'tower' ? 8.2 : 3;
      for (let t = 0.25; t <= 1; t += 0.05) {
        const x = cp.x + (cam.x - cp.x) * t;
        const z = cp.z + (cam.z - cp.z) * t;
        const y = 1.5 + (cam.y - 1.5) * t;
        if (y < top && Math.hypot(x - o.x, z - o.z) < o.r + 1) {
          best = Math.min(best, t - 0.05);
          break;
        }
      }
    }
    if (best < 1) {
      cam.x = cp.x + (cam.x - cp.x) * best;
      cam.z = cp.z + (cam.z - cp.z) * best;
      cam.y = Math.max(cam.y * best, 9.5);
    }
  }

  private animateUnit(u: MfUnit, v: UnitVis, p: { x: number; z: number }, dt: number, selection: string) {
    const { rig } = v;
    rig.root.position.set(p.x, 0, p.z);
    rig.root.rotation.y = u.facing;
    v.ring.material = this.ringMat(u.team, u.order, selection === 'all' || selection === u.kind || u.kind === 'commander');
    v.ring.visible = u.alive;

    if (!u.alive) {
      // Fall backwards, lie there for a while, then sink into the ground.
      v.dead += dt;
      const f = Math.min(1, v.dead / 0.45);
      rig.body.rotation.x = -f * (Math.PI / 2) * 0.95;
      rig.body.position.y = f * 0.25;
      rig.root.position.y = v.dead > 4 ? -(v.dead - 4) * 0.5 : 0;
      rig.root.visible = v.dead < 6.5;
      v.barBg.visible = v.barFill.visible = false;
      return;
    }
    const sp = Math.hypot(u.vx, u.vz);
    const moving = Math.min(1, sp / 3);
    v.walk += dt * (4 + sp * 2.1);
    const sw = Math.sin(v.walk);
    rig.legL.rotation.x = sw * 0.75 * moving;
    rig.legR.rotation.x = -sw * 0.75 * moving;
    rig.body.position.y = Math.abs(Math.cos(v.walk)) * 0.07 * moving;
    rig.armL.rotation.x = -sw * 0.45 * moving;
    rig.armR.rotation.x = sw * 0.45 * moving;
    rig.armL.rotation.z = 0;
    rig.armR.rotation.z = 0;
    rig.body.rotation.x = 0.08 * moving;
    if (u.kind === 'warrior' || u.kind === 'commander') {
      // Shield up and forward.
      rig.armL.rotation.x = -0.9 + (u.order === 'defend' ? -0.35 : 0);
      rig.armL.rotation.z = 0.25;
    }
    // Attack animations.
    const act = u.act;
    const t = u.actT;
    if (act === 'swing' && t < 0.6) {
      const windup = UNIT_STATS[u.kind].melee?.windup ?? 0.3;
      const a = t < windup ? -2.5 * (t / windup) : -2.5 + 3.3 * Math.min(1, (t - windup) / 0.12);
      const back = t > windup + 0.12 ? Math.max(0, 1 - (t - windup - 0.12) / 0.2) : 1;
      rig.armR.rotation.x = a * back;
      rig.body.rotation.y = t < windup ? 0.25 : -0.3 * back;
      rig.body.rotation.x = t > windup ? 0.2 * back : 0;
    } else {
      rig.body.rotation.y = 0;
    }
    if (act === 'cast' && t < 0.7) {
      const s = Math.sin(Math.min(1, t / 0.7) * Math.PI);
      rig.armR.rotation.x = -2.4 * s;
      rig.armL.rotation.x = -1.4 * s;
    }
    if (rig.orb) {
      const glow = act === 'cast' && t < 0.4 ? 1.8 - t * 2 : 1 + Math.sin(this.clock * 4 + u.id) * 0.1;
      rig.orb.scale.setScalar(glow);
    }
    if (rig.cape) rig.cape.rotation.x = 0.12 + moving * 0.5 + Math.sin(this.clock * 7) * 0.05 * moving;
    // Flinch when hit.
    if (v.hurt > 0) {
      v.hurt = Math.max(0, v.hurt - dt);
      rig.body.rotation.x -= v.hurt * 1.4;
      rig.body.position.y += v.hurt * 0.3;
    }
    // Health bar over damaged soldiers.
    const hurtBar = u.hp < u.maxHp;
    v.barBg.visible = v.barFill.visible = hurtBar;
    if (hurtBar) {
      const h = rig.height * (u.kind === 'commander' ? 1.28 : 1) + 0.35;
      const w = u.kind === 'commander' ? 1.4 : 0.9;
      v.barBg.scale.set(w, 0.12, 1);
      v.barBg.position.set(p.x, h, p.z);
      v.barFill.scale.set((w - 0.06) * (u.hp / u.maxHp), 0.075, 1);
      // Anchored at its left edge; offset along the camera's right vector so it lines up.
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      v.barFill.position.set(p.x - right.x * (w - 0.06) / 2, h, p.z - right.z * (w - 0.06) / 2);
    }
  }

  private drawBolts(world: MfWorld, dt: number) {
    const seen = new Set<number>();
    for (const b of world.projectiles) {
      seen.add(b.id);
      let g = this.bolts.get(b.id);
      const color = TEAM_LOOKS[b.team]!.magic;
      if (!g) {
        g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(b.volley ? 0.26 : 0.18, 1), new THREE.MeshBasicMaterial({ color }));
        const glow = new THREE.Sprite(glowMat(color));
        glow.scale.setScalar(b.volley ? 1.5 : 1.1);
        g.add(core, glow);
        this.scene.add(g);
        this.bolts.set(b.id, g);
      }
      // Extrapolate a little within the step so the bolt glides instead of ticking.
      g.position.set(b.x, b.y, b.z);
      g.rotation.y += dt * 9;
      if (this.particles.length < 520 && (this.clock * 60) % 2 < 1) {
        const tr = new THREE.Sprite(glowMat(color));
        tr.position.copy(g.position);
        this.particles.push({ obj: tr, vx: 0, vy: 0.2, vz: 0, life: 0.3, max: 0.3, gravity: 0, grow: -0.5, base: b.volley ? 0.55 : 0.4 });
        this.scene.add(tr);
      }
    }
    for (const [id, g] of this.bolts) {
      if (seen.has(id)) continue;
      this.scene.remove(g);
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
      this.bolts.delete(id);
    }
  }

  private updateParticles(dt: number) {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.obj);
        return false;
      }
      p.vy -= p.gravity * dt;
      p.obj.position.x += p.vx * dt;
      p.obj.position.y = Math.max(0.05, p.obj.position.y + p.vy * dt);
      p.obj.position.z += p.vz * dt;
      const k = 1 - p.life / p.max;
      p.obj.scale.setScalar(Math.max(0.01, p.base + p.grow * k));
      return true;
    });
    this.waves = this.waves.filter((w) => {
      w.life -= dt;
      if (w.life <= 0) {
        this.scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        (w.mesh.material as THREE.Material).dispose();
        return false;
      }
      const k = 1 - w.life / w.max;
      w.mesh.scale.setScalar(0.3 + k * w.size);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      return true;
    });
  }

  /** Ground point under a screen position (for aiming without pointer lock). */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? { x: hit.x, z: hit.z } : null;
  }

  dispose() {
    this.resize.disconnect();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
