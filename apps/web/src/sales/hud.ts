import { ACCESSORIES, BRANCHES, ITEM_NAMES, MODELS, SALES, ZONES, zonesOf, type Item, type Order, type SalesWorld } from '@inbox/shared';

const CSS = `
.sm-root{position:relative;width:100%;height:100%;overflow:hidden;background:#1d2230;border-radius:14px;user-select:none;-webkit-user-select:none;touch-action:none;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;container-type:inline-size}
.sm-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;outline:none}
.sm-hud{position:absolute;inset:0;pointer-events:none;color:#fff}
.sm-pill{background:rgba(12,15,24,.78);border:2px solid rgba(255,255,255,.85);border-radius:14px;box-shadow:0 3px 0 rgba(0,0,0,.25)}
.sm-day{position:absolute;top:10px;left:10px;padding:6px 12px 8px;min-width:190px}
.sm-day b{font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.85}
.sm-score{font-size:30px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.05;color:#ffd95e;text-shadow:0 2px 0 #1b1f2a}
.sm-score small{font-size:12px;font-weight:700;color:#fff;opacity:.8;margin-left:4px;text-shadow:none}
.sm-goal{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;opacity:.9;margin-top:4px}
.sm-bar{position:relative;height:9px;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden;margin-top:3px}
.sm-bar i{position:absolute;inset:0;transform-origin:left;transform:scaleX(0);background:linear-gradient(90deg,#7ddc5a,#3fb27f);transition:transform .2s}
.sm-clock{position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:4px 16px 6px;text-align:center;line-height:1}
.sm-clock b{display:block;font-size:34px;font-weight:900;font-variant-numeric:tabular-nums}
.sm-clock span{font-size:11px;font-weight:700;opacity:.8}
.sm-clock.low b{color:#ff6b6b;animation:sm-pulse .5s infinite alternate}
@keyframes sm-pulse{to{transform:scale(1.08)}}
.sm-anger{position:absolute;top:10px;right:10px;padding:6px 12px;text-align:center}
.sm-anger div{display:flex;gap:4px;justify-content:center;font-size:24px;line-height:1}
.sm-anger div span{filter:grayscale(1);opacity:.3;transition:all .2s}
.sm-anger div span.on{filter:none;opacity:1;transform:scale(1.15)}
.sm-anger small{display:block;font-size:11px;font-weight:700;opacity:.85;margin-top:3px}
.sm-orders{position:absolute;left:10px;right:10px;bottom:10px;display:flex;gap:8px;justify-content:center;flex-wrap:nowrap}
.sm-ticket{position:relative;background:#fbf8f0;color:#1b1f2a;border-radius:10px;padding:6px 9px 8px;min-width:132px;max-width:170px;box-shadow:0 3px 0 rgba(0,0,0,.3);border-top:6px solid var(--b);font-size:12px;line-height:1.25;transition:transform .2s}
.sm-ticket.new{animation:sm-in .35s cubic-bezier(.2,1.6,.4,1)}
@keyframes sm-in{from{transform:translateY(30px) scale(.8);opacity:0}}
.sm-ticket .n{font-weight:900;font-size:13px;display:flex;justify-content:space-between;gap:6px}
.sm-ticket .n em{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border-radius:6px;background:#e3e7ee;color:#3d4554;white-space:nowrap}
.sm-ticket .n em.go{background:#d7f5df;color:#1e7a3e}
.sm-ticket .m{font-weight:800;display:flex;align-items:center;gap:5px;margin-top:2px}
.sm-ticket .m i{width:10px;height:10px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.25)}
.sm-ticket .a{font-weight:700;color:#5b6270}
.sm-ticket .a.on{color:#1b1f2a}
.sm-ticket .br{display:inline-block;margin-top:3px;font-weight:800;font-size:11px;padding:1px 6px;border-radius:6px;background:var(--b);color:#1b1f2a}
.sm-ticket .p{height:6px;border-radius:999px;background:#e3e7ee;margin-top:5px;overflow:hidden}
.sm-ticket .p i{display:block;height:100%;background:#3fb27f;transform-origin:left}
.sm-ticket.warn .p i{background:#f2b705}
.sm-ticket.bad{animation:sm-shake .4s infinite}
.sm-ticket.bad .p i{background:#e5484d}
@keyframes sm-shake{50%{transform:translateX(2px) rotate(1deg)}}
.sm-empty{background:rgba(12,15,24,.6);border-radius:10px;padding:8px 14px;font-size:13px;font-weight:700;opacity:.85}
.sm-me{position:absolute;left:10px;top:118px;padding:6px 10px;font-size:12px;font-weight:700;max-width:230px;line-height:1.35}
.sm-me b{color:#7fd3ff}
.sm-me .held{display:block;margin-top:3px;color:#ffd95e}
.sm-hint{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);padding:6px 14px;font-weight:800;font-size:15px;white-space:nowrap;opacity:0;transition:opacity .15s}
.sm-hint.on{opacity:1}
.sm-hint kbd{font:inherit;font-weight:900;background:#fff;color:#1b1f2a;border-radius:5px;padding:0 6px;margin-right:6px}
.sm-hint.no{color:#ffb3b3;border-color:rgba(255,179,179,.7)}
.sm-recipe{position:absolute;right:10px;top:84px;padding:6px 10px;font-size:11px;font-weight:700;line-height:1.5;max-width:230px}
.sm-recipe ol{margin:0;padding-left:16px}
.sm-recipe b{display:block;font-size:12px;margin-bottom:2px}
.sm-recipe small{display:block;opacity:.7;margin-top:2px}
.sm-recipe{transition:opacity .3s, transform .3s}
.sm-recipe.off{opacity:0;transform:translateX(30px)}
.sm-banner{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;font-weight:900;font-size:clamp(34px,7vw,78px);letter-spacing:.02em;color:#ffd95e;-webkit-text-stroke:3px #1b1f2a;text-shadow:0 6px 0 #1b1f2a;opacity:0;transition:opacity .15s, transform .25s cubic-bezier(.2,1.6,.4,1);white-space:nowrap}
.sm-banner.on{opacity:1;transform:translate(-50%,-50%) scale(1.04)}
.sm-banner small{display:block;font-size:clamp(14px,2.3vw,22px);-webkit-text-stroke:0;text-shadow:0 2px 0 #1b1f2a;color:#fff;letter-spacing:0;margin-top:6px;white-space:normal;max-width:80vw}
.sm-toast{position:absolute;left:50%;top:86px;transform:translateX(-50%);font-weight:900;font-size:20px;color:#ffd95e;text-shadow:0 2px 0 #1b1f2a,0 0 12px rgba(0,0,0,.5);opacity:0;transition:opacity .2s;white-space:nowrap}
.sm-toast.on{opacity:1}
.sm-help{position:absolute;bottom:10px;right:10px;display:none}
.sm-touch{position:absolute;inset:0;pointer-events:none;display:none}
.sm-touch.on{display:block}
.sm-stick{position:absolute;left:16px;bottom:120px;width:110px;height:110px;border-radius:50%;background:rgba(10,12,20,.45);border:2px solid rgba(255,255,255,.6);pointer-events:auto;touch-action:none}
.sm-stick i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.8)}
.sm-act{position:absolute;right:18px;bottom:128px;width:92px;height:92px;border-radius:50%;border:3px solid rgba(255,255,255,.8);background:rgba(255,166,0,.75);color:#1b1f2a;font-weight:900;font-size:15px;pointer-events:auto;touch-action:none;padding:0}
.sm-act.on{background:rgba(255,217,94,.95);transform:scale(.95)}
.sm-touching .sm-recipe{display:none}
.sm-touching .sm-hint{bottom:232px}
@container (max-width:900px){.sm-recipe{display:none}.sm-ticket{min-width:110px;font-size:11px}}
@container (max-width:640px){
.sm-day{min-width:0;padding:4px 8px 6px;top:6px;left:6px}
.sm-day b{font-size:10px}
.sm-score{font-size:20px}
.sm-goal{font-size:10px}
.sm-clock{top:6px;padding:2px 10px 4px}
.sm-clock b{font-size:22px}
.sm-clock span{display:none}
.sm-anger{top:6px;right:6px;padding:4px 8px}
.sm-anger div{font-size:16px}
.sm-anger small{display:none}
.sm-me{top:auto;bottom:96px;left:6px;font-size:10px;max-width:46%}
.sm-orders{gap:4px;left:4px;right:4px;bottom:4px;justify-content:flex-start;overflow:hidden}
.sm-ticket{min-width:0;flex:1 1 0;max-width:none;padding:4px 5px 6px;font-size:10px}
.sm-ticket .a{display:none}
.sm-ticket .n em{display:none}
.sm-hint{font-size:12px;bottom:92px;max-width:94%;overflow:hidden;text-overflow:ellipsis}
.sm-toast{font-size:14px;top:58px}
.sm-touching .sm-me{display:none}
.sm-stick{bottom:96px;width:96px;height:96px}
.sm-act{bottom:104px;width:78px;height:78px}
.sm-touching .sm-hint{bottom:200px}
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

export function itemLabel(item: Item): string {
  if (item.kind !== 'maquina') return `${ITEM_NAMES[item.kind]} #${item.order}`;
  const acc = item.accessory ? ` + ${ACCESSORIES[item.accessory].name.toLowerCase()}` : '';
  return `${MODELS[item.model!].short}${acc} (#${item.order})`;
}

