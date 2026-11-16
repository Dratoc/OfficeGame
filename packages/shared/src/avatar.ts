import { z } from 'zod';

export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Común',
  rare: 'Raro',
  epic: 'Épico',
  legendary: 'Legendario',
  mythic: 'Mítico',
};

/** Order matters: it is also the order of the editor tabs. */
export const SLOTS = ['head', 'eyes', 'hair', 'beard', 'outfit', 'headgear', 'cape', 'wings', 'weapon', 'pet', 'effect'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  head: 'Rostro',
  eyes: 'Ojos',
  hair: 'Cabello',
  beard: 'Barba',
  outfit: 'Ropa y armadura',
  headgear: 'Cascos y coronas',
  cape: 'Capas',
  wings: 'Alas',
  weapon: 'Armas decorativas',
  pet: 'Mascotas',
  effect: 'Efectos',
};

/** Slots that can be left empty. */
export const OPTIONAL_SLOTS: readonly Slot[] = ['beard', 'headgear', 'cape', 'wings', 'weapon', 'pet', 'effect', 'hair'];

export type UnlockType = 'starter' | 'level' | 'achievement' | 'purchase';

export interface ItemDef {
  id: string;
  slot: Slot;
  name: string;
  rarity: Rarity;
  unlockType: UnlockType;
  /** Level needed when unlockType is 'level'. */
  unlockLevel: number;
  description: string;
  /** Sold in the shop for doubloons. Items never affect gameplay. */
  purchasable: boolean;
}

const item = (id: string, slot: Slot, name: string, rarity: Rarity, unlockLevel: number, description: string): ItemDef => ({
  id,
  slot,
  name,
  rarity,
  unlockType: unlockLevel <= 1 ? 'starter' : 'level',
  unlockLevel,
  description,
  // Anything you would unlock by leveling up can also be bought in the shop. Cosmetic only.
  purchasable: unlockLevel > 1,
});

export const ITEM_CATALOG: readonly ItemDef[] = [
  // Rostro
  item('head_human', 'head', 'Humano de oficina', 'common', 1, 'Clásico. Funciona con cualquier corbata.'),
  item('head_elf', 'head', 'Elfo de contabilidad', 'rare', 2, 'Orejas puntiagudas, cuentas exactas.'),
  item('head_orc', 'head', 'Orco de logística', 'rare', 4, 'Entrega a tiempo. Siempre.'),
  item('head_dragon', 'head', 'Cabeza de dragón', 'epic', 6, 'Para el ejecutivo que escupe fuego en las reuniones.'),
  // Ojos
  item('eyes_dot', 'eyes', 'Mirada tranquila', 'common', 1, 'Lunes a las 9:00.'),
  item('eyes_happy', 'eyes', 'Ojos felices', 'common', 1, 'Viernes a las 17:59.'),
  item('eyes_sharp', 'eyes', 'Mirada de auditor', 'rare', 2, 'Ve todos los errores de tipeo.'),
  item('eyes_glow', 'eyes', 'Ojos arcanos', 'epic', 7, 'Brillan con energía mágica y cafeína.'),
  // Cabello
  item('hair_short', 'hair', 'Corte ejecutivo', 'common', 1, 'Aprobado por Recursos Humanos.'),
  item('hair_long', 'hair', 'Melena de bardo', 'common', 1, 'Ondea con la brisa del aire acondicionado.'),
  item('hair_bun', 'hair', 'Moño productivo', 'common', 1, 'Sostiene un lápiz de emergencia.'),
  item('hair_mohawk', 'hair', 'Cresta de bárbaro', 'rare', 3, 'Viernes casual, todos los días.'),
  item('hair_flame', 'hair', 'Cabellera de fuego', 'legendary', 9, 'Literalmente en llamas. No acercar a la impresora.'),
  // Barba
  item('beard_stubble', 'beard', 'Barba de tres días', 'common', 1, 'Cierre de trimestre.'),
  item('beard_viking', 'beard', 'Barba vikinga', 'rare', 3, 'Trenzada para las presentaciones.'),
  item('beard_wizard', 'beard', 'Barba de archimago', 'epic', 6, 'Larga como un hilo de correos.'),
  // Ropa y armadura
  item('outfit_suit', 'outfit', 'Traje y corbata', 'common', 1, 'Uniforme estándar del reino.'),
  item('outfit_sweater', 'outfit', 'Suéter de viernes', 'common', 1, 'Cómodo y competitivo.'),
  item('outfit_iron', 'outfit', 'Armadura de hierro con corbata', 'rare', 3, 'Protege contra reuniones sin agenda.'),
  item('outfit_mage', 'outfit', 'Túnica de mago de RR.HH.', 'rare', 4, 'Bordada con políticas internas.'),
  item('outfit_gold', 'outfit', 'Armadura dorada del directorio', 'legendary', 10, 'Solo para la junta directiva del reino.'),
  // Cascos y coronas
  item('headgear_knight', 'headgear', 'Yelmo de caballero', 'rare', 2, 'Visera abatible para ignorar llamadas.'),
  item('headgear_viking', 'headgear', 'Casco vikingo', 'rare', 4, 'Con cuernos reglamentarios.'),
  item('headgear_wizard', 'headgear', 'Sombrero de mago', 'epic', 5, 'Guarda un conejo y tres clips.'),
  item('headgear_crown', 'headgear', 'Corona de gerente', 'legendary', 8, 'El que la lleva, aprueba los presupuestos.'),
  item('headgear_mythic', 'headgear', 'Corona estelar', 'mythic', 12, 'Forjada con estrellas y horas extra.'),
  // Capas
  item('cape_red', 'cape', 'Capa carmesí', 'rare', 2, 'Ondea al caminar hacia la cafetera.'),
  item('cape_royal', 'cape', 'Manto real', 'epic', 7, 'Armiño sintético, conciencia tranquila.'),
  // Alas
  item('wings_angel', 'wings', 'Alas de soporte técnico', 'epic', 6, 'Llegan cuando nadie más puede.'),
  item('wings_dragon', 'wings', 'Alas de dragón', 'legendary', 9, 'Para viajes de negocios rápidos.'),
  item('wings_phoenix', 'wings', 'Alas de fénix', 'mythic', 15, 'Renacen después de cada lunes.'),
  // Armas decorativas
  item('weapon_mug', 'weapon', 'Taza de café', 'common', 1, 'El arma más poderosa de la oficina.'),
  item('weapon_sword', 'weapon', 'Espada corporativa', 'rare', 2, 'Afilada para cortar presupuestos.'),
  item('weapon_staff', 'weapon', 'Báculo de PowerPoint', 'rare', 3, 'Convoca diapositivas.'),
  item('weapon_stapler', 'weapon', 'Hacha engrapadora', 'epic', 5, 'Une documentos. Y destinos.'),
  // Mascotas
  item('pet_cat', 'pet', 'Gato de oficina', 'common', 1, 'Duerme sobre el teclado más cálido.'),
  item('pet_dragon_green', 'pet', 'Dragoncito verde', 'rare', 3, 'Calienta el café con un estornudo.'),
  item('pet_dragon_red', 'pet', 'Dragón carmesí', 'epic', 6, 'Leal, feroz y un poco dramático.'),
  item('pet_dragon_gold', 'pet', 'Dragón dorado', 'legendary', 10, 'Duerme sobre los bonos anuales.'),
  // Efectos
  item('effect_sparkles', 'effect', 'Destellos', 'epic', 7, 'Brillas en cada reunión.'),
  item('effect_fire', 'effect', 'Aura de fuego', 'legendary', 11, 'Estás en racha.'),
  item('effect_mythic', 'effect', 'Aura mítica', 'mythic', 14, 'Los becarios hablan de ti en voz baja.'),
];

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEM_CATALOG.map((i) => [i.id, i]));

