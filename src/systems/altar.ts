/**
 * ============================================================================
 *  Reforging Altar transactions
 * ============================================================================
 *  This module contains the *rules* (costs, validation, item mutation) while
 *  `ui/altarUI.ts` contains only presentation. Keeping them apart makes the
 *  economy auditable and lets admins call the same operations from script
 *  events if they want to build custom shops.
 *
 *  Costs:
 *    reforge        -> rarity.reforge.dust + levels
 *    upgrade        -> target rarity's dust + levels + one rarity orb
 *    socket gem     -> 2 arcane dust + 1 level (gem item consumed)
 *    infuse blank   -> 4 arcane dust + 1 level (gem becomes an affix gem)
 *    salvage        -> free; destroys the item and returns dust / gem / orb
 * ============================================================================
 */

import type { ItemStack, Player } from '@minecraft/server';

import { IDS, PARTICLES, SOUNDS } from '../config';
import {
  AFFIXES,
  AFFIX_BY_ID,
  affixValueText,
  isAffixId,
  rollAffixValue,
  type AffixDef,
  type AffixId,
  type GearSlot,
} from '../core/affixes';
import { gearSlotOf } from '../core/gear';
import {
  consumeSlot,
  countBlankGems,
  countItem,
  findBlankGemSlot,
  findGemSlots,
  getHeldItem,
  getInventory,
  giveOrDrop,
  setHeldItem,
  takeItems,
} from '../core/inventory';
import {
  isAffixItem,
  readGemData,
  readItemData,
  writeGemData,
  type GemData,
  type ItemData,
} from '../core/itemData';
import {
  applyGem,
  createDust,
  createGem,
  createOrb,
  makeStack,
  reforgeItem,
  rollSalvage,
  upgradeItem,
} from '../core/itemFactory';
import { gemDisplayName, gemLore } from '../core/naming';
import { RARITY_BY_KEY, affixCapacity, nextRarity, type RarityCost, type RarityDef } from '../core/rarity';
import { statsFromItems, statSummaryLines } from '../core/stats';
import { burst, playSound } from '../util/feedback';
import { stripFormatting } from '../util/text';
import { refreshPlayerNow } from './equipment';

export interface AltarResult {
  ok: boolean;
  message: string;
}

const GEM_COST: RarityCost = { dust: 2, levels: 1 };
const INFUSE_COST: RarityCost = { dust: 4, levels: 1 };

export interface HeldGear {
  item: ItemStack;
  slot: GearSlot;
  data: ItemData | undefined;
}

interface HeldGearError {
  error: string;
}

/** Read the player's main-hand gear, or explain why it is unusable. */
export function getHeldGear(player: Player): HeldGear | HeldGearError {
  const item = getHeldItem(player);
  if (!item) return { error: 'Hold a weapon or armour piece in your main hand.' };
  const slot = gearSlotOf(item.typeId);
  if (!slot) return { error: 'That item cannot be worked at the altar.' };
  return { item, slot, data: readItemData(item) };
}

function isError(value: HeldGear | HeldGearError): value is HeldGearError {
  return 'error' in value;
}

/** Reforge cost for an existing item. */
export function reforgeCostFor(data: ItemData): RarityCost {
  return RARITY_BY_KEY[data.rarity].reforge;
}

/** Upgrade cost + target rarity, or `undefined` for mythic items. */
export function upgradeInfoFor(data: ItemData): { target: RarityDef; cost: RarityCost } | undefined {
  const target = nextRarity(data.rarity);
  if (!target) return undefined;
  return { target, cost: target.upgrade };
}

