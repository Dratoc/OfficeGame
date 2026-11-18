import {
  DOORS,
  FORTS,
  FORT_IDS,
  MATERIALS,
  MATERIAL_IDS,
  SHOP,
  SURVIVOR,
  WEAPONS,
  WEAPON_IDS,
  ZMAP,
  ZWALLS,
  shopOffer,
  type FortId,
  type ShopItem,
  type Survivor,
  type ZombieView,
} from '@inbox/shared';

const CSS = `
.zz-root{position:relative;width:100%;height:100%;overflow:hidden;background:#1b2418;border-radius:14px;user-select:none;-webkit-user-select:none;touch-action:none;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;container-type:inline-size}
.zz-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;outline:none}
.zz-hud{position:absolute;inset:0;pointer-events:none;color:#fff}
.zz-pill{background:rgba(10,14,12,.78);border:2px solid rgba(255,255,255,.85);border-radius:14px;box-shadow:0 3px 0 rgba(0,0,0,.25)}
.zz-wave{position:absolute;top:10px;left:10px;padding:6px 12px 8px;min-width:170px}
.zz-wave b{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.zz-wave strong{display:block;font-size:30px;font-weight:900;line-height:1.05;color:#9cff6a;text-shadow:0 2px 0 #10140f}
.zz-wave span{display:block;font-size:12px;font-weight:700;opacity:.92;margin-top:2px}
.zz-ff{display:inline-block;margin-top:5px;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;background:#e5484d;color:#fff;border-radius:6px;padding:1px 6px}
.zz-team{position:absolute;top:122px;left:10px;display:flex;flex-direction:column;gap:4px}
.zz-mate{padding:3px 8px 4px;font-size:11px;font-weight:800;min-width:140px;border-radius:10px;border-width:1.5px}
.zz-mate .bar{height:5px;border-radius:9px;background:rgba(255,255,255,.18);overflow:hidden;margin-top:2px}
.zz-mate .bar i{display:block;height:100%;background:#7ddc5a;transform-origin:left;transition:transform .15s}
.zz-mate.down{opacity:.75}
.zz-mate.down .bar i{background:#e5484d}
.zz-map{position:absolute;top:10px;right:10px;width:150px;height:150px;border-radius:14px;padding:0;overflow:hidden}
.zz-map canvas{width:100%;height:100%;display:block}
.zz-me{position:absolute;left:10px;bottom:10px;padding:7px 12px 9px;min-width:220px}
.zz-hp{display:flex;align-items:center;gap:8px;font-weight:900;font-size:13px}
.zz-hp .bar{flex:1;height:12px;border-radius:9px;background:rgba(255,255,255,.18);overflow:hidden}
.zz-hp .bar i{display:block;height:100%;background:linear-gradient(90deg,#7ddc5a,#3fb27f);transform-origin:left;transition:transform .15s}
.zz-hp.low .bar i{background:linear-gradient(90deg,#ff6b6b,#e5484d)}
.zz-money{font-size:24px;font-weight:900;color:#ffd95e;text-shadow:0 2px 0 #10140f;margin-top:3px;font-variant-numeric:tabular-nums}
.zz-money small{font-size:11px;color:#fff;opacity:.8;margin-left:4px;text-shadow:none}
.zz-mats{display:flex;gap:6px;margin-top:3px;font-size:11px;font-weight:800}
.zz-mats span{display:flex;align-items:center;gap:3px;opacity:.35}
.zz-mats span.on{opacity:1}
.zz-mats i{width:10px;height:10px;border-radius:3px;border:1px solid rgba(0,0,0,.4)}
.zz-slots{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:6px;pointer-events:auto}
.zz-slot{position:relative;min-width:74px;padding:5px 8px 6px;border-radius:12px;background:rgba(10,14,12,.78);border:2px solid rgba(255,255,255,.4);color:#fff;font:inherit;font-size:11px;font-weight:800;text-align:center;cursor:pointer;line-height:1.2}
.zz-slot.on{border-color:#ffd95e;background:rgba(60,48,10,.9);transform:translateY(-3px)}
.zz-slot kbd{position:absolute;top:-8px;left:-6px;font:inherit;font-size:10px;background:#fff;color:#1b1f2a;border-radius:6px;padding:0 5px}
.zz-slot em{display:block;font-style:normal;color:#ffd95e;font-size:10px;letter-spacing:1px}
.zz-slot em u{text-decoration:none;color:rgba(255,255,255,.25)}
.zz-hint{position:absolute;left:50%;bottom:86px;transform:translateX(-50%);padding:6px 14px;font-weight:800;font-size:15px;white-space:nowrap;opacity:0;transition:opacity .15s}
.zz-hint.on{opacity:1}
.zz-shop{position:absolute;right:10px;top:170px;bottom:76px;width:290px;padding:8px 10px;display:flex;flex-direction:column;pointer-events:auto;opacity:0;transform:translateX(30px);transition:opacity .2s,transform .2s;visibility:hidden}
.zz-shop.on{opacity:1;transform:none;visibility:visible}
.zz-shop h3{margin:0 0 2px;font-size:16px;font-weight:900}
.zz-shop p{margin:0 0 6px;font-size:11px;opacity:.8}
.zz-shop ul{list-style:none;margin:0;padding:0;overflow:auto;display:flex;flex-direction:column;gap:4px}
.zz-shop li button{width:100%;display:grid;grid-template-columns:22px 1fr auto;gap:6px;align-items:center;text-align:left;font:inherit;color:#fff;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.18);border-radius:10px;padding:5px 8px;cursor:pointer}
.zz-shop li button:hover{background:rgba(255,255,255,.15)}
.zz-shop li button kbd{font:inherit;font-size:11px;font-weight:900;background:#fff;color:#1b1f2a;border-radius:5px;text-align:center}
.zz-shop li button b{display:block;font-size:12.5px}
.zz-shop li button small{display:block;font-size:10.5px;opacity:.75;line-height:1.25}
.zz-shop li button strong{font-size:13px;color:#ffd95e;white-space:nowrap}
.zz-shop li button.no{opacity:.5}
.zz-shop li button.no strong{color:#ff9a9a}
.zz-shop li button .tag{display:inline-block;font-size:9.5px;font-weight:900;text-transform:uppercase;padding:0 5px;border-radius:5px;margin-right:4px;background:rgba(255,255,255,.18)}
.zz-banner{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);text-align:center;font-weight:900;font-size:clamp(34px,7vw,78px);letter-spacing:.02em;color:#9cff6a;-webkit-text-stroke:3px #10140f;text-shadow:0 6px 0 #10140f;opacity:0;transition:opacity .15s,transform .25s cubic-bezier(.2,1.6,.4,1);white-space:nowrap}
.zz-banner.on{opacity:1;transform:translate(-50%,-50%) scale(1.04)}
.zz-banner small{display:block;font-size:clamp(14px,2.3vw,22px);-webkit-text-stroke:0;text-shadow:0 2px 0 #10140f;color:#fff;letter-spacing:0;margin-top:6px;white-space:normal;max-width:80vw}
.zz-toast{position:absolute;left:50%;top:78px;transform:translateX(-50%);font-weight:900;font-size:19px;color:#ffd95e;text-shadow:0 2px 0 #10140f,0 0 12px rgba(0,0,0,.5);opacity:0;transition:opacity .2s;white-space:nowrap}
.zz-toast.on{opacity:1}
.zz-down{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(120,0,0,0) 30%,rgba(120,0,0,.55));opacity:0;transition:opacity .3s;text-align:center}
.zz-down.on{opacity:1}
.zz-down b{font-size:44px;font-weight:900;-webkit-text-stroke:2px #10140f;text-shadow:0 4px 0 #10140f}
.zz-down span{font-size:16px;font-weight:800;text-shadow:0 2px 0 #10140f;margin-top:4px}
.zz-help{position:absolute;right:10px;bottom:10px;font-size:11px;font-weight:700;opacity:.8;padding:4px 10px;max-width:250px;line-height:1.4}
.zz-touch{position:absolute;inset:0;pointer-events:none;display:none}
.zz-touch.on{display:block}
.zz-stick{position:absolute;left:16px;bottom:110px;width:110px;height:110px;border-radius:50%;background:rgba(10,12,20,.45);border:2px solid rgba(255,255,255,.6);pointer-events:auto;touch-action:none}
.zz-stick i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.8)}
.zz-btns{position:absolute;right:14px;bottom:100px;width:190px;height:170px;pointer-events:none}
.zz-btns button{position:absolute;border-radius:50%;border:3px solid rgba(255,255,255,.8);color:#10140f;font-weight:900;font-size:12px;pointer-events:auto;touch-action:none;padding:0}
.zz-btns button.on{transform:scale(.93);filter:brightness(1.2)}
.zz-btns .atk{right:0;bottom:0;width:86px;height:86px;background:rgba(229,72,77,.85);color:#fff;font-size:15px}
.zz-btns .blk{right:96px;bottom:0;width:64px;height:64px;background:rgba(90,176,255,.85)}
.zz-btns .dge{right:12px;bottom:96px;width:64px;height:64px;background:rgba(156,255,106,.85)}
.zz-btns .use{right:96px;bottom:74px;width:58px;height:58px;background:rgba(255,217,94,.9)}
.zz-btns .cyc{right:150px;bottom:130px;width:50px;height:50px;background:rgba(255,255,255,.85)}
.zz-touching .zz-help{display:none}
.zz-touching .zz-me{bottom:auto;top:104px;left:auto;right:10px;min-width:0}
.zz-touching .zz-team{display:none}
.zz-touching .zz-hint{bottom:100px}
@container (max-width:900px){.zz-shop{width:250px}.zz-help{display:none}}
@container (max-width:640px){
.zz-wave{min-width:0;padding:4px 8px 6px;top:6px;left:6px}
.zz-wave strong{font-size:20px}
.zz-wave span{font-size:10px}
.zz-map{width:96px;height:96px;top:6px;right:6px}
.zz-team{display:none}
.zz-me{min-width:0;padding:4px 8px;left:6px;bottom:6px}
.zz-money{font-size:16px}
.zz-mats{display:none}
.zz-slot{min-width:48px;padding:3px 5px;font-size:9px}
.zz-slots{bottom:6px;gap:3px;left:auto;right:6px;transform:none;flex-wrap:wrap;justify-content:flex-end;max-width:52%}
.zz-touching .zz-slots{top:auto;bottom:6px}
.zz-touching .zz-me{top:108px;right:6px}
.zz-shop{top:auto;bottom:6px;left:6px;right:6px;width:auto;height:46%}
.zz-hint{font-size:12px;bottom:60px;max-width:94%;overflow:hidden;text-overflow:ellipsis}
.zz-touching .zz-hint{bottom:280px}
.zz-toast{font-size:14px;top:58px}
.zz-stick{bottom:70px;width:96px;height:96px}
.zz-btns{bottom:60px;transform:scale(.85);transform-origin:bottom right}
}
@container (max-width:420px){
.zz-wave{padding:3px 7px 4px;max-width:58%}
.zz-wave b{display:none}
.zz-wave strong{font-size:16px}
.zz-wave span{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zz-ff{font-size:8px;margin-top:2px}
.zz-map{width:64px;height:64px;border-width:1.5px}
.zz-touching .zz-me{top:76px;right:6px;padding:2px 6px}
.zz-me .zz-hp{font-size:10px}
.zz-money{font-size:13px}
.zz-money small{display:none}
.zz-slot{min-width:0;font-size:8px;padding:2px 4px}
.zz-slots{max-width:46%}
.zz-stick{left:8px;bottom:46px;width:76px;height:76px}
.zz-stick i{width:32px;height:32px;margin:-16px 0 0 -16px}
.zz-btns{right:6px;bottom:40px;transform:scale(.62)}
.zz-touching .zz-hint{bottom:200px}
.zz-banner{font-size:26px;-webkit-text-stroke:2px #10140f}
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

export interface HudPlayer {
  id: string;
  name: string;
  color: string;
  me: boolean;
}

const TAGS: Record<ShopItem['kind'], string> = { weapon: 'Arma', upgrade: 'Mejora', material: 'Puerta', vehicle: 'Vehículo', heal: 'Vida' };

/** Wave, team, money, weapons, shop, minimap and messages, drawn over the 3D view. */
export class ZombieHud {
  readonly root: HTMLElement;
  private waveNum: HTMLElement;
  private waveInfo: HTMLElement;
  private team: HTMLElement;
  private mates = new Map<string, { box: HTMLElement; bar: HTMLElement; label: HTMLElement }>();
  private hpBox: HTMLElement;
  private hpBar: HTMLElement;
  private hpText: HTMLElement;
  private moneyEl: HTMLElement;
  private matsEl: HTMLElement;
  private slots: HTMLElement;
  private slotsKey = '';
  private hintEl: HTMLElement;
  private shopEl: HTMLElement;
  private shopTitle: HTMLElement;
  private shopSub: HTMLElement;
  private shopList: HTMLElement;
  private shopKey = '';
  private shopFort: FortId | null = null;
  private bannerEl: HTMLElement;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private downEl: HTMLElement;
  private downText: HTMLElement;
  private map: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement;
  /** The shop items shown, in the order of their number keys. */
  items: { item: ShopItem; index: number }[] = [];
  onBuy: ((index: number) => void) | null = null;
  onWeapon: ((index: number) => void) | null = null;

  constructor(container: HTMLElement, private players: HudPlayer[]) {
    injectStyles();
    container.classList.add('zz-root');
    this.root = el('div', 'zz-hud', container);
    const wave = el('div', 'zz-wave zz-pill', this.root);
    el('b', '', wave).textContent = 'Zona Zombi';
    this.waveNum = el('strong', '', wave);
    this.waveInfo = el('span', '', wave);
    el('span', 'zz-ff', wave).textContent = 'Fuego amigo activado';
    this.team = el('div', 'zz-team', this.root);

    const mapBox = el('div', 'zz-map zz-pill', this.root);
    this.map = el('canvas', '', mapBox);
    this.map.width = this.map.height = 300;
    this.mapBase = document.createElement('canvas');
    this.mapBase.width = this.mapBase.height = 300;
    this.drawMapBase();

    const me = el('div', 'zz-me zz-pill', this.root);
    this.hpBox = el('div', 'zz-hp', me);
    this.hpText = el('span', '', this.hpBox);
    this.hpBar = el('i', '', el('div', 'bar', this.hpBox));
    this.moneyEl = el('div', 'zz-money', me);
    this.matsEl = el('div', 'zz-mats', me);

    this.slots = el('div', 'zz-slots', this.root);
    this.slots.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-w]');
      if (!b) return;
      e.preventDefault();
      this.onWeapon?.(Number(b.dataset.w));
    });
    this.hintEl = el('div', 'zz-hint zz-pill', this.root);

    this.shopEl = el('div', 'zz-shop zz-pill', this.root);
    this.shopTitle = el('h3', '', this.shopEl);
    this.shopSub = el('p', '', this.shopEl);
    this.shopList = el('ul', '', this.shopEl);
    this.shopList.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (!b) return;
      e.preventDefault();
      this.onBuy?.(Number(b.dataset.i));
    });

    this.bannerEl = el('div', 'zz-banner', this.root);
    this.toastEl = el('div', 'zz-toast', this.root);
    this.downEl = el('div', 'zz-down', this.root);
    el('b', '', this.downEl).textContent = '¡Caíste!';
    this.downText = el('span', '', this.downEl);
    const help = el('div', 'zz-help zz-pill', this.root);
    help.textContent = 'WASD mover · J o clic atacar · K bloquear · Espacio esquivar · E usar · Q cambiar arma · 1-9 comprar en la tienda';
  }

  private toMap(x: number, z: number): [number, number] {
    return [((x + ZMAP.half) / (2 * ZMAP.half)) * 300, ((z + ZMAP.half) / (2 * ZMAP.half)) * 300];
  }

  private drawMapBase() {
    const c = this.mapBase.getContext('2d')!;
    c.fillStyle = '#3f6332';
    c.fillRect(0, 0, 300, 300);
    c.strokeStyle = '#8a7556';
    c.lineWidth = 9;
    c.lineCap = 'round';
    for (const id of FORT_IDS) {
      const p = FORTS[id].pad;
      c.beginPath();
      c.moveTo(...this.toMap(0, 0));
      c.lineTo(...this.toMap(p.x, p.z));
      c.stroke();
    }
    for (const id of FORT_IDS) {
      const f = FORTS[id];
      const [x0, y0] = this.toMap(f.cx - f.hw, f.cz - f.hd);
      const [x1, y1] = this.toMap(f.cx + f.hw, f.cz + f.hd);
      c.fillStyle = f.color;
      c.globalAlpha = 0.55;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.globalAlpha = 1;
    }
    c.fillStyle = '#1b1f2a';
    for (const w of ZWALLS) {
      if (w.kind !== 'wall') continue;
      const [x0, y0] = this.toMap(w.x - w.hw, w.z - w.hd);
      const [x1, y1] = this.toMap(w.x + w.hw, w.z + w.hd);
      c.fillRect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0));
    }
  }

  private drawMap(view: ZombieView, meId: string | null) {
    const c = this.map.getContext('2d')!;
    c.drawImage(this.mapBase, 0, 0);
    for (const d of DOORS) {
      if ((view.doors[d.id] ?? 0) <= 0) continue;
      const [x, y] = this.toMap(d.x, d.z);
      c.fillStyle = '#ffd95e';
      c.fillRect(x - 5, y - 5, 10, 10);
    }
    for (const car of view.cars) {
      const [x, y] = this.toMap(car.x, car.z);
      c.fillStyle = '#ffffff';
      c.fillRect(x - 4, y - 4, 8, 8);
    }
    c.fillStyle = '#ff4d4d';
    for (const zb of view.zombies) {
      const [x, y] = this.toMap(zb.x, zb.z);
      const r = zb.kind === 2 ? 5 : zb.kind === 1 ? 3.2 : 2.2;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    for (const s of view.survivors) {
      const p = this.players.find((x) => x.id === s.id);
      const [x, y] = this.toMap(s.x, s.z);
      c.fillStyle = s.action === 'down' ? '#888' : p?.color ?? '#fff';
      c.strokeStyle = '#000';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, s.id === meId ? 7 : 5.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  setPlayers(players: HudPlayer[]) {
    this.players = players;
  }

  banner(title: string, sub = '', ms = 1800) {
    this.bannerEl.innerHTML = '';
    this.bannerEl.append(title);
    if (sub) el('small', '', this.bannerEl).textContent = sub;
    this.bannerEl.classList.add('on');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = ms > 0 ? setTimeout(() => this.bannerEl.classList.remove('on'), ms) : null;
  }

  toast(text: string, color = '#ffd95e', ms = 1500) {
    this.toastEl.textContent = text;
    this.toastEl.style.color = color;
    this.toastEl.classList.add('on');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  /** The shop the player stands at, if any, for the number keys. */
  get openShop() {
    return this.shopFort;
  }

  update(view: ZombieView, meId: string | null, hint: string | null, shop: FortId | null) {
    const me = view.survivors.find((s) => s.id === meId) ?? null;
    // Wave.
    this.waveNum.textContent = view.wave === 0 ? 'Prepárate' : `Oleada ${view.wave}`;
    this.waveInfo.textContent =
      view.phase === 'fight'
        ? `${view.left} zombis por eliminar · ${view.kills} eliminados`
        : view.phase === 'prep'
          ? `Llegan en ${Math.ceil(view.timer)} s · compra en las tiendas`
          : `Descanso: ${Math.ceil(view.timer)} s · ¡bloquea las puertas!`;

    // Team.
    for (const s of view.survivors) {
      let m = this.mates.get(s.id);
      const info = this.players.find((p) => p.id === s.id);
      if (!m) {
        const box = el('div', 'zz-mate zz-pill', this.team);
        const label = el('span', '', box);
        const bar = el('i', '', el('div', 'bar', box));
        m = { box, bar, label };
        this.mates.set(s.id, m);
      }
      m.box.style.borderColor = info?.color ?? '#fff';
      m.label.textContent = `${info?.me ? 'Tú' : info?.name ?? 'Jugador'} · ${s.kills} 🧟${s.action === 'down' ? ' · caído' : s.car ? ' · manejando' : ''}`;
      m.bar.style.transform = `scaleX(${Math.max(0, s.hp / SURVIVOR.maxHp)})`;
      m.box.classList.toggle('down', s.action === 'down');
      m.box.style.display = s.active ? '' : 'none';
    }

    if (me) {
      this.hpText.textContent = `${Math.ceil(me.hp)}`;
      this.hpBar.style.transform = `scaleX(${Math.max(0, me.hp / SURVIVOR.maxHp)})`;
      this.hpBox.classList.toggle('low', me.hp < 35);
      this.moneyEl.innerHTML = `${me.money}<small>monedas</small>`;
      this.matsEl.innerHTML = MATERIAL_IDS.map((m, i) => `<span class="${(me.mats[i] ?? 0) > 0 ? 'on' : ''}"><i style="background:${MATERIALS[m].color}"></i>${me.mats[i] ?? 0}</span>`).join('');
      const key = `${me.wpn}|${me.wl.join(',')}`;
      if (key !== this.slotsKey) {
        this.slotsKey = key;
        this.slots.innerHTML = '';
        let n = 0;
        WEAPON_IDS.forEach((w, i) => {
          const lvl = me.wl[i] ?? 0;
          if (!lvl) return;
          n++;
          const b = el('button', `zz-slot ${i === me.wpn ? 'on' : ''}`, this.slots);
          b.type = 'button';
          b.dataset.w = String(i);
          b.innerHTML = `<kbd>${n <= 9 ? n : ''}</kbd>${WEAPONS[w].name}<em>${'★'.repeat(lvl)}<u>${'★'.repeat(3 - lvl)}</u></em>`;
        });
      }
      this.downEl.classList.toggle('on', me.action === 'down');
      if (me.action === 'down') {
        const left = Math.max(0, Math.ceil(SURVIVOR.respawnSeconds - me.downT));
        this.downText.textContent = me.revive > 0 ? 'Un compañero te está levantando…' : `Te levantas en ${left} s${view.survivors.length > 1 ? ', o antes si un compañero te ayuda con E' : ''}`;
      }
    }

    // Hint.
    this.hintEl.classList.toggle('on', !!hint && !shop);
    if (hint) this.hintEl.textContent = hint;

    // Shop.
    this.shopFort = shop;
    this.shopEl.classList.toggle('on', !!shop && !!me);
    if (shop && me) {
      const list = SHOP.map((item, index) => ({ item, index })).filter((x) => x.item.fort === shop);
      const offers = list.map(({ item }) => shopOffer(item, me, view));
      const key = `${shop}|${me.money}|${me.wl.join(',')}|${me.hp >= SURVIVOR.maxHp}|${view.cars.length}`;
      this.items = list;
      if (key !== this.shopKey) {
        this.shopKey = key;
        this.shopTitle.textContent = FORTS[shop].shop;
        this.shopSub.textContent = `Tienes ${me.money} monedas. Pulsa el número o toca para comprar.`;
        this.shopList.innerHTML = '';
        list.forEach(({ item, index }, i) => {
          const o = offers[i]!;
          const li = el('li', '', this.shopList);
          const b = el('button', !o.ok || me.money < o.price ? 'no' : '', li);
          b.type = 'button';
          b.dataset.i = String(index);
          const price = !o.ok ? o.why ?? '' : `${o.price}`;
          b.innerHTML = `<kbd>${i < 9 ? i + 1 : i === 9 ? 0 : ''}</kbd><span><b><span class="tag">${TAGS[item.kind]}</span>${item.name}</b><small>${item.description}</small></span><strong>${price}</strong>`;
        });
      }
    } else this.shopKey = '';

    this.drawMap(view, meId);
  }

  dispose() {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.root.remove();
  }
}