export const SKIN_TONES = ['#f5d0b5', '#e8b48f', '#c98c62', '#9a6342', '#6b4029', '#b9d4a8', '#a8c6e6'] as const;
export const HAIR_COLORS = ['#2b1d16', '#6b3f22', '#c4873e', '#e8c766', '#b23a2b', '#7d7f8a', '#4b5fd6', '#2f8f6a'] as const;

export const avatarConfigSchema = z.object({
  skin: z.number().int().min(0).max(SKIN_TONES.length - 1),
  hairColor: z.number().int().min(0).max(HAIR_COLORS.length - 1),
  equipped: z.partialRecord(z.enum(SLOTS), z.string().max(40).nullable()),
});
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: 0,
  hairColor: 1,
  equipped: {
    head: 'head_human',
    eyes: 'eyes_dot',
    hair: 'hair_short',
    outfit: 'outfit_suit',
    weapon: 'weapon_mug',
  },
};

export function starterItemIds(): string[] {
  return ITEM_CATALOG.filter((i) => i.unlockType === 'starter').map((i) => i.id);
}

export function itemsUnlockedAtLevel(level: number): string[] {
  return ITEM_CATALOG.filter((i) => i.unlockType === 'level' && i.unlockLevel <= level).map((i) => i.id);
}

/**
 * Checks that every equipped item exists, sits in the right slot and is owned.
 * Required slots (head, eyes, outfit) must be filled. Returns an error message or null.
 */
export function validateAvatar(config: AvatarConfig, owned: ReadonlySet<string>): string | null {
  for (const slot of SLOTS) {
    const id = config.equipped[slot];
    if (!id) {
      if (!OPTIONAL_SLOTS.includes(slot)) return `Falta elegir: ${SLOT_LABEL[slot]}`;
      continue;
    }
    const def = ITEMS_BY_ID.get(id);
    if (!def) return `Objeto desconocido: ${id}`;
    if (def.slot !== slot) return `${def.name} no va en ${SLOT_LABEL[slot]}`;
    if (!owned.has(id)) return `Aún no desbloqueas ${def.name}`;
  }
  return null;
}
