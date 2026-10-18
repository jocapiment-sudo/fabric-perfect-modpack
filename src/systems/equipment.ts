/**
 * ============================================================================
 *  Equipment -> vanilla effect bridge
 * ============================================================================
 *  Bedrock's stable Script API exposes attribute *readers* only
 *  (`EntityHealthComponent.currentValue`, …); there is no `addModifier` API
 *  for arbitrary attributes. To make affix stats behave like dynamic
 *  attributes we:
 *
 *    1. Scan all six equipment slots every 10 ticks.
 *    2. Aggregate affixes into a StatBlock.
 *    3. Mirror passive stats onto the player using hidden, continuously
 *       refreshed vanilla effects (health boost, speed, resistance, …).
 *    4. Hand combat-only stats (crit, lifesteal, thorns, …) to the combat
 *       system.
 *
 *  Effects are re-applied every 2 s with a 8 s duration so they never blink,
 *  and are removed as soon as the item that granted them is unequipped.
 * ============================================================================
 */

import {
  EntityComponentTypes,
  EquipmentSlot,
  system,
  world,
  type EntityEquippableComponent,
  type EntityHealthComponent,
  type ItemStack,
  type Player,
} from '@minecraft/server';

import { DP, TICK } from '../config';
import { readItemData, type ItemData } from '../core/itemData';
import { statsFromItems, type StatBlock } from '../core/stats';

/** Equipment slots that contribute affix stats. */
const STAT_SLOTS: readonly EquipmentSlot[] = [
  EquipmentSlot.Mainhand,
  EquipmentSlot.Offhand,
  EquipmentSlot.Head,
  EquipmentSlot.Chest,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
];

/** Long enough to survive between refreshes, short enough to clean itself up. */
const EFFECT_DURATION = 160;
/** How many 10-tick scans between forced refreshes (40 ticks = 2 s). */
const REFRESH_EVERY_SCANS = Math.max(1, Math.floor(TICK.equipmentRefresh / TICK.equipmentScan));

interface PlayerGearState {
  signature: string;
  stats: StatBlock;
  /** effect id -> amplifier we applied. */
  applied: Map<string, number>;
  scansSinceRefresh: number;
}

const states = new Map<string, PlayerGearState>();

/** Read every equipped item and build a change-detection signature. */
function readGear(player: Player): { signature: string; data: (ItemData | undefined)[] } {
  const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
  const data: (ItemData | undefined)[] = [];
  let signature = '';

  for (const slot of STAT_SLOTS) {
    let item: ItemStack | undefined;
    try {
      item = equippable?.getEquipment(slot);
    } catch {
      item = undefined;
    }

    if (!item) {
      signature += `${slot}:;`;
      data.push(undefined);
      continue;
    }

    // Raw payload in the signature means reforges are detected immediately.
    let raw = '';
    try {
      raw = String(item.getDynamicProperty(DP.item) ?? '');
    } catch {
      raw = '';
    }
    signature += `${slot}:${item.typeId}:${raw};`;
    data.push(readItemData(item));
  }

  return { signature, data };
}

/**
 * Convert passive stats into the effect plan.
 * Amplifiers are capped so vanilla effect ranges stay sane.
 */
function effectPlan(stats: StatBlock): Map<string, number> {
  const plan = new Map<string, number>();

  // Health boost: amplifier 0 = +4 HP in Bedrock (2 hearts).
  const healthAmp = Math.min(4, Math.floor(stats.health / 4));
  if (healthAmp > 0) plan.set('health_boost', healthAmp);

  // Speed / resistance: each amplifier is 20 %.
  const speedAmp = Math.min(3, Math.floor(stats.speedPct / 0.2));
  if (speedAmp > 0) plan.set('speed', speedAmp);

  const resistanceAmp = Math.min(3, Math.floor(stats.resistancePct / 0.2));
  if (resistanceAmp > 0) plan.set('resistance', resistanceAmp);

  // Absorption: amplifier 0 already grants a full 2 hearts.
  if (stats.absorptionHp > 0) {
    plan.set('absorption', Math.min(3, Math.floor((stats.absorptionHp - 1) / 4)));
  }

  if (stats.fireResSeconds > 0) plan.set('fire_resistance', 0);
  if (stats.waterBreathingSeconds > 0) plan.set('water_breathing', 0);
  if (stats.jumpAmp > 0) plan.set('jump_boost', Math.min(3, Math.round(stats.jumpAmp)));
  if (stats.luckAmp > 0) plan.set('luck', Math.min(4, Math.round(stats.luckAmp)));

  return plan;
}

