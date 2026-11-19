import { ARMY, UNIT_STATS, armyCount, type MfFormation, type MfOrder, type MfSelection, type MfUnit, type MfWorld } from '@inbox/shared';

/**
 * On-screen panels: your army (living units per kind, the order each group follows and which group
 * is selected), the enemy's strength, the commander's health, the order keys with the volley
 * cooldown, and big banners for the war cry and the end of the battle.
 */

const ORDER_LABEL: Record<MfOrder, string> = { follow: 'Seguimiento', attack: 'Ataque', defend: 'Defensa' };
const GROUP_LABEL: Record<MfSelection, string> = { all: 'Todo el ejército', warrior: 'Guerreros', mage: 'Magos', beast: 'Dragones' };
const FORMATION_LABEL: Record<MfFormation, string> = { line: 'Línea', wedge: 'Cuña', column: 'Columna' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

function orderOf(units: MfUnit[]): MfOrder | 'mixed' | null {
  const live = units.filter((u) => u.alive);
  if (!live.length) return null;
  const o = live[0]!.order;
  return live.every((u) => u.order === o) ? o : 'mixed';
}

export class MagicHud {
  private root: HTMLDivElement;
  private rows: Record<'warrior' | 'mage' | 'beast', { row: HTMLDivElement; count: HTMLElement; order: HTMLElement }>;
  private total: HTMLElement;
  private selLabel: HTMLElement;
  private enemyCount: HTMLElement;
  private enemyHp: HTMLElement;
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private volleyKey: HTMLElement;
  private volleyFill: HTMLElement;
  private bannerEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private bannerTimer = 0;
  private toastTimer = 0;
  private last = '';

  constructor(container: HTMLElement) {
    this.root = el('div', 'mf-hud', container);

    const army = el('div', 'mf-panel mf-army', this.root);
    el('div', 'mf-title', army, 'Tu ejército');
    this.total = el('div', 'mf-total', army);
    const row = (kind: 'warrior' | 'mage' | 'beast', key: string, icon: string, label: string) => {
      const r = el('div', `mf-row mf-${kind}`, army);
      el('kbd', 'mf-kbd', r, key);
      el('span', 'mf-icon', r, icon);
      el('span', 'mf-label', r, label);
      const count = el('strong', 'mf-count', r);
      const order = el('span', 'mf-order', r);
      return { row: r, count, order };
    };
    this.rows = {
      warrior: row('warrior', '1', '⚔', 'Guerreros'),
      mage: row('mage', '2', '✦', 'Magos'),
      beast: row('beast', '3', '🐉', 'Dragones'),
    };
    this.selLabel = el('div', 'mf-sel', army);

    const enemy = el('div', 'mf-panel mf-enemy', this.root);
    el('div', 'mf-title', enemy, 'Ejército enemigo');
    this.enemyCount = el('div', 'mf-total', enemy);
    const ebar = el('div', 'mf-bar mf-bar-enemy', enemy);
    this.enemyHp = el('div', 'mf-bar-fill', ebar);
    el('div', 'mf-small', enemy, 'Comandante enemigo');

    const bottom = el('div', 'mf-bottom', this.root);
    const hp = el('div', 'mf-bar mf-bar-me', bottom);
    this.hpFill = el('div', 'mf-bar-fill', hp);
    this.hpText = el('span', 'mf-bar-text', hp);
    const keys = el('div', 'mf-keys', bottom);
    const key = (k: string, label: string, cls = '') => {
      const b = el('div', `mf-key ${cls}`, keys);
      el('kbd', 'mf-kbd', b, k);
      el('span', '', b, label);
      return b;
    };
    key('Clic der.', 'Atacar', 'mf-k-attack');
    key('Q', 'Defender', 'mf-k-defend');
    key('F', 'Seguir', 'mf-k-follow');
    this.volleyKey = key('E', 'Descarga mágica', 'mf-k-volley');
    this.volleyFill = el('div', 'mf-cool', this.volleyKey);
    key('R', 'Formación');
    key('Clic izq.', 'Golpe');

    this.bannerEl = el('div', 'mf-banner', this.root);
    this.toastEl = el('div', 'mf-toast', this.root);
    this.hintEl = el('div', 'mf-hint', this.root, 'Haz clic en el campo para tomar el mouse · Esc lo suelta');
  }

  banner(title: string, sub = '', ms = 2200, cls = '') {
    this.bannerEl.innerHTML = '';
    el('strong', '', this.bannerEl, title);
    if (sub) el('span', '', this.bannerEl, sub);
    this.bannerEl.className = `mf-banner show ${cls}`;
    window.clearTimeout(this.bannerTimer);
    if (ms > 0) this.bannerTimer = window.setTimeout(() => (this.bannerEl.className = 'mf-banner'), ms);
  }

  toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.className = 'mf-toast show';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.className = 'mf-toast'), 1600);
  }

  warCry(selection: MfSelection) {
    this.banner('¡A la carga!', selection === 'all' ? 'Todo el ejército ataca' : `${GROUP_LABEL[selection]} atacan`, 1300, 'mf-cry');
  }

  orderGiven(order: MfOrder, selection: MfSelection) {
    if (order === 'attack') return;
    const who = selection === 'all' ? 'El ejército' : GROUP_LABEL[selection];
    this.toast(order === 'defend' ? `${who}: ¡formen y defiendan!` : `${who}: ¡conmigo!`);
  }

  setPointerLocked(locked: boolean) {
    this.hintEl.style.display = locked ? 'none' : '';
  }

  update(world: MfWorld, team: number) {
    const mine = world.units.filter((u) => u.team === team && u.kind !== 'commander');
    const c = armyCount(world, team);
    const e = armyCount(world, 1 - team);
    const army = world.armies[team]!;
    const enemyCmd = world.units.find((u) => u.team !== team && u.kind === 'commander')!;
    const orders = (['warrior', 'mage', 'beast'] as const).map((k) => orderOf(mine.filter((u) => u.kind === k)));
    const key = JSON.stringify([c, e.warrior + e.mage + e.beast, Math.round(enemyCmd.hp), army.selection, orders, Math.ceil(army.volleyCd * 4), army.formation]);
    if (key === this.last) return;
    this.last = key;

    const alive = c.warrior + c.mage + c.beast;
    const max = c.warriorMax + c.mageMax + c.beastMax;
    const cap = c.warrior * UNIT_STATS.warrior.capacity + c.mage * UNIT_STATS.mage.capacity + c.beast * UNIT_STATS.beast.capacity;
    this.total.innerHTML = `<b>${alive}</b> / ${max} unidades vivas <span class="mf-cap">· ocupan ${cap} de ${ARMY.maxCapacity}</span>`;
    (['warrior', 'mage', 'beast'] as const).forEach((k, i) => {
      const r = this.rows[k];
      const n = c[k];
      const m = c[`${k}Max`];
      r.count.textContent = m ? `${n}/${m}` : '—';
      const o = orders[i];
      r.order.textContent = o === null ? (m ? 'Caídos' : '—') : o === 'mixed' ? 'Mixto' : ORDER_LABEL[o];
      r.order.className = `mf-order ${o && o !== 'mixed' ? `mf-o-${o}` : ''}`;
      r.row.classList.toggle('selected', army.selection === k || army.selection === 'all');
      r.row.classList.toggle('empty', !n);
    });
    this.selLabel.textContent = `Órdenes para: ${GROUP_LABEL[army.selection]} · Formación: ${FORMATION_LABEL[army.formation]} (R)`;

    const ealive = e.warrior + e.mage + e.beast;
    this.enemyCount.innerHTML = `<b>${ealive}</b> / ${e.warriorMax + e.mageMax + e.beastMax} soldados`;
    this.enemyHp.style.width = `${(Math.max(0, enemyCmd.hp) / enemyCmd.maxHp) * 100}%`;

    this.hpFill.style.width = `${(c.commanderHp / c.commanderMax) * 100}%`;
    this.hpText.textContent = `Comandante ${Math.ceil(c.commanderHp)} / ${c.commanderMax}`;
    const cool = army.volleyCd / ARMY.volleyCooldown;
    this.volleyFill.style.transform = `scaleX(${cool})`;
    this.volleyKey.classList.toggle('ready', cool <= 0 && c.mage > 0);
  }

  dispose() {
    window.clearTimeout(this.bannerTimer);
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }
}
