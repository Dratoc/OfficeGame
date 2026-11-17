import { OFFICE, POWERS, type PowerId } from '@inbox/shared';
import type { ArenaFrame, ArenaPlayer } from './arena';

const CSS = `
.ob-root{position:relative;width:100%;height:100%;overflow:hidden;background:#202638;border-radius:14px;user-select:none;-webkit-user-select:none;touch-action:none;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.ob-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;outline:none}
.ob-hud{position:absolute;inset:0;pointer-events:none;color:#fff}
.ob-top{position:absolute;top:12px;left:12px;right:12px;display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:start}
.ob-side{display:flex;flex-direction:column;gap:4px;min-width:0}
.ob-side.right{align-items:flex-end;text-align:right}
.ob-name{font-weight:800;font-size:15px;text-shadow:0 2px 0 rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ob-name small{font-weight:600;opacity:.75;margin-left:6px;font-size:12px}
.ob-bar{position:relative;width:100%;max-width:340px;height:20px;border-radius:999px;background:rgba(10,12,20,.7);border:2px solid rgba(255,255,255,.85);overflow:hidden;box-shadow:0 3px 0 rgba(0,0,0,.25)}
.ob-bar i{position:absolute;inset:0;transform-origin:left;transition:transform .12s ease-out}
.ob-bar i.lag{background:#fff3;transition:transform .6s ease-in .25s}
.ob-side.right .ob-bar i{transform-origin:right}
.ob-bar b{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;font-weight:800;text-shadow:0 1px 0 rgba(0,0,0,.6)}
.ob-timer{min-width:64px;padding:6px 12px;border-radius:12px;background:rgba(10,12,20,.72);border:2px solid rgba(255,255,255,.85);text-align:center;font-weight:900;font-size:22px;font-variant-numeric:tabular-nums}
.ob-timer.low{color:#ff6b6b}
.ob-banner{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;font-weight:900;font-size:clamp(36px,8vw,84px);letter-spacing:.02em;color:#ffd95e;-webkit-text-stroke:3px #1b1f2a;text-shadow:0 6px 0 #1b1f2a;opacity:0;transition:opacity .15s, transform .25s cubic-bezier(.2,1.6,.4,1)}
.ob-banner.on{opacity:1;transform:translate(-50%,-50%) scale(1.04)}
.ob-banner small{display:block;font-size:clamp(14px,2.4vw,22px);-webkit-text-stroke:0;text-shadow:0 2px 0 #1b1f2a;color:#fff;letter-spacing:0;margin-top:6px}
.ob-help{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:8px;flex-wrap:wrap;justify-content:center;font-size:12px;width:calc(100% - 24px)}
.ob-help span{background:rgba(10,12,20,.65);border-radius:8px;padding:4px 8px;white-space:nowrap}
.ob-help kbd{font:inherit;font-weight:800;background:#fff;color:#1b1f2a;border-radius:4px;padding:0 5px;margin-right:4px}
.ob-cd{display:block;font-size:12px;opacity:.85;margin-top:2px}
.ob-touch{position:absolute;inset:0;pointer-events:none;display:none}
.ob-touch.on{display:block}
.ob-stick{position:absolute;left:18px;bottom:18px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.35);pointer-events:auto}
.ob-stick i{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px;border-radius:50%;background:rgba(255,255,255,.55)}
.ob-btns{position:absolute;right:16px;bottom:16px;display:grid;grid-template-columns:repeat(2,64px);gap:10px;pointer-events:auto}
.ob-btns button{width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.7);background:rgba(10,12,20,.55);color:#fff;font-size:12px;font-weight:800;touch-action:none}
.ob-btns button.atk{grid-column:2;grid-row:1 / span 2;width:76px;height:76px;align-self:center;background:rgba(255,93,108,.6)}
.ob-btns button.on{background:rgba(255,255,255,.45)}
@media (max-width:640px){.ob-help{display:none}.ob-cd{display:none}.ob-name{font-size:13px}.ob-bar{height:16px}.ob-timer{font-size:18px;min-width:48px;padding:4px 8px}.ob-stick{width:96px;height:96px;left:10px;bottom:10px}.ob-stick i{width:42px;height:42px;margin:-21px}.ob-btns{right:10px;bottom:10px;grid-template-columns:repeat(2,52px);gap:8px}.ob-btns button{width:52px;height:52px;font-size:10px}.ob-btns button.atk{width:62px;height:62px}}

.ob-rivals{display:flex;flex-direction:column;gap:6px;align-items:flex-end;min-width:0}
.ob-rivals .ob-side{width:100%;align-items:flex-end}
.ob-rivals.many .ob-bar{height:14px;max-width:220px}
.ob-rivals.many .ob-bar b{font-size:10px}
.ob-rivals.many .ob-name{font-size:13px}
.ob-side.out{opacity:.45}
.ob-side.out .ob-name::after{content:' · fuera';font-weight:600}
.ob-powers{position:absolute;bottom:44px;left:50%;transform:translateX(-50%);display:flex;gap:10px;pointer-events:auto}
.ob-power{position:relative;width:64px;height:64px;border-radius:14px;border:2px solid rgba(255,255,255,.85);background:rgba(10,12,20,.72);color:#fff;display:grid;place-items:center;padding:0;cursor:pointer;overflow:hidden;font:inherit;touch-action:none}
.ob-power .ico{font-size:24px;line-height:1}
.ob-power .key{position:absolute;top:2px;left:5px;font-size:11px;font-weight:900;opacity:.9}
.ob-power .nm{position:absolute;bottom:2px;left:2px;right:2px;font-size:9px;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ob-power .cd{position:absolute;inset:0;background:conic-gradient(rgba(10,12,20,.78) var(--p,0%), transparent 0);display:grid;place-items:center;font-weight:900;font-size:18px}
.ob-power.ready{box-shadow:0 0 0 2px #ffd95e inset}
.ob-spect{position:absolute;left:50%;top:64%;transform:translateX(-50%);background:rgba(10,12,20,.7);padding:6px 12px;border-radius:10px;font-weight:700;font-size:14px;display:none}
.ob-spect.on{display:block}
@media (max-width:640px){.ob-powers{bottom:12px;gap:6px}.ob-power{width:48px;height:48px;border-radius:10px}.ob-power .ico{font-size:18px}.ob-power .nm{display:none}.ob-rivals.many .ob-bar{max-width:120px}}
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

interface Side {
  id: string;
  el: HTMLElement;
  fill: HTMLElement;
  lag: HTMLElement;
  text: HTMLElement;
  cd: HTMLElement | null;
  hp: number;
}

/** A symbol per power, drawn on its button. */
const POWER_ICON: Record<PowerId, string> = {
  stapler: '📎',
  coffee: '☕',
  folders: '🗂️',
  sprint: '⚡',
  meeting: '📣',
  bandage: '🩹',
};

const SHORT: Record<PowerId, string> = {
  stapler: 'Grapas',
  coffee: 'Café',
  folders: 'Carpetas',
  sprint: 'Viernes',
  meeting: 'Reunión',
  bandage: 'Curita',
};

/** Health bars, clock, power buttons and big messages, drawn as HTML over the 3D canvas. */
export class Hud {
  readonly root: HTMLElement;
  private sides: Side[] = [];
  private timer: HTMLElement;
  private bannerEl: HTMLElement;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private meId: string | null;
  private powersEl: HTMLElement;
  private slots: { el: HTMLButtonElement; cd: HTMLElement; id: PowerId | null }[] = [];
  private spect: HTMLElement;

  constructor(container: HTMLElement, players: ArenaPlayer[]) {
    injectStyles();
    container.classList.add('ob-root');
    this.root = el('div', 'ob-hud', container);
    const top = el('div', 'ob-top', this.root);
    const me = players.find((p) => p.me) ?? players[0]!;
    const rivals = players.filter((p) => p !== me);
    this.meId = me.id;
    const mkSide = (p: ArenaPlayer, parent: HTMLElement, right: boolean): Side => {
      const side = el('div', `ob-side ${right ? 'right' : ''}`, parent);
      const name = el('div', 'ob-name', side);
      name.textContent = p.name;
      if (p.me) {
        const tag = el('small', '', name);
        tag.textContent = '(tú)';
      }
      const bar = el('div', 'ob-bar', side);
      const lag = el('i', 'lag', bar);
      const fill = el('i', '', bar);
      fill.style.background = `linear-gradient(180deg, ${p.color ?? '#3ec1ff'}, color-mix(in srgb, ${p.color ?? '#3ec1ff'} 60%, #000))`;
      const text = el('b', '', bar);
      text.textContent = `${OFFICE.maxHp}`;
      const cd = p.me ? el('span', 'ob-cd', side) : null;
      return { id: p.id, el: side, fill, lag, text, cd, hp: -1 };
    };
    this.sides.push(mkSide(me, top, false));
    this.timer = el('div', 'ob-timer', top);
    this.timer.textContent = '—';
    const list = el('div', `ob-rivals ${rivals.length > 1 ? 'many' : ''}`, top);
    for (const r of rivals) this.sides.push(mkSide(r, list, true));

    this.bannerEl = el('div', 'ob-banner', this.root);
    this.spect = el('div', 'ob-spect', this.root);
    this.spect.textContent = 'Quedaste fuera. Mira cómo termina la pelea.';
    this.powersEl = el('div', 'ob-powers', this.root);
    for (let i = 0; i < 2; i++) {
      const b = el('button', 'ob-power', this.powersEl);
      b.type = 'button';
      b.dataset.slot = String(i);
      b.hidden = true;
      const cd = el('span', 'cd', b);
      this.slots.push({ el: b, cd, id: null });
    }
    const help = el('div', 'ob-help', this.root);
    help.innerHTML =
      '<span><kbd>WASD</kbd>moverse</span><span><kbd>J</kbd>o clic: atacar</span><span><kbd>K</kbd>o clic derecho: bloquear</span><span><kbd>Espacio</kbd>esquivar</span><span><kbd>Q</kbd><kbd>E</kbd>poderes</span>';
  }

  update(frame: ArenaFrame) {
    for (const s of this.sides) {
      const f = frame.fighters.find((x) => x.id === s.id);
      if (!f) continue;
      if (f.hp !== s.hp) {
        s.hp = f.hp;
        const k = f.hp / OFFICE.maxHp;
        s.fill.style.transform = `scaleX(${k})`;
        s.lag.style.transform = `scaleX(${k})`;
        s.text.textContent = `${Math.ceil(f.hp)}`;
        s.el.classList.toggle('out', f.hp <= 0 && s.id !== this.meId);
      }
      if (s.cd && s.id === this.meId) s.cd.textContent = f.dodgeCd > 0 ? `Esquivar listo en ${f.dodgeCd.toFixed(1)} s` : 'Esquivar listo';
    }
    const me = frame.fighters.find((f) => f.id === this.meId);
    if (me) {
      this.spect.classList.toggle('on', me.hp <= 0 && frame.fighters.filter((f) => f.hp > 0).length > 1);
      me.powers.forEach((id, i) => {
        const slot = this.slots[i];
        if (!slot) return;
        if (slot.id !== id) {
          slot.id = id;
          slot.el.hidden = false;
          slot.el.title = `${POWERS[id].name}: ${POWERS[id].description}`;
          slot.el.setAttribute('aria-label', `${POWERS[id].name} (${i === 0 ? 'Q' : 'E'})`);
          slot.el.querySelectorAll('.ico, .key, .nm').forEach((n) => n.remove());
          const ico = el('span', 'ico');
          ico.textContent = POWER_ICON[id];
          const key = el('span', 'key');
          key.textContent = i === 0 ? 'Q' : 'E';
          const nm = el('span', 'nm');
          nm.textContent = SHORT[id];
          slot.el.prepend(ico, key, nm);
        }
        const left = me.cds[i] ?? 0;
        const pct = Math.min(100, (left / POWERS[id].cooldown) * 100);
        slot.cd.style.setProperty('--p', `${pct}%`);
        slot.cd.textContent = left > 0.05 ? String(Math.ceil(left)) : '';
        slot.el.classList.toggle('ready', left <= 0.05 && me.hp > 0);
      });
    }
    if (frame.remainingMs !== null) {
      const secs = Math.max(0, frame.remainingMs / 1000);
      this.timer.textContent = secs >= 10 ? `${Math.ceil(secs)}` : secs.toFixed(1);
      this.timer.classList.toggle('low', secs < 10);
    }
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

  dispose() {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.root.remove();
  }
}
