/**
 * ============================================================================
 *  Affix registry + rolling
 * ============================================================================
 *  An affix is a named stat roll bound to an item. Prefixes read as adjectives
 *  ("Keen Diamond Sword") and suffixes read as possessive phrases ("… of the
 *  Berserker"), which is how the Java mod builds item names.
 *
 *  `values` holds one potency per rarity tier:
 *      [common, uncommon, rare, epic, mythic]
 *  The final value is scaled slightly by the item level so late-game reforges
 *  are meaningfully stronger without adding another rarity axis.
 *
 *  Combat-only stats (crit, lifesteal, ignite, …) are resolved in
 *  `systems/combat.ts`; passive stats are mirrored onto the player as vanilla
 *  status effects in `systems/equipment.ts`.
 * ============================================================================
 */

import { MAX_AFFIXES } from '../config';
import { RARITY_BY_KEY, type RarityKey } from './rarity';
import { roundTo, weightedPick } from '../util/random';
import { formatNumber, percent } from '../util/text';

export type AffixId =
  | 'keen'
  | 'vampiric'
  | 'blazing'
  | 'frostbound'
  | 'thunderous'
  | 'berserker'
  | 'hunter'
  | 'sage'
  | 'vital'
  | 'fleet'
  | 'warded'
  | 'bulwark'
  | 'aegis'
  | 'emberforged'
  | 'tidewalker'
  | 'featherstep'
  | 'thorns'
  | 'titan'
  | 'zephyr'
  | 'warden'
  | 'juggernaut'
  | 'phoenix'
  | 'leviathan'
  | 'fortune';

export type AffixKind = 'prefix' | 'suffix';
export type GearSlot = 'weapon' | 'armor';

/** Stats that are summed across every equipped affix. */
export type StatKey =
  | 'crit'
  | 'lifesteal'
  | 'fireSeconds'
  | 'frostTicks'
  | 'thunderChance'
  | 'flatDamage'
  | 'eliteDamage'
  | 'xpBonus'
  | 'health'
  | 'speedPct'
  | 'resistancePct'
  | 'kbResistPct'
  | 'absorptionHp'
  | 'fireResSeconds'
  | 'waterBreathingSeconds'
  | 'jumpAmp'
  | 'luckAmp'
  | 'thorns';

export type AffixUnit = 'percent' | 'seconds' | 'ticks' | 'flat' | 'amplifier';

export interface AffixDef {
  id: AffixId;
  /** Display name, e.g. "Keen" or "of the Berserker". */
  name: string;
  kind: AffixKind;
  /** Which equipment type may roll this affix. `any` = weapons and armour. */
  slot: GearSlot | 'any';
  stat: StatKey;
  unit: AffixUnit;
  /** Potency per rarity tier: [common, uncommon, rare, epic, mythic]. */
  values: readonly [number, number, number, number, number];
  /** Relative chance of being rolled. */
  weight: number;
  /** Short label used by lore / tooltips. */
  label: string;
}

/**
 * Every affix in the pack. Keeping the IDs in a union above means typos in
 * persisted data are caught at parse time and at compile time.
 */