/** Human readable reason why a cost cannot be paid. */
export function fundsProblem(player: Player, cost: RarityCost): string | undefined {
  const container = getInventory(player);
  if (!container) return 'No inventory available.';

  const dust = countItem(container, IDS.dust);
  if (dust < cost.dust) {
    return `You need §d${cost.dust} Arcane Dust§7 (you have §d${dust}§7).`;
  }
  if (cost.levels > 0 && player.level < cost.levels) {
    return `You need §a${cost.levels} XP level${cost.levels === 1 ? '' : 's'}§7 (you have §a${player.level}§7).`;
  }
  if (cost.orb) {
    const orbs = countItem(container, cost.orb);
    if (orbs < 1) return 'You need the matching §5rarity orb§7 for this upgrade.';
  }
  return undefined;
}

/** Deduct a cost. Returns false when the player cannot pay. */
function pay(player: Player, cost: RarityCost): boolean {
  const container = getInventory(player);
  if (!container) return false;
  if (fundsProblem(player, cost)) return false;

  if (!takeItems(container, IDS.dust, cost.dust)) return false;
  if (cost.orb && !takeItems(container, cost.orb, 1)) {
    // Refund the dust if the orb disappeared between the check and now.
    const refund = createDust(cost.dust);
    if (refund) giveOrDrop(player, refund);
    return false;
  }
  if (cost.levels > 0) player.addLevels(-cost.levels);
  return true;
}

/** Refund a cost (used if a mutation fails after payment). */
function refund(player: Player, cost: RarityCost): void {
  const dust = createDust(cost.dust);
  if (dust) giveOrDrop(player, dust);
  if (cost.levels > 0) player.addLevels(cost.levels);
  if (cost.orb) {
    const orb = makeStack(cost.orb, 1);
    if (orb) giveOrDrop(player, orb);
  }
}

function altarEffects(player: Player, particle: string = PARTICLES.forge, sound: string = SOUNDS.reforge): void {
  burst(player.dimension, player.location, particle, 16, 0.7, 1.5);
  playSound(player, sound, 0.9, 1);
}

// ---------------------------------------------------------------------------
// Reforge / upgrade
// ---------------------------------------------------------------------------

/** Re-roll all affixes at the item's current rarity. */
export function reforgeHeld(player: Player): AltarResult {
  const gear = getHeldGear(player);
  if (isError(gear)) return { ok: false, message: gear.error };
  if (!gear.data) return { ok: false, message: 'Only affix gear can be reforged. Socket a gem first.' };

  const cost = reforgeCostFor(gear.data);
  const problem = fundsProblem(player, cost);
  if (problem) return { ok: false, message: problem };
  if (!pay(player, cost)) return { ok: false, message: 'The altar rejects your offering.' };

  const result = reforgeItem(gear.item);
  if (!result.ok) {
    refund(player, cost);
    return { ok: false, message: result.message };
  }

  setHeldItem(player, gear.item);
  refreshPlayerNow(player);
  altarEffects(player);
  return { ok: true, message: result.message };
}

/** Raise the item one rarity tier. */
export function upgradeHeld(player: Player): AltarResult {
  const gear = getHeldGear(player);
  if (isError(gear)) return { ok: false, message: gear.error };
  if (!gear.data) return { ok: false, message: 'Only affix gear can be upgraded.' };

  const info = upgradeInfoFor(gear.data);
  if (!info) return { ok: false, message: 'This item is already §6Mythic§7.' };

  const problem = fundsProblem(player, info.cost);
  if (problem) return { ok: false, message: problem };
  if (!pay(player, info.cost)) return { ok: false, message: 'The altar rejects your offering.' };

  const result = upgradeItem(gear.item);
  if (!result.ok) {
    refund(player, info.cost);
    return { ok: false, message: result.message };
  }

  setHeldItem(player, gear.item);
  refreshPlayerNow(player);
  altarEffects(player, PARTICLES.eliteEpic, SOUNDS.upgrade);
  return { ok: true, message: result.message };
}

// ---------------------------------------------------------------------------
// Gems
// ---------------------------------------------------------------------------

