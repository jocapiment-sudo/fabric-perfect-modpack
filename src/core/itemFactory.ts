/**
 * ============================================================================
 *  Item factory & affix operations
 * ============================================================================
 *  All ItemStack construction and transformation lives here so the UI layer
 *  never has to know about JSON payloads or lore formatting.
 *
 *  Every operation that changes an item mutates the passed ItemStack in place
 *  and returns a result object. The caller is responsible for writing the
 *  stack back into the player's hand/inventory (Bedrock returns snapshots).
 * ============================================================================
 */

import { ItemStack } from '@minecraft/server';

import { IDS, MAX_AFFIXES } from '../config';
import {
  AFFIX_BY_ID,
  rollAffixes,
  rollAffixValue,
  type AffixId,
  type AffixInstance,
  type GearSlot,
} from './affixes';
import { baseNameOf, gearSlotOf } from './gear';
import {
  BLANK_GEM_LORE,
  BLANK_GEM_NAME,
  applyPresentation,
  gemDisplayName,
  gemLore,
  toolLore,
} from './naming';
import {
  readItemData,
  writeGemData,
  writeItemData,
  type GemData,
  type ItemData,
} from './itemData';
import { RARITY_BY_KEY, affixCapacity, nextRarity, type RarityKey } from './rarity';
import { chance, pick, randInt, weightedPick } from '../util/random';

/** Result of a mutation performed by the altar. */
export interface ItemOpResult {
  ok: boolean;
  message: string;
  data?: ItemData;
}

// ---------------------------------------------------------------------------
// Low level constructors
// ---------------------------------------------------------------------------

/** `new ItemStack` that never throws on a bad identifier. */
export function makeStack(typeId: string, amount = 1): ItemStack | undefined {
  try {
    return new ItemStack(typeId, Math.max(1, Math.min(64, Math.floor(amount))));
  } catch (error) {
    console.warn(`[Apotheosis] Unknown item identifier "${typeId}": ${String(error)}`);
    return undefined;
  }
}

/** Create the pack's tools/consumables (names are defined in item JSON). */
function createTool(typeId: string, loreLines: readonly string[]): ItemStack | undefined {
  const item = makeStack(typeId, 1);
  if (!item) return undefined;
  try {
    item.setLore(toolLore(loreLines));
  } catch {
    // Lore is cosmetic; never fail item creation over it.
  }
  return item;
}

export function createHammer(): ItemStack | undefined {
  return createTool(IDS.hammer, ['§7Use on a §5Reforging Altar', '§7to reforge, upgrade and socket', '§7affixes into your held gear.']);
}

export function createFork(): ItemStack | undefined {
  return createTool(IDS.fork, ['§7Use on a §8Mob Spawner§7 to bind it', '§7to Apotheosis and edit its delay,', '§7count, population cap and range.']);
}

export function createCodex(): ItemStack | undefined {
  return createTool(IDS.codex, ['§7Use anywhere to open the', '§5Apotheosis Codex§7: rarities,', '§7affixes, elites and spawner rules.']);
}

export function createEffigy(): ItemStack | undefined {
  return createTool(IDS.effigy, ['§7Use anywhere to summon a', '§crandom affix elite§7 nearby.', '§8Consumed on use.']);
}

export function createDust(amount = 1): ItemStack | undefined {
  return makeStack(IDS.dust, amount);
}

const ORB_ITEMS: Partial<Record<RarityKey, string>> = {
  uncommon: IDS.orbUncommon,
  rare: IDS.orbRare,
  epic: IDS.orbEpic,
  mythic: IDS.orbMythic,
};

/** Rarity orbs are separate items so crafting recipes can produce them. */
export function createOrb(rarity: RarityKey, amount = 1): ItemStack | undefined {
  const typeId = ORB_ITEMS[rarity];
  if (!typeId) return undefined;
  const item = makeStack(typeId, amount);
  if (!item) return undefined;
  const def = RARITY_BY_KEY[rarity];
  try {
    item.nameTag = `${def.color}${def.bold ? '§l' : ''}${def.name} Orb`;
    item.setLore(toolLore([`§7Consumed by the §5Reforging Altar`, `§7to upgrade an item to §f${def.name}§7.`]));
  } catch {
    // Cosmetic.
  }
  return item;
}

