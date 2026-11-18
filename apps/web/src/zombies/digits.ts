import { WEAPON_IDS, type Survivor } from '@inbox/shared';
import type { ZombieHud } from './hud';
import type { ZombieControls } from './input';

/** Wires the number keys and the HUD buttons: buy at a shop, or pick a weapon anywhere else. */
export function wireShopping(hud: ZombieHud, controls: ZombieControls, me: () => Survivor | null) {
  hud.onBuy = (index) => controls.queueBuy(index);
  hud.onWeapon = (index) => controls.queueWeapon(index);
  controls.onDigit = (n) => {
    if (hud.openShop) {
      const pick = hud.items[n - 1];
      if (pick) controls.queueBuy(pick.index);
      return;
    }
    const s = me();
    if (!s) return;
    const owned = WEAPON_IDS.map((_, i) => i).filter((i) => (s.wl[i] ?? 0) > 0);
    const w = owned[n - 1];
    if (w !== undefined) controls.queueWeapon(w);
  };
}
