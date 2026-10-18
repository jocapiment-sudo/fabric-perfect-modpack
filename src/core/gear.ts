/**
 * Gear classification helpers.
 *
 * Bedrock's Script API does not expose item tags, so eligibility is decided by
 * identifier suffix. This deliberately excludes pickaxes/shovels/hoes (they are
 * tools, not weapons) while accepting both vanilla and custom gear.
 */

import { IDS, NS } from '../config';
import { titleCase } from '../util/text';
import type { GearSlot } from './affixes';

const WEAPON_SUFFIXES = ['_sword', '_axe', 'trident', 'shield', 'bow', 'crossbow'] as const;
const ARMOR_SUFFIXES = ['_helmet', '_chestplate', '_leggings', '_boots', 'turtle_helmet', 'elytra'] as const;

/** Custom items that should be treated as gear even though their names differ. */
const CUSTOM_GEAR: Record<string, GearSlot> = {
  [IDS.bossBlade]: 'weapon',
  [IDS.bossCleaver]: 'weapon',
};

/** Pretty names for custom gear (vanilla names are derived automatically). */
const CUSTOM_NAMES: Record<string, string> = {
  [`${NS}:boss_blade`]: 'Bloodforged Blade',
  [`${NS}:boss_cleaver`]: 'Dread Cleaver',
};

/**
 * Base attack damage estimates used by the critical-strike and Hunter affixes.
 * The Script API does not expose the player's attack attribute, so we mirror the
 * vanilla values. Values are intentionally conservative.
 */
const ESTIMATED_WEAPON_DAMAGE: Record<string, number> = {
  wooden_sword: 4,
  stone_sword: 5,
  iron_sword: 6,
  golden_sword: 4,
  diamond_sword: 7,
  netherite_sword: 8,
  wooden_axe: 7,
  stone_axe: 9,
  iron_axe: 9,
  golden_axe: 7,
  diamond_axe: 9,
  netherite_axe: 10,
  trident: 9,
  shield: 1,
  bow: 1,
  crossbow: 1,
  boss_blade: 9,
  boss_cleaver: 11,
};

/** Strip the namespace from an identifier. */
export function bareId(typeId: string): string {
  return typeId.includes(':') ? typeId.split(':').pop() ?? typeId : typeId;
}

/** Weapon or armour slot, or `undefined` for non-gear items. */
export function gearSlotOf(typeId: string): GearSlot | undefined {
  const custom = CUSTOM_GEAR[typeId];
  if (custom) return custom;

  const bare = bareId(typeId);
  if (WEAPON_SUFFIXES.some((suffix) => bare.endsWith(suffix))) return 'weapon';
  if (ARMOR_SUFFIXES.some((suffix) => bare.endsWith(suffix))) return 'armor';
  return undefined;
}

/** True when an item can receive affixes. */
export function isGear(typeId: string): boolean {
  return gearSlotOf(typeId) !== undefined;
}

/** Human readable base name (without affixes). */
export function baseNameOf(typeId: string): string {
  return CUSTOM_NAMES[typeId] ?? titleCase(typeId);
}

/** Best-effort vanilla damage estimate for combat hooks. */
export function estimatedWeaponDamage(typeId: string): number {
  return ESTIMATED_WEAPON_DAMAGE[bareId(typeId)] ?? 5;
}

/** Convenience for the "affix gem" flow: which affix pool applies. */
export function slotForGem(itemTypeId: string): GearSlot | undefined {
  return gearSlotOf(itemTypeId);
}
