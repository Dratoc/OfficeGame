import type { AvatarConfig } from '@inbox/shared';

/** Sparring partners: office executives who never miss a meeting. */
export const PRACTICE_RIVALS: { name: string; avatar: AvatarConfig }[] = [
  {
    name: 'Gerente Dragón',
    avatar: { skin: 0, hairColor: 0, equipped: { head: 'head_dragon', eyes: 'eyes_glow', outfit: 'outfit_gold', headgear: 'headgear_crown', cape: 'cape_royal', weapon: 'weapon_mug', pet: 'pet_dragon_red' } },
  },
  {
    name: 'Contadora Elfa',
    avatar: { skin: 0, hairColor: 3, equipped: { head: 'head_elf', eyes: 'eyes_sharp', hair: 'hair_long', outfit: 'outfit_mage', headgear: 'headgear_wizard', weapon: 'weapon_staff', wings: 'wings_angel' } },
  },
  {
    name: 'Orco de Logística',
    avatar: { skin: 2, hairColor: 4, equipped: { head: 'head_orc', eyes: 'eyes_dot', hair: 'hair_mohawk', beard: 'beard_viking', outfit: 'outfit_iron', headgear: 'headgear_viking', weapon: 'weapon_stapler' } },
  },
];
