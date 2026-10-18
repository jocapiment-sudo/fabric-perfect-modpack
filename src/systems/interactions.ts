/**
 * ============================================================================
 *  Interaction router
 * ============================================================================
 *  All block/item interactions are handled through `world.beforeEvents.itemUseOn`
 *  (available since the 1.10 module) so we can:
 *
 *    - cancel the vanilla interaction (e.g. stop a tuning fork from placing a
 *      block or a spawn egg from changing a spawner),
 *    - defer the actual UI/world mutation to `system.run`, because before
 *      events run in a read-only context.
 *
 *  Air interactions (codex, effigy, hints) use the regular `itemUse` event.
 * ============================================================================
 */

import {
  system,
  world,
  type Block,
  type ItemStack,
  type Player,
} from '@minecraft/server';

import { IDS } from '../config';
import { consumeSlot, getInventory } from '../core/inventory';
import { readGemData } from '../core/itemData';
import { actionBar, tell } from '../util/feedback';
import { openAltar } from '../ui/altarUI';
import { openCodex } from '../ui/codexUI';
import { handleSpawnerUse } from '../ui/spawnerUI';
import { summonRitual } from './bosses';

/** Hotbar spam guard (ms). */
const USE_COOLDOWN_MS = 250;
const lastUse = new Map<string, number>();

function throttled(player: Player): boolean {
  const now = Date.now();
  const previous = lastUse.get(player.id) ?? 0;
  if (now - previous < USE_COOLDOWN_MS) return true;
  lastUse.set(player.id, now);
  return false;
}

/** Remove one effigy from the player's inventory. */
function consumeEffigy(player: Player): boolean {
  const container = getInventory(player);
  if (!container) return false;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId === IDS.effigy) {
      consumeSlot(container, slot);
      return true;
    }
  }
  return false;
}

function isAltar(block: Block): boolean {
  try {
    return block.permutation.matches(IDS.altar);
  } catch {
    return false;
  }
}

function isSpawnerLike(block: Block): boolean {
  try {
    return block.permutation.matches(IDS.spawner) || block.permutation.matches(IDS.vanillaSpawner);
  } catch {
    return false;
  }
}

/**
 * Decide whether an item used on a block should be intercepted.
 * Returns true when the vanilla interaction must be cancelled.
 */
function intercept(player: Player, block: Block, item: ItemStack): boolean {
  // --- Codex: opens anywhere -------------------------------------------------
  if (item.typeId === IDS.codex) {
    system.run(() => openCodex(player));
    return true;
  }

  // --- Effigy: summons a random elite ---------------------------------------
  // Inventory writes are illegal inside before events, so the whole flow is
  // deferred to the next writable tick.
  if (item.typeId === IDS.effigy) {
    system.run(() => {
      if (consumeEffigy(player)) {
        summonRitual(player);
      } else {
        tell(player, '§cYour effigy is missing.');
      }
    });
    return true;
  }

  // --- Reforging hammer ------------------------------------------------------
  if (item.typeId === IDS.hammer) {
    if (isAltar(block)) {
      system.run(() => openAltar(player));
      return true;
    }
    tell(player, '§7Use the §fReforging Hammer§7 on a §5Reforging Altar§7.');
    return false;
  }

  // --- Spawner tuning fork ---------------------------------------------------
  if (item.typeId === IDS.fork) {
    if (isSpawnerLike(block)) {
      system.run(() => handleSpawnerUse(player, block));
      return true;
    }
    tell(player, '§7Use the §fSpawner Tuning Fork§7 on a §8Mob Spawner§7.');
    return false;
  }

  // --- Gems: hint when used on the altar without a hammer -------------------
  if (item.typeId === IDS.gem && isAltar(block)) {
    const gem = readGemData(item);
    tell(player, gem ? '§7The altar needs its §fReforging Hammer§7 to socket gems.' : '§7This gem is blank. Infuse it at the altar.');
    return false;
  }

  return false;
}

/** beforeEvents.itemUseOn: cancel and defer world mutations. */
function onItemUseOn(player: Player, block: Block, item: ItemStack): void {
  if (throttled(player)) return;
  intercept(player, block, item);
}

/**
 * Air use: codex pages, effigy summon, contextual hints.
 * Runs in a normal (writable) after-event context.
 */
function onItemUse(player: Player, item: ItemStack): void {
  if (throttled(player)) return;

  if (item.typeId === IDS.codex) {
    openCodex(player);
    return;
  }

  if (item.typeId === IDS.effigy) {
    if (consumeEffigy(player)) summonRitual(player);
    return;
  }

  if (item.typeId === IDS.hammer) {
    actionBar(player, '§7Use on a §5Reforging Altar§7 to open the forge.');
    return;
  }

  if (item.typeId === IDS.fork) {
    actionBar(player, '§7Use on a §8Mob Spawner§7 to bind and tune it.');
    return;
  }

  if (item.typeId === IDS.gem) {
    actionBar(player, '§7Socket gems at a §5Reforging Altar§7.');
  }
}

/** Register every interaction listener. */
export function startInteractions(): void {
  world.beforeEvents.itemUseOn.subscribe((event) => {
    try {
      onItemUseOn(event.source, event.block, event.itemStack);
      // Always cancel our tools' block interactions to avoid double-fire.
      if (
        event.itemStack.typeId === IDS.codex ||
        event.itemStack.typeId === IDS.effigy ||
        (event.itemStack.typeId === IDS.hammer && isAltar(event.block)) ||
        (event.itemStack.typeId === IDS.fork && isSpawnerLike(event.block))
      ) {
        event.cancel = true;
      }
    } catch (error) {
      console.warn(`[Apotheosis] itemUseOn handler failed: ${String(error)}`);
    }
  });

  world.afterEvents.itemUse.subscribe((event) => {
    try {
      onItemUse(event.source, event.itemStack);
    } catch (error) {
      console.warn(`[Apotheosis] itemUse handler failed: ${String(error)}`);
    }
  });

  world.afterEvents.playerLeave.subscribe((event) => {
    lastUse.delete(event.playerId);
  });

}
