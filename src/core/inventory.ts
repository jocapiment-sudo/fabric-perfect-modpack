/**
 * Player inventory and equipment helpers.
 *
 * Notes:
 *  - `getEquipment(EquipmentSlot.Mainhand)` is used instead of the deprecated
 *    `selectedSlot` API, which changed names between 1.10 and 1.11.
 *  - Items read from a container are snapshots. After mutating one you must
 *    write it back with `setItem` / `setEquipment`, which every helper here does.
 */

import {
  EntityComponentTypes,
  EquipmentSlot,
  type Container,
  type EntityEquippableComponent,
  type EntityInventoryComponent,
  type ItemStack,
  type Player,
} from '@minecraft/server';

import { DP, IDS } from '../config';

/** The player's main inventory (36 slots). */
export function getInventory(player: Player): Container | undefined {
  const inventory = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
  return inventory?.container;
}

/** Equippable component for armour / held slots. */
export function getEquippable(player: Player): EntityEquippableComponent | undefined {
  return player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
}

/** The item currently in the player's main hand. */
export function getHeldItem(player: Player): ItemStack | undefined {
  const item = getEquippable(player)?.getEquipment(EquipmentSlot.Mainhand);
  return item && item.typeId !== 'minecraft:air' ? item : undefined;
}

/** Write an item back into the main hand. */
export function setHeldItem(player: Player, item: ItemStack | undefined): boolean {
  try {
    return getEquippable(player)?.setEquipment(EquipmentSlot.Mainhand, item) ?? false;
  } catch {
    return false;
  }
}

/** Try to add an item to the inventory, dropping it at the player's feet if full. */
export function giveOrDrop(player: Player, item: ItemStack): void {
  const container = getInventory(player);
  if (!container) {
    try {
      player.dimension.spawnItem(item, player.location);
    } catch {
      // Player left during an async UI flow.
    }
    return;
  }

  const leftover = container.addItem(item);
  if (!leftover) return;
  try {
    player.dimension.spawnItem(leftover, player.location);
  } catch {
    // Player left during an async UI flow.
  }
}

/** Count how many of `typeId` the player carries (whole inventory). */
export function countItem(container: Container, typeId: string): number {
  let total = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId === typeId) total += item.amount;
  }
  return total;
}

/**
 * Remove `amount` of `typeId`. Returns false (and removes nothing) when the
 * player does not carry enough.
 */
export function takeItems(container: Container, typeId: string, amount: number): boolean {
  if (amount <= 0) return true;
  if (countItem(container, typeId) < amount) return false;

  let remaining = amount;
  for (let slot = 0; slot < container.size && remaining > 0; slot++) {
    const item = container.getItem(slot);
    if (!item || item.typeId !== typeId) continue;
    const taken = Math.min(item.amount, remaining);
    remaining -= taken;
    if (item.amount - taken <= 0) {
      container.setItem(slot, undefined);
    } else {
      const copy = item.clone();
      copy.amount = item.amount - taken;
      container.setItem(slot, copy);
    }
  }
  return true;
}

/** Remove a single item from a specific slot. */
export function consumeSlot(container: Container, slot: number): void {
  const item = container.getItem(slot);
  if (!item) return;
  if (item.amount <= 1) {
    container.setItem(slot, undefined);
    return;
  }
  const copy = item.clone();
  copy.amount = item.amount - 1;
  container.setItem(slot, copy);
}

export interface GemSlot {
  slot: number;
  /** Gem stack (amount is always 1 for gems). */
  item: ItemStack;
}

/** Every affix-gem stack in the player's inventory. */
export function findGemSlots(container: Container): GemSlot[] {
  const found: GemSlot[] = [];
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId === IDS.gem) found.push({ slot, item });
  }
  return found;
}

/** Count blank affix gems (no payload yet). */
export function countBlankGems(container: Container): number {
  let count = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId !== IDS.gem) continue;
    try {
      if (item.getDynamicProperty(DP.gem) === undefined) count += item.amount;
    } catch {
      // Ignore malformed stacks.
    }
  }
  return count;
}

/** Find the first blank gem slot. */
export function findBlankGemSlot(container: Container): number | undefined {
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId !== IDS.gem) continue;
    try {
      if (item.getDynamicProperty(DP.gem) === undefined) return slot;
    } catch {
      // Ignore malformed stacks.
    }
  }
  return undefined;
}