// ---------------------------------------------------------------------------
// Gems
// ---------------------------------------------------------------------------

/** A gem carrying a specific affix (used by bosses, salvage and the altar). */
export function createGem(affixId: AffixId, rarity: RarityKey): ItemStack | undefined {
  const item = makeStack(IDS.gem, 1);
  if (!item) return undefined;
  const gem: GemData = { affix: affixId, rarity };
  if (!writeGemData(item, gem)) return undefined;
  try {
    item.nameTag = gemDisplayName(gem);
    item.setLore(gemLore(gem));
  } catch {
    // Cosmetic.
  }
  return item;
}

/** An empty gem waiting to be infused at the altar. */
export function createBlankGem(): ItemStack | undefined {
  const item = makeStack(IDS.gem, 1);
  if (!item) return undefined;
  try {
    item.nameTag = BLANK_GEM_NAME;
    item.setLore([...BLANK_GEM_LORE]);
  } catch {
    // Cosmetic.
  }
  return item;
}

// ---------------------------------------------------------------------------
// Affix gear
// ---------------------------------------------------------------------------

export interface CreateAffixOptions {
  /** Item level; scales affix potency. Defaults to 1. */
  level?: number;
  /** Boss name stored in the lore. */
  boss?: string;
  /** Override the rolled affixes (used by tests / admin commands). */
  affixes?: AffixInstance[];
  /** Try to add vanilla enchantments (boss gear only). */
  enchant?: boolean;
}

/**
 * Build a piece of affix gear.
 * Returns `undefined` for non-gear items or unknown identifiers.
 */
export function createAffixItem(
  typeId: string,
  rarity: RarityKey,
  options: CreateAffixOptions = {},
): ItemStack | undefined {
  const slot = gearSlotOf(typeId);
  if (!slot) return undefined;

  const level = Math.max(1, Math.min(100, Math.floor(options.level ?? 1)));
  const affixes = options.affixes ?? rollAffixes(rarity, slot, level);
  const data: ItemData = {
    version: 1,
    rarity,
    level,
    affixes: affixes.slice(0, MAX_AFFIXES),
    boss: options.boss,
    reforges: 0,
  };

  const item = makeStack(typeId, 1);
  if (!item) return undefined;
  if (!writeItemData(item, data)) return undefined;
  applyPresentation(item, data);
  if (options.enchant) maybeEnchant(item, slot, rarity);
  return item;
}

/** Re-apply name/lore after external mutation. */
export function refreshItem(item: ItemStack): void {
  const data = readItemData(item);
  if (data) applyPresentation(item, data);
}

// ---------------------------------------------------------------------------
// Altar operations
// ---------------------------------------------------------------------------

/**
 * Re-roll every affix at the item's current rarity.
 * Costs are handled by the caller; this function is pure.
 */
export function reforgeItem(item: ItemStack): ItemOpResult {
  const data = readItemData(item);
  const slot = gearSlotOf(item.typeId);
  if (!data) return { ok: false, message: 'This item has no affixes to reforge.' };
  if (!slot) return { ok: false, message: 'Only weapons and armour can be reforged.' };

  const affixes = rollAffixes(data.rarity, slot, data.level);
  const next: ItemData = { ...data, affixes, reforges: data.reforges + 1 };
  if (!writeItemData(item, next)) return { ok: false, message: 'This item cannot hold affixes.' };
  applyPresentation(item, next);
  return { ok: true, message: `Reforged at §f${RARITY_BY_KEY[next.rarity].name}§7 rarity.`, data: next };
}

/**
 * Raise the item one rarity tier.
 * Existing affixes are re-valued at the new tier; new slots are filled with
 * fresh rolls (gems already socketed are preserved, never duplicated).
 */