export const AFFIXES: readonly AffixDef[] = [
  // ---------------------------------------------------------------- weapons
  {
    id: 'keen',
    name: 'Keen',
    kind: 'prefix',
    slot: 'weapon',
    stat: 'crit',
    unit: 'percent',
    values: [0.04, 0.07, 0.1, 0.14, 0.18],
    weight: 10,
    label: 'critical strike chance',
  },
  {
    id: 'vampiric',
    name: 'Vampiric',
    kind: 'prefix',
    slot: 'weapon',
    stat: 'lifesteal',
    unit: 'percent',
    values: [0.03, 0.05, 0.08, 0.11, 0.15],
    weight: 8,
    label: 'lifesteal',
  },
  {
    id: 'blazing',
    name: 'Blazing',
    kind: 'prefix',
    slot: 'weapon',
    stat: 'fireSeconds',
    unit: 'seconds',
    values: [1, 2, 3, 4, 5],
    weight: 10,
    label: 'burn on hit',
  },
  {
    id: 'frostbound',
    name: 'Frostbound',
    kind: 'prefix',
    slot: 'weapon',
    stat: 'frostTicks',
    unit: 'ticks',
    values: [20, 30, 40, 60, 80],
    weight: 9,
    label: 'slowness on hit',
  },
  {
    id: 'thunderous',
    name: 'Thunderous',
    kind: 'prefix',
    slot: 'weapon',
    stat: 'thunderChance',
    unit: 'percent',
    values: [0.05, 0.08, 0.11, 0.15, 0.2],
    weight: 7,
    label: 'chance to smite',
  },
  {
    id: 'berserker',
    name: 'of the Berserker',
    kind: 'suffix',
    slot: 'weapon',
    stat: 'flatDamage',
    unit: 'flat',
    values: [1, 2, 3, 4, 5],
    weight: 10,
    label: 'bonus attack damage',
  },
  {
    id: 'hunter',
    name: 'of the Hunter',
    kind: 'suffix',
    slot: 'weapon',
    stat: 'eliteDamage',
    unit: 'percent',
    values: [0.1, 0.15, 0.2, 0.25, 0.35],
    weight: 6,
    label: 'damage vs elites',
  },
  {
    id: 'sage',
    name: 'of the Sage',
    kind: 'suffix',
    slot: 'any',
    stat: 'xpBonus',
    unit: 'flat',
    values: [1, 2, 3, 4, 6],
    weight: 6,
    label: 'bonus XP on kill',
  },

  // ----------------------------------------------------------------- armour
  {
    id: 'vital',
    name: 'Vital',
    kind: 'prefix',
    slot: 'armor',
    stat: 'health',
    unit: 'flat',
    values: [2, 4, 6, 8, 10],
    weight: 10,
    label: 'max health',
  },
  {
    id: 'fleet',
    name: 'Fleet',
    kind: 'prefix',
    slot: 'armor',
    stat: 'speedPct',
    unit: 'percent',
    values: [0.04, 0.07, 0.1, 0.13, 0.17],
    weight: 10,
    label: 'movement speed',
  },
  {
    id: 'warded',
    name: 'Warded',
    kind: 'prefix',
    slot: 'armor',
    stat: 'resistancePct',
    unit: 'percent',
    values: [0.05, 0.08, 0.12, 0.16, 0.2],
    weight: 9,
    label: 'damage resistance',
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    kind: 'prefix',
    slot: 'armor',
    stat: 'kbResistPct',
    unit: 'percent',
    values: [0.15, 0.25, 0.35, 0.45, 0.55],
    weight: 8,
    label: 'knockback resistance',
  },
  {
    id: 'aegis',
    name: 'Aegis',
    kind: 'prefix',
    slot: 'armor',
    stat: 'absorptionHp',
    unit: 'flat',
    values: [1, 2, 3, 4, 6],
    weight: 8,
    label: 'absorption health',
  },
  {
    id: 'emberforged',
    name: 'Emberforged',
    kind: 'prefix',
    slot: 'armor',
    stat: 'fireResSeconds',
    unit: 'seconds',
    values: [3, 5, 7, 9, 12],
    weight: 7,
    label: 'fire resistance',
  },
  {
    id: 'tidewalker',
    name: 'Tidewalker',
    kind: 'prefix',
    slot: 'armor',
    stat: 'waterBreathingSeconds',
    unit: 'seconds',
    values: [3, 5, 7, 9, 12],
    weight: 7,
    label: 'water breathing',
  },
  {
    id: 'featherstep',
    name: 'Featherstep',
    kind: 'prefix',
    slot: 'armor',
    stat: 'jumpAmp',
    unit: 'amplifier',
    values: [1, 1, 1, 2, 2],
    weight: 7,
    label: 'jump boost',
  },
  {
    id: 'thorns',
    name: 'of Thorns',
    kind: 'suffix',
    slot: 'armor',
    stat: 'thorns',
    unit: 'flat',
    values: [1, 2, 2, 3, 4],
    weight: 8,
    label: 'thorns damage',
  },
  {
    id: 'titan',
    name: 'of the Titan',
    kind: 'suffix',
    slot: 'armor',
    stat: 'health',
    unit: 'flat',
    values: [4, 6, 9, 12, 16],
    weight: 6,
    label: 'max health',
  },
  {
    id: 'zephyr',
    name: 'of the Zephyr',
    kind: 'suffix',
    slot: 'armor',
    stat: 'speedPct',
    unit: 'percent',
    values: [0.05, 0.09, 0.13, 0.17, 0.22],
    weight: 6,
    label: 'movement speed',
  },
  {
    id: 'warden',
    name: 'of the Warden',
    kind: 'suffix',
    slot: 'armor',
    stat: 'kbResistPct',
    unit: 'percent',
    values: [0.2, 0.3, 0.4, 0.5, 0.65],
    weight: 6,
    label: 'knockback resistance',
  },
  {
    id: 'juggernaut',
    name: 'of the Juggernaut',
    kind: 'suffix',
    slot: 'armor',
    stat: 'resistancePct',
    unit: 'percent',
    values: [0.06, 0.1, 0.14, 0.18, 0.24],
    weight: 6,
    label: 'damage resistance',
  },
  {
    id: 'phoenix',
    name: 'of the Phoenix',
    kind: 'suffix',
    slot: 'armor',
    stat: 'fireResSeconds',
    unit: 'seconds',
    values: [2, 4, 6, 8, 10],
    weight: 5,
    label: 'fire resistance',
  },
  {
    id: 'leviathan',
    name: 'of the Leviathan',
    kind: 'suffix',
    slot: 'armor',
    stat: 'waterBreathingSeconds',
    unit: 'seconds',
    values: [2, 4, 6, 8, 10],
    weight: 5,
    label: 'water breathing',
  },
  {
    id: 'fortune',
    name: 'of Fortune',
    kind: 'suffix',
    slot: 'any',
    stat: 'luckAmp',
    unit: 'amplifier',
    values: [1, 1, 2, 2, 3],
    weight: 5,
    label: 'luck',
  },
] as const;

