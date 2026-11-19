import { ARMY, CONQUEST, RECRUIT, UNIT_STATS, armyCount, capacityWithQueue, type MfFormation, type MfOrder, type MfSelection, type MfUnit, type MfWorld } from '@inbox/shared';

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
  private conquest: {
    root: HTMLDivElement;
    vp: [HTMLElement, HTMLElement];
    vpText: [HTMLElement, HTMLElement];
    clock: HTMLElement;
    forts: HTMLElement[];
    gold: HTMLElement;
    shop: Record<'warrior' | 'mage' | 'beast', HTMLElement>;
    queue: HTMLElement;
    respawn: HTMLElement;
  } | null = null;
  private lastConquest = '';

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

  /** Conquest panels: victory points, the three fortresses, gold, recruiting and garrisons. */
  private buildConquest() {
    const root = el('div', 'mf-conquest', this.root);
    const score = el('div', 'mf-panel mf-score', root);
    const vpRow = (cls: string, label: string) => {
      const r = el('div', `mf-vp ${cls}`, score);
      el('span', 'mf-vp-label', r, label);
      const bar = el('div', 'mf-bar', r);
      const fill = el('div', 'mf-bar-fill', bar);
      const text = el('b', 'mf-vp-num', r);
      return [fill, text] as const;
    };
    const [v0, t0] = vpRow('mf-vp-me', 'Tú');
    const [v1, t1] = vpRow('mf-vp-foe', 'Rival');
    const meta = el('div', 'mf-score-meta', score);
    const clock = el('span', '', meta);
    const forts = ['A', 'B', 'C'].map((l) => el('span', 'mf-fort', meta, l));
    const shopPanel = el('div', 'mf-panel mf-shop', root);
    const gold = el('div', 'mf-gold', shopPanel);
    const item = (k: 'warrior' | 'mage' | 'beast', key: string, label: string) => {
      const b = el('div', 'mf-buy', shopPanel);
      el('kbd', 'mf-kbd', b, key);
      el('span', '', b, `${label} · ${RECRUIT[k].cost}`);
      return b;
    };
    const shop = { warrior: item('warrior', 'Z', 'Guerrero'), mage: item('mage', 'X', 'Mago'), beast: item('beast', 'C', 'Dragón') };
    const queue = el('div', 'mf-queue', shopPanel);
    const g = el('div', 'mf-buy mf-garrison', shopPanel);
    el('kbd', 'mf-kbd', g, 'G');
    el('span', '', g, `Dejar ${CONQUEST.garrisonStep} en la fortaleza`);
    const r = el('div', 'mf-buy mf-garrison', shopPanel);
    el('kbd', 'mf-kbd', r, 'H');
    el('span', '', r, 'Recoger guarnición');
    const respawn = el('div', 'mf-respawn', this.root);
    this.conquest = { root, vp: [v0, v1], vpText: [t0, t1], clock, forts, gold, shop, queue, respawn };
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

  private updateConquest(world: MfWorld, team: number) {
    if (!this.conquest) this.buildConquest();
    const q = this.conquest!;
    const econ = world.econ[team]!;
    const foe = world.econ[1 - team]!;
    const left = Math.max(0, CONQUEST.timeLimit - world.time);
    const key = JSON.stringify([Math.floor(econ.vp), Math.floor(foe.vp), Math.floor(econ.gold), Math.ceil(left), world.forts.map((f) => [f.owner, Math.round(f.capture * 20), f.contested]), econ.queue.map((x) => [x.kind, Math.ceil(x.left * 2)]), Math.ceil(econ.respawn), capacityWithQueue(world, team)]);
    if (key === this.lastConquest) return;
    this.lastConquest = key;
    [econ, foe].forEach((e, i) => {
      q.vp[i]!.style.width = `${Math.min(100, (e.vp / CONQUEST.victoryPoints) * 100)}%`;
      q.vpText[i]!.textContent = `${Math.floor(e.vp)} / ${CONQUEST.victoryPoints}`;
    });
    q.clock.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    world.forts.forEach((f, i) => {
      const chip = q.forts[i]!;
      chip.className = `mf-fort ${f.owner < 0 ? '' : f.owner === team ? 'mine' : 'theirs'} ${f.contested ? 'contested' : ''}`;
      const toward = f.capture === 0 ? '' : (f.capture > 0) === (team === 0) ? ' · tú ' : ' · rival ';
      chip.title = `${f.name}${toward}${Math.round(Math.abs(f.capture) * 100)} %`;
      chip.style.setProperty('--cap', `${Math.abs(f.capture) * 100}%`);
      chip.style.setProperty('--capc', f.capture === 0 ? 'transparent' : (f.capture > 0) === (team === 0) ? '#4fa3ff' : '#ff6b57');
    });
    const room = ARMY.maxCapacity - capacityWithQueue(world, team);
    q.gold.innerHTML = `<b>${Math.floor(econ.gold)}</b> de oro <span class="mf-cap">· +${(CONQUEST.goldPerSecond + world.forts.filter((f) => f.owner === team).length * CONQUEST.goldPerFort).toFixed(1)}/s · ${room} lugares libres</span>`;
    (['warrior', 'mage', 'beast'] as const).forEach((k) => q.shop[k].classList.toggle('off', econ.gold < RECRUIT[k].cost || room < UNIT_STATS[k].capacity));
    const first = econ.queue[0];
    q.queue.textContent = first ? `Entrenando: ${econ.queue.map((x) => ({ warrior: 'guerrero', mage: 'mago', beast: 'dragón' })[x.kind]).join(', ')} · ${Math.ceil(first.left)} s` : 'Los soldados aparecen en tu campamento o fortaleza más cercana';
    q.respawn.textContent = econ.respawn > 0 ? `Tu comandante cayó. Vuelve al campamento en ${Math.ceil(econ.respawn)} s` : '';
    q.respawn.style.display = econ.respawn > 0 ? '' : 'none';
  }

  update(world: MfWorld, team: number) {
    if (world.mode === 'conquest') this.updateConquest(world, team);
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
