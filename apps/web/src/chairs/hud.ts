import { CHAIRS, CHAIRS_LAPS, TRACK, standings, type Kart } from '@inbox/shared';

const CSS = `
.cr-root{position:relative;width:100%;height:100%;overflow:hidden;background:#202638;border-radius:14px;user-select:none;-webkit-user-select:none;touch-action:none;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.cr-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;outline:none}
.cr-hud{position:absolute;inset:0;pointer-events:none;color:#fff}
.cr-pill{background:rgba(10,12,20,.72);border:2px solid rgba(255,255,255,.85);border-radius:14px;box-shadow:0 3px 0 rgba(0,0,0,.25)}
.cr-place{position:absolute;top:12px;left:12px;padding:4px 14px 6px;text-align:center;line-height:1}
.cr-place b{display:block;font-size:44px;font-weight:900;color:#ffd95e;text-shadow:0 3px 0 #1b1f2a}
.cr-place b sup{font-size:20px}
.cr-place span{font-size:12px;font-weight:700;opacity:.85}
.cr-lap{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;padding:6px 14px;font-weight:900;font-size:20px;font-variant-numeric:tabular-nums}
.cr-lap small{font-size:12px;font-weight:700;opacity:.8}
.cr-lap .t.low{color:#ff6b6b}
.cr-board{position:absolute;top:12px;right:12px;padding:6px 8px;display:flex;flex-direction:column;gap:3px;min-width:150px}
.cr-row{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;white-space:nowrap}
.cr-row i{width:10px;height:10px;border-radius:50%;flex:none}
.cr-row em{font-style:normal;opacity:.7;width:18px;text-align:right}
.cr-row span{overflow:hidden;text-overflow:ellipsis;max-width:110px}
.cr-row.me span{color:#7fd3ff}
.cr-row.done span::after{content:' 🏁'}
.cr-map{position:absolute;right:12px;bottom:12px;width:180px;height:112px;padding:4px;background:rgba(10,12,20,.88)}
.cr-map canvas{width:100%;height:100%;display:block}
.cr-meters{position:absolute;left:12px;bottom:12px;padding:8px 12px;display:flex;flex-direction:column;gap:6px;min-width:190px}
.cr-speed{font-weight:900;font-size:26px;font-variant-numeric:tabular-nums;line-height:1}
.cr-speed small{font-size:12px;font-weight:700;opacity:.8;margin-left:4px}
.cr-bar{position:relative;height:10px;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden}
.cr-bar i{position:absolute;inset:0;transform-origin:left;transform:scaleX(0)}
.cr-bar.boost i{background:linear-gradient(90deg,#ffd95e,#ff8a3d)}
.cr-bar.hop i{background:#7fd3ff}
.cr-lbl{display:flex;justify-content:space-between;font-size:11px;font-weight:700;opacity:.85}
.cr-boost-on .cr-speed{color:#ffd95e}
.cr-banner{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;font-weight:900;font-size:clamp(36px,8vw,84px);letter-spacing:.02em;color:#ffd95e;-webkit-text-stroke:3px #1b1f2a;text-shadow:0 6px 0 #1b1f2a;opacity:0;transition:opacity .15s, transform .25s cubic-bezier(.2,1.6,.4,1);white-space:nowrap}
.cr-banner.on{opacity:1;transform:translate(-50%,-50%) scale(1.04)}
.cr-banner small{display:block;font-size:clamp(14px,2.4vw,22px);-webkit-text-stroke:0;text-shadow:0 2px 0 #1b1f2a;color:#fff;letter-spacing:0;margin-top:6px}
.cr-toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-weight:900;font-size:22px;color:#ffd95e;text-shadow:0 2px 0 #1b1f2a,0 0 12px rgba(0,0,0,.5);opacity:0;transition:opacity .2s}
.cr-toast.on{opacity:1}
.cr-help{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;flex-wrap:wrap;justify-content:center;font-size:12px;max-width:calc(100% - 440px)}
.cr-help span{background:rgba(10,12,20,.65);border-radius:8px;padding:4px 8px;white-space:nowrap}
.cr-help kbd{font:inherit;font-weight:800;background:#fff;color:#1b1f2a;border-radius:4px;padding:0 5px;margin-right:4px}
.cr-touch{position:absolute;inset:0;pointer-events:none;display:none}
.cr-touch.on{display:block}
.cr-touch .cr-steer{position:absolute;left:14px;bottom:14px;display:flex;gap:10px;pointer-events:auto}
.cr-touch .cr-acts{position:absolute;right:14px;bottom:14px;display:grid;grid-template-columns:repeat(2,64px);gap:10px;pointer-events:auto}
.cr-touch button{width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.7);background:rgba(10,12,20,.55);color:#fff;font-size:12px;font-weight:800;touch-action:none;padding:0}
.cr-touch .cr-steer button{width:76px;height:76px;font-size:24px}
.cr-touch button.fire{background:rgba(255,93,108,.7)}
.cr-touch button.brake{background:rgba(255,255,255,.18)}
.cr-touch button.on{background:rgba(255,255,255,.45)}
.cr-touching .cr-meters{bottom:auto;top:100px}
.cr-touching .cr-map,.cr-touching .cr-help{display:none}
.cr-root{container-type:inline-size}
@container (max-width:760px){.cr-help{display:none}.cr-row span{max-width:70px}.cr-map{width:120px;height:76px}}
@container (max-width:560px){
.cr-board,.cr-map{display:none}
.cr-place{top:8px;left:8px;padding:2px 8px 4px}
.cr-place b{font-size:24px}
.cr-place b sup{font-size:12px}
.cr-place span{display:none}
.cr-lap{top:8px;font-size:12px;padding:4px 8px;gap:5px}
.cr-meters,.cr-touching .cr-meters{top:8px;bottom:auto;left:auto;right:8px;min-width:0;padding:4px 8px;gap:3px}
.cr-meters .cr-lbl,.cr-meters .cr-bar.hop{display:none}
.cr-meters .cr-bar{width:56px;height:6px}
.cr-speed{font-size:15px}
.cr-speed small{font-size:9px}
.cr-toast{font-size:14px;top:56px;width:90%;text-align:center}
.cr-banner{font-size:34px}
.cr-touch .cr-steer{left:8px;bottom:8px;gap:6px}
.cr-touch .cr-acts{right:8px;bottom:8px;grid-template-columns:repeat(2,50px);gap:6px}
.cr-touch button{width:50px;height:50px;font-size:10px}
.cr-touch .cr-steer button{width:58px;height:58px;font-size:20px}
}
`;

