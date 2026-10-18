/**
 * ============================================================================
 *  Item payload (dynamic properties)
 * ============================================================================
 *  Bedrock does not let scripts write arbitrary item NBT, but non-stackable
 *  items support dynamic properties. We store a compact JSON payload there:
 *
 *      { "v":1, "r":"epic", "l":27, "a":[["keen",0.14],["berserker",4]], "b":"…" }
 *
 *  Keys are shortened because dynamic-property payloads are saved with the
 *  world. `version` allows future migrations without losing gear.
 * ============================================================================
 */

import type { ItemStack } from '@minecraft/server';

import { DP, MAX_AFFIXES } from '../config';
import {
  AFFIX_BY_ID,
  isAffixId,
  type AffixId,
  type AffixInstance,
} from './affixes';
import { isRarityKey, type RarityKey } from './rarity';

export const ITEM_DATA_VERSION = 1;

export interface ItemData {
  version: 1;
  rarity: RarityKey;
  /** Item level; scales affix potency and is shown in the tooltip. */
  level: number;
  affixes: AffixInstance[];
  /** Name of the elite that dropped the item (flavour line). */
  boss?: string;
  /** Number of times the item has been reforged. */
  reforges: number;
}

/** Wire format actually stored on the item. */
interface StoredItemData {
  v: number;
  r: string;
  l: number;
  a: [string, number][];
  b?: string;
  n?: number;
}

/**
 * Read and validate the affix payload from an ItemStack.
 * Any malformed data is treated as "not an affix item" rather than crashing.
 */
export function readItemData(item: ItemStack): ItemData | undefined {
  try {
    const raw = item.getDynamicProperty(DP.item);
    if (typeof raw !== 'string' || raw.length === 0) return undefined;

    const stored = JSON.parse(raw) as Partial<StoredItemData>;
    if (stored.v !== ITEM_DATA_VERSION) return undefined;
    if (!isRarityKey(stored.r)) return undefined;

    const level = Number(stored.l);
    const affixes: AffixInstance[] = [];
    const seen = new Set<AffixId>();

    if (Array.isArray(stored.a)) {
      for (const entry of stored.a) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [id, value] = entry;
        if (!isAffixId(id) || seen.has(id)) continue;
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) continue;
        seen.add(id);
        affixes.push({ id, v: numeric });
      }
    }

    return {
      version: 1,
      rarity: stored.r,
      level: Number.isFinite(level) && level > 0 ? Math.floor(level) : 1,
      affixes: affixes.slice(0, MAX_AFFIXES),
      boss: typeof stored.b === 'string' ? stored.b : undefined,
      reforges: Number.isFinite(Number(stored.n)) ? Math.max(0, Math.floor(Number(stored.n))) : 0,
    };
  } catch (error) {
    console.warn(`[Apotheosis] Failed to read item data: ${String(error)}`);
    return undefined;
  }
}

/**
 * Persist the affix payload. Returns false when the item cannot store dynamic
 * properties (e.g. a stackable item), so callers can show a friendly error.
 */
export function writeItemData(item: ItemStack, data: ItemData): boolean {
  try {
    const stored: StoredItemData = {
      v: ITEM_DATA_VERSION,
      r: data.rarity,
      l: data.level,
      a: data.affixes.map((affix) => [affix.id, affix.v]),
      ...(data.boss ? { b: data.boss } : {}),
      ...(data.reforges > 0 ? { n: data.reforges } : {}),
    };
    item.setDynamicProperty(DP.item, JSON.stringify(stored));
    return true;
  } catch (error) {
    console.warn(`[Apotheosis] Failed to write item data: ${String(error)}`);
    return false;
  }
}

/** Remove the affix payload (used when an item is completely drained). */
export function clearItemData(item: ItemStack): void {
  try {
    item.setDynamicProperty(DP.item, undefined);
  } catch {
    // Stackable items throw; nothing to clear.
  }
}

/** True when the item carries any affix payload. */
export function isAffixItem(item: ItemStack | undefined): item is ItemStack {
  if (!item) return false;
  try {
    return item.getDynamicProperty(DP.item) !== undefined;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Affix gems
// ---------------------------------------------------------------------------

export interface GemData {
  affix: AffixId;
  /** Rarity of the gem; determines the potency applied to the item. */
  rarity: RarityKey;
}

/** Read a gem payload from an `apotheosis:affix_gem` stack. */
export function readGemData(item: ItemStack): GemData | undefined {
  try {
    const raw = item.getDynamicProperty(DP.gem);
    if (typeof raw !== 'string' || raw.length === 0) return undefined;
    const stored = JSON.parse(raw) as { i?: unknown; r?: unknown };
    if (!isAffixId(stored.i) || !isRarityKey(stored.r)) return undefined;
    return { affix: stored.i, rarity: stored.r };
  } catch {
    return undefined;
  }
}

/** Write a gem payload. */
export function writeGemData(item: ItemStack, gem: GemData): boolean {
  try {
    item.setDynamicProperty(DP.gem, JSON.stringify({ i: gem.affix, r: gem.rarity }));
    return true;
  } catch {
    return false;
  }
}

/** Convenience: the display name of a gem's affix. */
export function gemAffixName(gem: GemData): string {
  return AFFIX_BY_ID[gem.affix].name;
}
