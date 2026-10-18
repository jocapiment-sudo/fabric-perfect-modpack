/**
 * ============================================================================
 *  Dynamic names + lore
 * ============================================================================
 *  Bedrock items expose `nameTag` (the custom display name) and `setLore`.
 *  Both are persisted with the item and are what players see in the tooltip.
 *
 *  Name  : "§d§lKeen Diamond Sword of the Berserker§r"
 *  Lore  : rarity header, iLvl, every affix, forge/boss provenance.
 *
 *  Lore limits enforced by Bedrock: 20 lines, 50 characters per line.
 * ============================================================================
 */

import type { ItemStack } from '@minecraft/server';

import { AFFIX_BY_ID, affixValueText, nameParts, type AffixInstance } from './affixes';
import { baseNameOf } from './gear';
import type { GemData, ItemData } from './itemData';
import { RARITY_BY_KEY, affixCapacity, type RarityKey } from './rarity';
import { formatNumber, truncate } from '../util/text';

const DIVIDER = '§8────────────────────────';
const MAX_LORE_LINE = 50;

/** Build the coloured display name shown above the tooltip. */
export function buildDisplayName(typeId: string, data: ItemData): string {
  const rarity = RARITY_BY_KEY[data.rarity];
  const { prefix, suffix } = nameParts(data.affixes);
  const base = baseNameOf(typeId);
  const composed = [prefix, base, suffix].filter((part): part is string => Boolean(part)).join(' ');
  return `${rarity.color}${rarity.bold ? '§l' : ''}${truncate(composed, 46)}`;
}

/** One lore line per affix, e.g. `§b✦ Keen +14% + critical strike chance`. */
function affixLoreLine(instance: AffixInstance, rarity: RarityKey): string {
  const def = AFFIX_BY_ID[instance.id];
  const rarityDef = RARITY_BY_KEY[rarity];
  const marker = def.kind === 'prefix' ? '✦' : '❖';
  const line = `${rarityDef.color}${marker} ${def.name}§r §a${affixValueText(def, instance.v)} §7${def.label}`;
  return truncate(line, MAX_LORE_LINE);
}

/** Build the full lore array for an affix item. */
export function buildLore(data: ItemData): string[] {
  const rarity = RARITY_BY_KEY[data.rarity];
  const capacity = affixCapacity(data.rarity);

  const lines: string[] = [
    DIVIDER,
    truncate(
      `${rarity.color}${rarity.bold ? '§l' : ''}${rarity.name} §r§8• §7iLvl ${formatNumber(data.level)} §8• §7${data.affixes.length}/${capacity} affixes`,
      MAX_LORE_LINE,
    ),
    DIVIDER,
  ];

  if (data.affixes.length === 0) {
    lines.push('§8No affixes — reforge or socket a gem.');
  } else {
    for (const instance of data.affixes) {
      lines.push(affixLoreLine(instance, data.rarity));
    }
  }

  lines.push(DIVIDER);
  lines.push(truncate(`§8Forged by the §5Apotheosis§8 altar`, MAX_LORE_LINE));
  if (data.boss) {
    lines.push(truncate(`§8Slain: §7${data.boss}`, MAX_LORE_LINE));
  }
  if (data.reforges > 0) {
    lines.push(truncate(`§8Reforged §7×${data.reforges}`, MAX_LORE_LINE));
  }

  // Hard safety: never exceed Bedrock's lore limits.
  return lines.slice(0, 20).map((line) => truncate(line, MAX_LORE_LINE));
}

/**
 * Apply name + lore to an ItemStack from its payload.
 * Returns false when the stack cannot be modified (e.g. stackable items).
 */
export function applyPresentation(item: ItemStack, data: ItemData): boolean {
  try {
    item.nameTag = buildDisplayName(item.typeId, data);
    item.setLore(buildLore(data));
    return true;
  } catch (error) {
    console.warn(`[Apotheosis] Could not apply item presentation: ${String(error)}`);
    return false;
  }
}

/** Clear custom name and lore (used when an item is completely drained). */
export function clearPresentation(item: ItemStack): void {
  try {
    item.nameTag = undefined;
    item.setLore([]);
  } catch {
    // Ignore stackable items.
  }
}

// ---------------------------------------------------------------------------
// Gems
// ---------------------------------------------------------------------------

/** `Keen Gem`, `Gem of the Berserker`, coloured by the gem's rarity. */
export function gemDisplayName(gem: GemData): string {
  const def = AFFIX_BY_ID[gem.affix];
  const rarity = RARITY_BY_KEY[gem.rarity];
  const base = def.kind === 'prefix' ? `${def.name} Gem` : `Gem ${def.name}`;
  return `${rarity.color}${rarity.bold ? '§l' : ''}${base}`;
}

/** Gem tooltip: rarity, affix potency and a usage hint. */
export function gemLore(gem: GemData): string[] {
  const def = AFFIX_BY_ID[gem.affix];
  const rarity = RARITY_BY_KEY[gem.rarity];
  return [
    DIVIDER,
    `${rarity.color}${rarity.bold ? '§l' : ''}${rarity.name} Gem`,
    `§7Affix: §f${def.name}`,
    `§7Potency: §a${affixValueText(def, def.values[rarity.tier])}`,
    '§7Effect: §f' + def.label,
    DIVIDER,
    '§8Use at a §5Reforging Altar§8.',
  ].map((line) => truncate(line, MAX_LORE_LINE));
}

export const BLANK_GEM_NAME = '§7Blank Affix Gem';
export const BLANK_GEM_LORE: readonly string[] = [
  DIVIDER,
  '§7An empty vessel humming with potential.',
  '§8Infuse it with an affix at a',
  '§8Reforging Altar, then socket it',
  '§8into a piece of gear.',
];

/** Tooltip used by the hammer / tuning fork / codex items. */
export function toolLore(lines: readonly string[]): string[] {
  return [DIVIDER, ...lines, DIVIDER].map((line) => truncate(line, MAX_LORE_LINE));
}