export interface TeamMember {
  id: string;
  name: string;
  me: boolean;
  color: string;
}

/** Score, goal, clock, angry customers, order tickets and the action hint, drawn over the 3D view. */
export class SalesHud {
  readonly root: HTMLElement;
  private dayEl: HTMLElement;
  private scoreEl: HTMLElement;
  private goalEl: HTMLElement;
  private goalBar: HTMLElement;
  private clockEl: HTMLElement;
  private clockBox: HTMLElement;
  private flames: HTMLElement[] = [];
  private orders: HTMLElement;
  private tickets = new Map<number, HTMLElement>();
  private meEl: HTMLElement;
  private hintEl: HTMLElement;
  private bannerEl: HTMLElement;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMe = '';
  private emptyEl: HTMLElement;
  private recipe: HTMLElement;
  private recipeShown: boolean | null = null;
  private recipeForced: boolean | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'h' || e.repeat || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
    this.recipeForced = !(this.recipeForced ?? this.recipeShown ?? true);
  };

  constructor(container: HTMLElement) {
    injectStyles();
    container.classList.add('sm-root');
    this.root = el('div', 'sm-hud', container);
    const day = el('div', 'sm-day sm-pill', this.root);
    this.dayEl = el('b', '', day);
    this.scoreEl = el('div', 'sm-score', day);
    this.goalEl = el('div', 'sm-goal', day);
    this.goalBar = el('i', '', el('div', 'sm-bar', day));
    this.clockBox = el('div', 'sm-clock sm-pill', this.root);
    this.clockEl = el('b', '', this.clockBox);
    el('span', '', this.clockBox).textContent = 'para cumplir la meta';
    const anger = el('div', 'sm-anger sm-pill', this.root);
    const row = el('div', '', anger);
    for (let i = 0; i < SALES.maxStrikes; i++) {
      const f = el('span', '', row);
      f.textContent = '🔥';
      this.flames.push(f);
    }
    el('small', '', anger).textContent = 'Clientes enojados';
    const recipe = el('div', 'sm-recipe sm-pill', this.root);
    this.recipe = recipe;
    recipe.innerHTML =
      '<b>Cómo atender un pedido</b><ol><li>Toma la solicitud en el mesón</li><li>Haz la orden en el escritorio (mantén E)</li><li>Tímbrala en gerencia (mantén E)</li><li>Cámbiala por la máquina en el patio</li><li>Ponle el accesorio si lo pidió</li><li>Entrégala en el andén de su sucursal</li></ol><small>H: mostrar u ocultar</small>';
    this.meEl = el('div', 'sm-me sm-pill', this.root);
    this.hintEl = el('div', 'sm-hint sm-pill', this.root);
    this.orders = el('div', 'sm-orders', this.root);
    this.emptyEl = el('div', 'sm-empty', this.orders);
    this.emptyEl.textContent = 'Esperando clientes…';
    this.bannerEl = el('div', 'sm-banner', this.root);
    this.toastEl = el('div', 'sm-toast', this.root);
    window.addEventListener('keydown', this.onKey);
  }

  private ticket(o: Order): HTMLElement {
    let t = this.tickets.get(o.id);
    if (!t) {
      t = el('div', 'sm-ticket new', this.orders);
      const b = BRANCHES[o.branch];
      t.style.setProperty('--b', b.color);
      const acc = o.accessory ? `+ ${ACCESSORIES[o.accessory].name}` : 'Sin accesorio';
      t.innerHTML = `<div class="n">#${o.id}<em></em></div><div class="m"><i style="background:${MODELS[o.model].color}"></i>${MODELS[o.model].short}</div><div class="a ${o.accessory ? 'on' : ''}">${acc}</div><span class="br">${b.name.replace('Sucursal ', '')}</span><div class="p"><i></i></div>`;
      this.tickets.set(o.id, t);
    }
    return t;
  }

  update(world: SalesWorld, meId: string | null, hint: { text: string; ok: boolean } | null) {
    // The recipe shows during the first seconds; H shows or hides it any time.
    const show = this.recipeForced ?? world.t < 40;
    if (show !== this.recipeShown) {
      this.recipeShown = show;
      this.recipe.classList.toggle('off', !show);
    }
    this.dayEl.textContent = `Jornada ${world.day}`;
    this.scoreEl.innerHTML = `${world.score}<small>puntos</small>`;
    this.goalEl.innerHTML = `<span>Meta del día</span><span>${world.dayScore} / ${world.goal}</span>`;
    this.goalBar.style.transform = `scaleX(${Math.min(1, world.dayScore / Math.max(1, world.goal))})`;
    const secs = Math.max(0, world.clock);
    this.clockEl.textContent = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
    this.clockBox.classList.toggle('low', secs < 20 && !world.over);
    this.flames.forEach((f, i) => f.classList.toggle('on', i < world.strikes));

    // Order tickets, the most urgent first.
    const alive = new Set<number>();
    const sorted = [...world.orders].sort((a, b) => a.left - b.left);
    sorted.forEach((o, i) => {
      alive.add(o.id);
      const t = this.ticket(o);
      t.style.order = String(i);
      const pct = Math.max(0, o.left / o.patience);
      (t.querySelector('.p i') as HTMLElement).style.transform = `scaleX(${pct})`;
      t.classList.toggle('warn', pct < 0.5 && pct >= 0.25);
      t.classList.toggle('bad', pct < 0.25);
      const tag = t.querySelector('.n em') as HTMLElement;
      const txt = o.status === 'waiting' ? 'En el mesón' : 'En curso';
      if (tag.textContent !== txt) {
        tag.textContent = txt;
        tag.classList.toggle('go', o.status === 'taken');
      }
    });
    for (const [id, t] of this.tickets) {
      if (alive.has(id)) continue;
      t.remove();
      this.tickets.delete(id);
    }
    this.emptyEl.style.display = world.orders.length ? 'none' : '';

    const me = world.workers.find((w) => w.id === meId);
    if (me) {
      const zones = zonesOf(me.zones).map((z) => ZONES[z].name);
      const key = `${me.zones}|${me.held ? itemLabel(me.held) : ''}`;
      if (key !== this.lastMe) {
        this.lastMe = key;
        this.meEl.innerHTML = `${zones.length === 4 ? 'Te toca <b>todo el local</b>' : `Tu zona: <b>${zones.join(' y ')}</b>`}<span class="held">${me.held ? `Llevas: ${itemLabel(me.held)}` : 'Manos libres'}</span>`;
      }
    }
    if (hint && !world.over) {
      this.hintEl.innerHTML = '';
      if (hint.ok) {
        const k = document.createElement('kbd');
        k.textContent = this.root.parentElement?.classList.contains('sm-touching') ? 'Acción' : 'E';
        this.hintEl.append(k);
      }
      this.hintEl.append(hint.text);
      this.hintEl.classList.add('on');
      this.hintEl.classList.toggle('no', !hint.ok);
    } else this.hintEl.classList.remove('on');
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

  toast(text: string, color = '#ffd95e', ms = 1400) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.style.color = color;
    this.toastEl.classList.add('on');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.root.remove();
  }
}