/** Socket the gem found in inventory slot `gemSlot`. */
export function socketGemFromSlot(player: Player, gemSlot: number): AltarResult {
  const gear = getHeldGear(player);
  if (isError(gear)) return { ok: false, message: gear.error };

  const container = getInventory(player);
  const gemItem = container?.getItem(gemSlot);
  if (!container || !gemItem || gemItem.typeId !== IDS.gem) {
    return { ok: false, message: 'That gem is no longer in your inventory.' };
  }

  const gem = readGemData(gemItem);
  if (!gem) return { ok: false, message: 'This is a blank gem — infuse it with an affix first.' };

  const problem = fundsProblem(player, GEM_COST);
  if (problem) return { ok: false, message: problem };
  if (!pay(player, GEM_COST)) return { ok: false, message: 'The altar rejects your offering.' };

  const result = applyGem(gear.item, gem);
  if (!result.ok) {
    refund(player, GEM_COST);
    return { ok: false, message: result.message };
  }

  consumeSlot(container, gemSlot);
  setHeldItem(player, gear.item);
  refreshPlayerNow(player);
  altarEffects(player, PARTICLES.eliteRare, SOUNDS.gem);
  return { ok: true, message: result.message };
}

/** Turn a blank gem into a gem carrying the chosen affix. */
export function infuseBlankGem(player: Player, affixId: AffixId): AltarResult {
  const gear = getHeldGear(player);
  if (isError(gear)) return { ok: false, message: gear.error };
  if (!isAffixId(affixId)) return { ok: false, message: 'Unknown affix.' };

  const def = AFFIX_BY_ID[affixId];
  if (def.slot !== 'any' && def.slot !== gear.slot) {
    return { ok: false, message: `${def.name} cannot be applied to ${gear.slot === 'weapon' ? 'a weapon' : 'armour'}.` };
  }

  const container = getInventory(player);
  if (!container) return { ok: false, message: 'No inventory available.' };
  if (countBlankGems(container) <= 0) return { ok: false, message: 'You have no blank affix gems.' };

  const problem = fundsProblem(player, INFUSE_COST);
  if (problem) return { ok: false, message: problem };

  const slot = findBlankGemSlot(container);
  if (slot === undefined) return { ok: false, message: 'You have no blank affix gems.' };

  if (!pay(player, INFUSE_COST)) return { ok: false, message: 'The altar rejects your offering.' };

  const gemItem = container.getItem(slot);
  if (!gemItem) {
    refund(player, INFUSE_COST);
    return { ok: false, message: 'The blank gem vanished.' };
  }

  const gem: GemData = { affix: affixId, rarity: gear.data?.rarity ?? 'uncommon' };
  if (!writeGemData(gemItem, gem)) {
    refund(player, INFUSE_COST);
    return { ok: false, message: 'That gem refused the infusion.' };
  }

  try {
    gemItem.nameTag = gemDisplayName(gem);
    gemItem.setLore(gemLore(gem));
  } catch {
    // Cosmetic.
  }
  container.setItem(slot, gemItem);

  altarEffects(player, PARTICLES.eliteRare, SOUNDS.gem);
  return { ok: true, message: `Infused ${gemDisplayName(gem)}§7. Socket it into your held item.` };
}

// ---------------------------------------------------------------------------
// Salvage
// ---------------------------------------------------------------------------

/** Destroy the held item and return components. */
export function salvageHeld(player: Player): AltarResult {
  const gear = getHeldGear(player);
  if (isError(gear)) return { ok: false, message: gear.error };
  if (!gear.data) return { ok: false, message: 'Only affix gear can be salvaged.' };

  const rewards = rollSalvage(gear.data);
  if (!setHeldItem(player, undefined)) {
    return { ok: false, message: 'Could not remove the item from your hand.' };
  }

  const dust = createDust(rewards.dust);
  if (dust) giveOrDrop(player, dust);

  let gemText = '';
  if (rewards.gem) {
    const gem = createGem(rewards.gem.affix, rewards.gem.rarity);
    if (gem) {
      giveOrDrop(player, gem);
      gemText = ` + ${gem.nameTag ?? 'a gem'}`;
    }
  }

  let orbText = '';
  if (rewards.orb) {
    const orb = createOrb(rewards.orb, 1);
    if (orb) {
      giveOrDrop(player, orb);
      orbText = ` + ${orb.nameTag ?? 'an orb'}`;
    }
  }

  refreshPlayerNow(player);
  altarEffects(player, PARTICLES.salvage, SOUNDS.salvage);
  return {
    ok: true,
    message: `Salvaged for §d${rewards.dust} Arcane Dust§7${gemText}${orbText}.`,
  };
}