export const AFFIX_BY_ID: Record<AffixId, AffixDef> = Object.fromEntries(
  AFFIXES.map((affix) => [affix.id, affix]),
) as Record<AffixId, AffixDef>;

/** A concrete affix on an item: an id plus the rolled potency. */
export interface AffixInstance {
  id: AffixId;
  /** Rolled value after rarity + item level scaling. */
  v: number;
}

/** Type guard used when reading persisted affix ids. */
export function isAffixId(value: unknown): value is AffixId {
  return typeof value === 'string' && value in AFFIX_BY_ID;
}

/** Affixes legal for a weapon/armour slot (includes `any`). */
export function affixesForSlot(slot: GearSlot): AffixDef[] {
  return AFFIXES.filter((affix) => affix.slot === slot || affix.slot === 'any');
}

/**
 * Item level scales affix potency by up to +50 % (at level 100).
 * Keeping the cap small avoids invalidating the rarity ladder.
 */
export function levelMultiplier(itemLevel: number): number {
  return 1 + Math.min(0.5, Math.max(0, itemLevel) * 0.005);
}

/**
 * Create a concrete affix value for a given rarity and item level.
 * Flat stats are rounded to integers, percentages to three decimals.
 */
export function rollAffixValue(def: AffixDef, rarity: RarityKey, itemLevel: number): number {
  const base = def.values[RARITY_BY_KEY[rarity].tier];
  const value = base * levelMultiplier(itemLevel);
  switch (def.unit) {
    case 'percent':
      return roundTo(value, 3);
    case 'ticks':
    case 'seconds':
    case 'amplifier':
    case 'flat':
    default:
      return Math.max(0, Math.round(value));
  }
}

/**
 * Roll a fresh affix set for an item.
 *
 * Guarantees:
 *   - never the same affix twice on one item,
 *   - never more affixes than the rarity allows,
 *   - at least one prefix when the item has affixes (so names read naturally).
 */
export function rollAffixes(rarity: RarityKey, slot: GearSlot, itemLevel: number): AffixInstance[] {
  const rarityDef = RARITY_BY_KEY[rarity];
  const count = Math.min(MAX_AFFIXES, rarityDef.affixSlots);
  if (count <= 0) return [];

  const candidates = affixesForSlot(slot);
  const chosen: AffixDef[] = [];

  // First pass: weighted pick without replacement.
  const pool = [...candidates];
  while (chosen.length < count && pool.length > 0) {
    const picked = weightedPick(pool.map((affix) => ({ value: affix, weight: affix.weight })));
    if (!picked) break;
    chosen.push(picked);
    pool.splice(pool.indexOf(picked), 1);
  }

  // Make sure the display name gets a prefix: swap a suffix-only roll for a
  // random unused prefix when possible.
  if (count > 0 && !chosen.some((affix) => affix.kind === 'prefix')) {
    const unusedPrefix = pool.find((affix) => affix.kind === 'prefix');
    const replaceIndex = chosen.findIndex((affix) => affix.kind === 'suffix');
    if (unusedPrefix && replaceIndex >= 0) chosen[replaceIndex] = unusedPrefix;
  }

  return chosen.map((affix) => ({ id: affix.id, v: rollAffixValue(affix, rarity, itemLevel) }));
}

/** Render one affix as a coloured value, e.g. `+14% critical strike chance`. */
export function affixValueText(def: AffixDef, value: number): string {
  switch (def.unit) {
    case 'percent':
      return `+${percent(value)}`;
    case 'seconds':
      return `+${formatNumber(value)}s`;
    case 'ticks':
      return `+${formatNumber(value / 20, 1)}s`;
    case 'amplifier':
      return `Lv ${formatNumber(value + 1)}`;
    case 'flat':
    default:
      return `+${formatNumber(value)}`;
  }
}

/** Full affix description used by lore and the gem UI. */
export function affixLine(def: AffixDef, value: number, color = '§a'): string {
  return `${color}${affixValueText(def, value)} §7${def.label}`;
}

/** Recompute an existing affix's value at a new rarity (used by upgrades). */
export function revalueAffix(instance: AffixInstance, rarity: RarityKey, itemLevel: number): AffixInstance {
  return { id: instance.id, v: rollAffixValue(AFFIX_BY_ID[instance.id], rarity, itemLevel) };
}

/** The prefix/suffix selected for the item's display name. */
export function nameParts(affixes: readonly AffixInstance[]): { prefix?: string; suffix?: string } {
  const defs = affixes.map((affix) => AFFIX_BY_ID[affix.id]);
  return {
    prefix: defs.find((def) => def.kind === 'prefix')?.name,
    suffix: defs.find((def) => def.kind === 'suffix' && def.name.startsWith('of '))?.name,
  };
}