let styled = false;
function injectStyles() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

export interface RacePlayer {
  id: string;
  name: string;
  me: boolean;
  color: string;
}

export interface HudFrame {
  karts: Kart[];
  /** Milliseconds left: of the race, or of the closing time once someone finished. */
  remainingMs: number | null;
  closing: boolean;
}

/** Place, lap, clock, standings, minimap, speed and turbo, drawn as HTML over the 3D canvas. */
export class RaceHud {
  readonly root: HTMLElement;
  private placeEl: HTMLElement;
  private lapEl: HTMLElement;
  private timeEl: HTMLElement;
  private board: HTMLElement;
  private rows = new Map<string, HTMLElement>();
  private map: HTMLCanvasElement;
  private mapBase: ImageData | null = null;
  private speedEl: HTMLElement;
  private boostBar: HTMLElement;
  private hopBar: HTMLElement;
  private meters: HTMLElement;
  private bannerEl: HTMLElement;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOrder = '';

  constructor(container: HTMLElement, private players: RacePlayer[]) {
    injectStyles();
    container.classList.add('cr-root');
    this.root = el('div', 'cr-hud', container);
    const place = el('div', 'cr-place cr-pill', this.root);
    this.placeEl = el('b', '', place);
    el('span', '', place).textContent = 'Posición';
    const lap = el('div', 'cr-lap cr-pill', this.root);
    this.lapEl = el('span', '', lap);
    this.timeEl = el('span', 't', lap);
    this.board = el('div', 'cr-board cr-pill', this.root);
    for (const p of players) {
      const row = el('div', `cr-row ${p.me ? 'me' : ''}`, this.board);
      el('em', '', row);
      el('i', '', row).style.background = p.color;
      el('span', '', row).textContent = p.me ? `${p.name} (tú)` : p.name;
      this.rows.set(p.id, row);
    }
    this.meters = el('div', 'cr-meters cr-pill', this.root);
    this.speedEl = el('div', 'cr-speed', this.meters);
    const lb1 = el('div', 'cr-lbl', this.meters);
    lb1.innerHTML = '<span>Turbo</span><span>acierta para cargarlo</span>';
    this.boostBar = el('i', '', el('div', 'cr-bar boost', this.meters));
    const lb2 = el('div', 'cr-lbl', this.meters);
    lb2.innerHTML = '<span>Salto</span><span></span>';
    this.hopBar = el('i', '', el('div', 'cr-bar hop', this.meters));
    const mapBox = el('div', 'cr-map cr-pill', this.root);
    this.map = el('canvas', '', mapBox);
    this.map.width = 360;
    this.map.height = 224;
    this.bannerEl = el('div', 'cr-banner', this.root);
    this.toastEl = el('div', 'cr-toast', this.root);
    const help = el('div', 'cr-help', this.root);
    help.innerHTML =
      '<span><kbd>W</kbd><kbd>S</kbd>acelerar / frenar</span><span><kbd>A</kbd><kbd>D</kbd>girar</span><span><kbd>Espacio</kbd>o clic: lanzar hacia adelante</span><span><kbd>Q</kbd><kbd>E</kbd>saltar a un lado</span>';
  }

