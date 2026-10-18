/**
 * ============================================================================
 *  Rarity model
 * ============================================================================
 *  Bedrock has no data-driven item rarity, so rarity is stored in the item's
 *  dynamic properties (see `core/itemData.ts`) and expressed through the
 *  item name colour, lore header and loot weighting.
 *
 *  Rarity controls:
 *    - how many affix slots an item has,
 *    - the potency of each affix (tier index into `AffixDef.values`),
 *    - reforge / upgrade costs,
 *    - salvage rewards,
 *    - which elite mini-boss can spawn.
 * ============================================================================
 */

import { IDS, MAX_AFFIXES } from '../config';
import { weightedPick } from '../util/random';

export const RARITY_KEYS = ['common', 'uncommon', 'rare', 'epic', 'mythic'] as const;
export type RarityKey = (typeof RARITY_KEYS)[number];

export interface RarityCost {
  dust: number;
  levels: number;
  /** Item identifier consumed by the upgrade (one unit). */
  orb?: string;
}

export interface RarityDef {
  key: RarityKey;
  name: string;
  /** Minecraft formatting code, e.g. `§b`. */
  color: string;
  bold: boolean;
  /** 0 = common ... 4 = mythic. Index into affix value arrays. */
  tier: number;
  /** Number of affix slots granted by this rarity. */
  affixSlots: number;
  /** Weight used when rolling loot rarity. */
  weight: number;
  /** Extra item level applied to drops of this rarity. */
  itemLevelBonus: number;
  /** Cost to re-roll affixes at this rarity. */
  reforge: RarityCost;
  /** Cost to upgrade *to* this rarity (unused for common). */
  upgrade: RarityCost;
  /** Salvage rewards. */
  salvage: { dustMin: number; dustMax: number; gemChance: number; orbChance: number };
  /** Aura particle used by elites of this rarity. */
  particle: string;
}

/**
 * The rarity ladder. Costs grow roughly quadratically so mythic gear feels
 * earned rather than casually reforged.
 */
export const RARITIES: readonly RarityDef[] = [
  {
    key: 'common',
    name: 'Common',
    color: '§7',
    bold: false,
    tier: 0,
    affixSlots: 0,
    weight: 45,
    itemLevelBonus: 0,
    reforge: { dust: 1, levels: 1 },
    upgrade: { dust: 2, levels: 1, orb: IDS.orbUncommon },
    salvage: { dustMin: 0, dustMax: 1, gemChance: 0, orbChance: 0 },
    particle: 'minecraft:villager_happy',
  },
  {
    key: 'uncommon',
    name: 'Uncommon',
    color: '§a',
    bold: false,
    tier: 1,
    affixSlots: 1,
    weight: 28,
    itemLevelBonus: 4,
    reforge: { dust: 2, levels: 1 },
    upgrade: { dust: 4, levels: 1, orb: IDS.orbRare },
    salvage: { dustMin: 1, dustMax: 2, gemChance: 0.25, orbChance: 0.1 },
    particle: 'minecraft:villager_happy',
  },
  {
    key: 'rare',
    name: 'Rare',
    color: '§b',
    bold: false,
    tier: 2,
    affixSlots: 2,
    weight: 17,
    itemLevelBonus: 8,
    reforge: { dust: 4, levels: 2 },
    upgrade: { dust: 8, levels: 2, orb: IDS.orbEpic },
    salvage: { dustMin: 2, dustMax: 4, gemChance: 0.35, orbChance: 0.2 },
    particle: 'minecraft:enchanting_table_particle',
  },
  {
    key: 'epic',
    name: 'Epic',
    color: '§d',
    bold: true,
    tier: 3,
    affixSlots: 3,
    weight: 8,
    itemLevelBonus: 12,
    reforge: { dust: 7, levels: 3 },
    upgrade: { dust: 14, levels: 3, orb: IDS.orbMythic },
    salvage: { dustMin: 4, dustMax: 6, gemChance: 0.5, orbChance: 0.3 },
    particle: 'minecraft:totem_particle',
  },
  {
    key: 'mythic',
    name: 'Mythic',
    color: '§6',
    bold: true,
    tier: 4,
    affixSlots: 4,
    weight: 2,
    itemLevelBonus: 18,
    reforge: { dust: 10, levels: 4 },
    upgrade: { dust: 0, levels: 0 },
    salvage: { dustMin: 6, dustMax: 9, gemChance: 0.65, orbChance: 0.4 },
    particle: 'minecraft:basic_flame_particle',
  },
] as const;

export const RARITY_BY_KEY: Record<RarityKey, RarityDef> = Object.fromEntries(
  RARITIES.map((rarity) => [rarity.key, rarity]),
) as Record<RarityKey, RarityDef>;

/** Type guard for persisted rarity keys. */
export function isRarityKey(value: unknown): value is RarityKey {
  return typeof value === 'string' && (RARITY_KEYS as readonly string[]).includes(value);
}

/** Look up a rarity by tier, clamping to the ladder. */
export function rarityByTier(tier: number): RarityDef {
  const index = Math.min(RARITIES.length - 1, Math.max(0, Math.floor(tier)));
  return RARITIES[index] as RarityDef;
}

/** The next rarity up, or `undefined` for mythic. */
export function nextRarity(key: RarityKey): RarityDef | undefined {
  const def = RARITY_BY_KEY[key];
  return RARITIES[def.tier + 1];
}

/** Maximum affixes an item of this rarity may hold (base rolls + one gem). */
export function affixCapacity(key: RarityKey): number {
  return Math.min(MAX_AFFIXES, RARITY_BY_KEY[key].affixSlots + 1);
}

/** Format `Rare` with its colour, e.g. `§bRare`. */
export function rarityLabel(key: RarityKey, bold = false): string {
  const def = RARITY_BY_KEY[key];
  return `${def.color}${def.bold || bold ? '§l' : ''}${def.name}§r`;
}

/** Format a rarity with brackets, used in chat and lore. */
export function rarityBadge(key: RarityKey): string {
  const def = RARITY_BY_KEY[key];
  return `${def.color}${def.bold ? '§l' : ''}[${def.name}]§r`;
}

/** The orb item that upgrades an item *to* this rarity (if any). */
export function orbItemFor(key: RarityKey): string | undefined {
  return RARITY_BY_KEY[key].upgrade.orb;
}

/**
 * Roll a rarity using the configured weights. `maxTier` is useful for low-tier
 * spawners; `luck` shifts weight towards higher rarities.
 */
export function rollRarity(options?: { maxTier?: number; minTier?: number; luck?: number }): RarityKey {
  const maxTier = options?.maxTier ?? RARITIES.length - 1;
  const minTier = options?.minTier ?? 0;
  const luck = Math.max(0, options?.luck ?? 0);

  const entries = RARITIES.filter((rarity) => rarity.tier >= minTier && rarity.tier <= maxTier).map((rarity) => ({
    value: rarity.key,
    // Luck adds a flat bonus per tier, making high rarities noticeably more common.
    weight: rarity.weight + rarity.tier * luck * 10,
  }));

  return weightedPick(entries) ?? 'common';
}
