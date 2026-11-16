import { ITEM_CATALOG } from '@inbox/shared';
import { prisma } from './db';

/** Mirrors the code catalog into the Item table so inventory rows have a valid foreign key. */
export async function syncCatalog(): Promise<void> {
  await prisma.$transaction(
    ITEM_CATALOG.map((i) =>
      prisma.item.upsert({
        where: { id: i.id },
        create: { id: i.id, slot: i.slot, name: i.name, rarity: i.rarity, unlockType: i.unlockType, unlockLevel: i.unlockLevel, purchasable: i.purchasable },
        update: { slot: i.slot, name: i.name, rarity: i.rarity, unlockType: i.unlockType, unlockLevel: i.unlockLevel, purchasable: i.purchasable },
      }),
    ),
  );
}