export function upgradeItem(item: ItemStack): ItemOpResult {
  const data = readItemData(item);
  const slot = gearSlotOf(item.typeId);
  if (!data) return { ok: false, message: 'Place an affix item in your main hand first.' };
  if (!slot) return { ok: false, message: 'Only weapons and armour can be upgraded.' };

  const target = nextRarity(data.rarity);
  if (!target) return { ok: false, message: 'This item is already §6Mythic§7.' };

  const level = Math.min(100, data.level + 3);
  const capacity = affixCapacity(target.key);

  // Re-roll potency at the new rarity tier.
  const affixes: AffixInstance[] = data.affixes.map((instance) => ({
    id: instance.id,
    v: rollAffixValue(AFFIX_BY_ID[instance.id], target.key, level),
  }));

  // Fill newly unlocked slots with fresh affixes (no duplicates).
  const used = new Set(affixes.map((affix) => affix.id));
  const targetRolls = Math.min(capacity, Math.max(target.affixSlots, affixes.length));
  while (affixes.length < targetRolls) {
    const rolled = rollAffixes(target.key, slot, level).filter((affix) => !used.has(affix.id));
    const fresh = rolled[0];
    if (!fresh) break;
    used.add(fresh.id);
    affixes.push(fresh);
  }

  const next: ItemData = { ...data, rarity: target.key, level, affixes };
  if (!writeItemData(item, next)) return { ok: false, message: 'This item cannot hold affixes.' };
  applyPresentation(item, next);
  return { ok: true, message: `Upgraded to ${target.color}${target.name}§7!`, data: next };
}

/**
 * Socket a gem into an item.
 * A gem can never duplicate an existing affix and never exceed the rarity's
 * capacity (base rolls + one bonus slot).
 */
export function applyGem(item: ItemStack, gem: GemData): ItemOpResult {
  const slot = gearSlotOf(item.typeId);
  if (!slot) return { ok: false, message: 'Only weapons and armour can hold gems.' };

  const existing = readItemData(item) ?? {
    version: 1 as const,
    rarity: 'common' as RarityKey,
    level: 1,
    affixes: [] as AffixInstance[],
    reforges: 0,
  };

  if (existing.affixes.some((affix) => affix.id === gem.affix)) {
    return { ok: false, message: 'That affix is already present on the item.' };
  }
  if (existing.affixes.length >= affixCapacity(existing.rarity)) {
    return { ok: false, message: 'No free affix slots — upgrade the rarity first.' };
  }

  const def = AFFIX_BY_ID[gem.affix];
  if (def.slot !== 'any' && def.slot !== slot) {
    return { ok: false, message: `${def.name} cannot be socketed into ${slot === 'weapon' ? 'a weapon' : 'armour'}.` };
  }

  const value = rollAffixValue(def, gem.rarity, existing.level);
  const next: ItemData = { ...existing, affixes: [...existing.affixes, { id: gem.affix, v: value }] };
  if (!writeItemData(item, next)) return { ok: false, message: 'This item cannot hold affixes.' };
  applyPresentation(item, next);
  return { ok: true, message: `Socketed ${def.name} into the item.`, data: next };
}

/** Rewards rolled when an item is salvaged at the altar. */
export interface SalvageRoll {
  dust: number;
  gem?: GemData;
  orb?: RarityKey;
}