// ---------------------------------------------------------------------------
// Inspect + UI helpers
// ---------------------------------------------------------------------------

/** Multi-line inspection text for MessageFormData. */
export function inspectHeld(player: Player): AltarResult {
  const gear = getHeldGear(player);
  if (isError(gear)) return { ok: false, message: gear.error };
  if (!gear.data) return { ok: false, message: 'This item has no affix data yet. Socket a gem to begin.' };

  const data = gear.data;
  const rarity = RARITY_BY_KEY[data.rarity];
  const lines: string[] = [];

  lines.push(`§f${stripFormatting(gear.item.nameTag ?? 'Affix Item')}`);
  lines.push(
    `${rarity.color}${rarity.bold ? '§l' : ''}${rarity.name} §r§8• §7iLvl ${data.level} §8• §7${data.affixes.length}/${affixCapacity(data.rarity)} affixes`,
  );
  lines.push('§8────────────────────────');

  if (data.affixes.length === 0) {
    lines.push('§8No affixes yet.');
  } else {
    for (const affix of data.affixes) {
      const def = AFFIX_BY_ID[affix.id];
      lines.push(`${rarity.color}✦ §f${def.name} §r${affixValueText(def, affix.v)} §7${def.label}`);
    }
  }

  lines.push('§8────────────────────────');
  lines.push('§7Passive stats:');
  lines.push(...statSummaryLines(statsFromItems([data])));

  const upgrade = upgradeInfoFor(data);
  lines.push('§8────────────────────────');
  lines.push(
    upgrade
      ? `§7Upgrade: ${upgrade.target.color}${upgrade.target.name} §8(${upgrade.cost.dust} dust, ${upgrade.cost.levels} lvls, 1 orb)`
      : '§7Upgrade: §6already mythic',
  );

  return { ok: true, message: lines.join('\n') };
}

/** Affixes that could be infused into the held item (for the UI list). */
export interface AffixChoice {
  def: AffixDef;
  /** Value the affix would gain at the item's current rarity/level. */
  value: number;
}

export function listApplicableAffixes(gear: HeldGear): AffixChoice[] {
  const data = gear.data;
  const rarity = data?.rarity ?? 'uncommon';
  const level = data?.level ?? 1;
  const used = new Set<AffixId>(data?.affixes.map((affix) => affix.id) ?? []);

  return AFFIXES.filter((def) => {
    if (used.has(def.id)) return false;
    return def.slot === 'any' || def.slot === gear.slot;
  }).map((def) => ({ def, value: rollAffixValue(def, rarity, level) }));
}

/** Short description of the currently held item for the altar header. */
export function heldItemSummary(player: Player): string {
  const gear = getHeldGear(player);
  if (isError(gear)) return gear.error;
  const data = gear.data;
  if (!data) return `${gear.item.nameTag ?? 'Unaffixed item'} §8(no affixes)`;
  const rarity = RARITY_BY_KEY[data.rarity];
  return `${rarity.color}${stripFormatting(gear.item.nameTag ?? 'Affix Item')} §7(${rarity.name} iLvl ${data.level})`;
}

/** Expose the gem slot list so the UI can map button indices. */
export function gemSlots(player: Player): ReturnType<typeof findGemSlots> {
  const container = getInventory(player);
  return container ? findGemSlots(container) : [];
}

/** True when the held item can be worked at all. */
export function hasWorkableHeldItem(player: Player): boolean {
  return isAffixItem(getHeldItem(player));
}