/** Duration for temporary effects, extended by affixes that grant seconds. */
function effectDuration(stats: StatBlock): number {
  const longest = Math.max(stats.fireResSeconds, stats.waterBreathingSeconds) * 20;
  return Math.max(EFFECT_DURATION, longest + 60);
}

/**
 * Reconcile the player's effect state with the desired plan.
 * `forceRefresh` re-applies every effect so durations never lapse.
 */
function applyStats(player: Player, stats: StatBlock, state: PlayerGearState, forceRefresh: boolean): void {
  const plan = effectPlan(stats);
  const duration = effectDuration(stats);

  // 1. Remove effects we own that are no longer wanted or should be weaker.
  for (const [effect, amplifier] of [...state.applied.entries()]) {
    const wanted = plan.get(effect);
    if (wanted === undefined || wanted < amplifier) {
      try {
        player.removeEffect(effect);
      } catch {
        // Invalid effect id / player gone.
      }
      state.applied.delete(effect);
    }
  }

  // 2. Apply / refresh wanted effects.
  for (const [effect, amplifier] of plan) {
    if (!forceRefresh && state.applied.get(effect) === amplifier) continue;
    try {
      player.addEffect(effect, duration, { amplifier, showParticles: false });
      state.applied.set(effect, amplifier);
    } catch {
      // Keep going: one bad effect must not blank the rest.
    }
  }

  // 3. Health boost changes max HP; make sure a stale value is clamped.
  try {
    const health = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
    if (health && health.currentValue > health.effectiveMax) {
      health.setCurrentValue(health.effectiveMax);
    }
  } catch {
    // Ignore transient reads during dimension changes.
  }
}

/** Scan one player, recomputing only when their gear changed. */
function tickPlayer(player: Player): void {
  const { signature, data } = readGear(player);
  const existing = states.get(player.id);

  if (!existing || existing.signature !== signature) {
    const stats = statsFromItems(data);
    const state: PlayerGearState = {
      signature,
      stats,
      applied: existing?.applied ?? new Map<string, number>(),
      scansSinceRefresh: 0,
    };
    states.set(player.id, state);
    applyStats(player, stats, state, true);
    return;
  }

  existing.scansSinceRefresh++;
  if (existing.scansSinceRefresh >= REFRESH_EVERY_SCANS) {
    existing.scansSinceRefresh = 0;
    applyStats(player, existing.stats, existing, true);
  }
}

/** Force a rescan (called by the altar after it mutates gear). */
export function refreshPlayerNow(player: Player): StatBlock {
  const { signature, data } = readGear(player);
  const stats = statsFromItems(data);
  const state: PlayerGearState = {
    signature,
    stats,
    applied: states.get(player.id)?.applied ?? new Map<string, number>(),
    scansSinceRefresh: 0,
  };
  states.set(player.id, state);
  applyStats(player, stats, state, true);
  return stats;
}

/** Drop a cached state (e.g. after a UI transaction). */
export function invalidatePlayer(playerId: string): void {
  states.delete(playerId);
}

/** Current aggregated stats for a player (computes on demand). */
export function getPlayerStats(player: Player): StatBlock {
  const cached = states.get(player.id);
  if (cached) return cached.stats;
  return refreshPlayerNow(player);
}

/** Start the recurring scan. Called once from `main.ts`. */
export function startEquipmentSystem(): void {
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      try {
        tickPlayer(player);
      } catch (error) {
        console.warn(`[Apotheosis] Equipment scan failed for ${player.name}: ${String(error)}`);
      }
    }
  }, TICK.equipmentScan);

  // Players respawn with cleared effects; refresh their gear immediately.
  world.afterEvents.playerSpawn.subscribe((event) => {
    if (!event.initialSpawn) refreshPlayerNow(event.player);
  });

  world.afterEvents.playerLeave.subscribe((event) => {
    states.delete(event.playerId);
  });
}