export function rollSalvage(data: ItemData): SalvageRoll {
  const def = RARITY_BY_KEY[data.rarity];
  const result: SalvageRoll = {
    dust: randInt(def.salvage.dustMin, def.salvage.dustMax),
  };

  if (data.affixes.length > 0 && chance(def.salvage.gemChance)) {
    const affix = pick(data.affixes);
    result.gem = { affix: affix.id, rarity: data.rarity };
  }

  // Salvaging high-rarity gear can return an orb one step below it.
  if (def.tier > 1 && chance(def.salvage.orbChance)) {
    const orbRarity: RarityKey | undefined =
      data.rarity === 'mythic' ? 'epic' : data.rarity === 'epic' ? 'rare' : data.rarity === 'rare' ? 'uncommon' : undefined;
    result.orb = orbRarity;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Loot helpers
// ---------------------------------------------------------------------------

const WEAPON_POOL: readonly { value: string; weight: number }[] = [
  { value: 'minecraft:iron_sword', weight: 22 },
  { value: 'minecraft:diamond_sword', weight: 16 },
  { value: 'minecraft:netherite_sword', weight: 6 },
  { value: 'minecraft:iron_axe', weight: 16 },
  { value: 'minecraft:diamond_axe', weight: 12 },
  { value: IDS.bossBlade, weight: 10 },
  { value: IDS.bossCleaver, weight: 6 },
];

const ARMOR_POOL: readonly { value: string; weight: number }[] = [
  { value: 'minecraft:iron_helmet', weight: 12 },
  { value: 'minecraft:iron_chestplate', weight: 12 },
  { value: 'minecraft:iron_leggings', weight: 12 },
  { value: 'minecraft:iron_boots', weight: 12 },
  { value: 'minecraft:diamond_helmet', weight: 9 },
  { value: 'minecraft:diamond_chestplate', weight: 9 },
  { value: 'minecraft:diamond_leggings', weight: 9 },
  { value: 'minecraft:diamond_boots', weight: 9 },
  { value: 'minecraft:netherite_chestplate', weight: 4 },
  { value: 'minecraft:netherite_leggings', weight: 4 },
  { value: 'minecraft:netherite_boots', weight: 4 },
];

/** Item level for a freshly dropped item of the given rarity. */
export function lootItemLevel(rarity: RarityKey): number {
  return 12 + RARITY_BY_KEY[rarity].tier * 6 + randInt(0, 8);
}

/** Random gear drop of a given rarity, already named/lored. */
export function createRandomGearDrop(
  rarity: RarityKey,
  options: { boss?: string; slotBias?: GearSlot } = {},
): ItemStack | undefined {
  const slot: GearSlot = options.slotBias ?? (chance(0.55) ? 'weapon' : 'armor');
  const pool = slot === 'weapon' ? WEAPON_POOL : ARMOR_POOL;
  const typeId = weightedPick(pool);
  if (!typeId) return undefined;
  return createAffixItem(typeId, rarity, {
    level: lootItemLevel(rarity),
    boss: options.boss,
    enchant: true,
  });
}

/** Base name helper used by UI copy. */
export function displayBaseName(typeId: string): string {
  return baseNameOf(typeId);
}

// ---------------------------------------------------------------------------
// Forward-compatible enchanting
// ---------------------------------------------------------------------------

interface EnchantableLike {
  addEnchantment(enchantment: { type: string; level: number }): void;
}

interface EnchantSpec {
  type: string;
  level: number;
}

const WEAPON_ENCHANTS: Record<RarityKey, readonly EnchantSpec[]> = {
  common: [],
  uncommon: [{ type: 'sharpness', level: 1 }],
  rare: [
    { type: 'sharpness', level: 2 },
    { type: 'unbreaking', level: 2 },
  ],
  epic: [
    { type: 'sharpness', level: 3 },
    { type: 'fire_aspect', level: 1 },
    { type: 'unbreaking', level: 3 },
  ],
  mythic: [
    { type: 'sharpness', level: 5 },
    { type: 'fire_aspect', level: 2 },
    { type: 'looting', level: 3 },
    { type: 'unbreaking', level: 3 },
  ],
};

const ARMOR_ENCHANTS: Record<RarityKey, readonly EnchantSpec[]> = {
  common: [],
  uncommon: [{ type: 'protection', level: 1 }],
  rare: [
    { type: 'protection', level: 2 },
    { type: 'unbreaking', level: 2 },
  ],
  epic: [
    { type: 'protection', level: 3 },
    { type: 'thorns', level: 2 },
    { type: 'unbreaking', level: 3 },
  ],
  mythic: [
    { type: 'protection', level: 4 },
    { type: 'thorns', level: 3 },
    { type: 'feather_falling', level: 4 },
    { type: 'unbreaking', level: 3 },
  ],
};

/**
 * Add vanilla enchantments to boss gear. `ItemEnchantableComponent` is not
 * available in the stable 1.10 module (it arrived with 1.11), so this is a
 * best-effort enhancement guarded by try/catch. On 1.20.80 the call is a no-op
 * and the affix stats still carry the item's power.
 */
export function maybeEnchant(item: ItemStack, slot: GearSlot, rarity: RarityKey): void {
  try {
    const component = item.getComponent('minecraft:enchantable') as unknown as EnchantableLike | undefined;
    if (!component || typeof component.addEnchantment !== 'function') return;
    const table = slot === 'weapon' ? WEAPON_ENCHANTS : ARMOR_ENCHANTS;
    for (const enchantment of table[rarity]) {
      component.addEnchantment(enchantment);
    }
  } catch {
    // Enchanting is optional; never let it break a boss spawn.
  }
}

/** Consumed by the altar UI to check "is there room for a gem?". */
export function hasFreeAffixSlot(data: ItemData | undefined): boolean {
  if (!data) return true;
  return data.affixes.length < affixCapacity(data.rarity);
}