  private toMap(x: number, z: number) {
    // Track bounds, with a margin.
    const minX = -35;
    const maxX = 30;
    const minZ = -17;
    const maxZ = 18;
    const k = Math.min(this.map.width / (maxX - minX), this.map.height / (maxZ - minZ));
    const ox = (this.map.width - (maxX - minX) * k) / 2;
    const oz = (this.map.height - (maxZ - minZ) * k) / 2;
    return { x: ox + (x - minX) * k, y: oz + (z - minZ) * k };
  }

  private drawMap(karts: Kart[]) {
    const c = this.map.getContext('2d')!;
    if (!this.mapBase) {
      c.clearRect(0, 0, this.map.width, this.map.height);
      c.lineJoin = 'round';
      c.beginPath();
      TRACK.samples.forEach((p, i) => {
        const m = this.toMap(p.x, p.z);
        if (i) c.lineTo(m.x, m.y);
        else c.moveTo(m.x, m.y);
      });
      c.closePath();
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 14;
      c.stroke();
      c.strokeStyle = '#3d4554';
      c.lineWidth = 9;
      c.stroke();
      const s = this.toMap(TRACK.samples[0]!.x, TRACK.samples[0]!.z);
      c.fillStyle = '#ffd95e';
      c.fillRect(s.x - 2, s.y - 9, 4, 18);
      this.mapBase = c.getImageData(0, 0, this.map.width, this.map.height);
    } else {
      c.putImageData(this.mapBase, 0, 0);
    }
    // Me on top.
    const sorted = [...karts].sort((a) => (this.players.find((p) => p.id === a.id)?.me ? 1 : -1));
    for (const k of sorted) {
      const p = this.players.find((x) => x.id === k.id);
      const m = this.toMap(k.x, k.z);
      c.beginPath();
      c.arc(m.x, m.y, p?.me ? 8 : 6, 0, Math.PI * 2);
      c.fillStyle = p?.color ?? '#fff';
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = '#1b1f2a';
      c.stroke();
    }
  }

  update(frame: HudFrame) {
    const me = frame.karts.find((k) => this.players.find((p) => p.id === k.id)?.me);
    const order = standings(frame.karts);
    if (me) {
      const place = order.indexOf(me.id) + 1;
      this.placeEl.innerHTML = `${place}<sup>.º</sup><small style="font-size:16px;opacity:.7">/${frame.karts.length}</small>`;
      this.lapEl.innerHTML = me.done ? '¡Meta!' : `Vuelta ${Math.min(CHAIRS_LAPS, me.lap + 1)}<small>/${CHAIRS_LAPS}</small>`;
      const speed = Math.abs(me.v) * 3.6;
      this.speedEl.innerHTML = `${Math.round(speed)}<small>km/h</small>`;
      this.boostBar.style.transform = `scaleX(${Math.min(1, me.boostT / CHAIRS.boost.seconds)})`;
      this.hopBar.style.transform = `scaleX(${1 - Math.min(1, me.hopCd / CHAIRS.hop.cooldown)})`;
      this.meters.classList.toggle('cr-boost-on', me.boostT > 0);
    }
    const key = order.join(',') + frame.karts.map((k) => k.done).join(',');
    if (key !== this.lastOrder) {
      this.lastOrder = key;
      order.forEach((id, i) => {
        const row = this.rows.get(id);
        if (!row) return;
        row.style.order = String(i);
        row.querySelector('em')!.textContent = `${i + 1}.`;
        row.classList.toggle('done', !!frame.karts.find((k) => k.id === id)?.done);
      });
    }
    if (frame.remainingMs !== null) {
      const secs = Math.max(0, frame.remainingMs / 1000);
      this.timeEl.textContent = frame.closing ? `Cierre ${Math.ceil(secs)} s` : `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
      this.timeEl.classList.toggle('low', frame.closing || secs < 10);
    }
    this.drawMap(frame.karts);
  }

  /** Big centered message. Stays until replaced when ms is 0. */
  banner(text: string, sub = '', ms = 1200) {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerEl.innerHTML = '';
    this.bannerEl.append(text);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      this.bannerEl.append(s);
    }
    this.bannerEl.classList.add('on');
    if (ms > 0) this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('on'), ms);
  }

  hideBanner() {
    this.bannerEl.classList.remove('on');
  }

  /** A short line under the top bar, for turbo and hits. */
  toast(text: string, color = '#ffd95e') {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.style.color = color;
    this.toastEl.classList.add('on');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), 1100);
  }

  dispose() {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.root.remove();
  }
}
