/**
 * ============================================================================
 *  Combat hooks
 * ============================================================================
 *  The effect bridge handles passive stats; this system implements the
 *  on-hit / on-hurt behaviours that cannot be expressed as a vanilla effect:
 *
 *    crit        -> bonus burst damage + crit particles
 *    thunderous  -> bonus "smite" damage
 *    blazing     -> set target on fire
 *    frostbound  -> slowness on the target
 *    hunter      -> bonus damage against elites
 *    lifesteal   -> heal the attacker
 *    thorns      -> reflect damage onto melee attackers
 *    bulwark     -> chance to cancel knockback one tick later
 *    sage        -> bonus XP on kills
 *
 *  NOTE: Bedrock does not expose the player's real attack attribute, so bonus
 *  damage uses the vanilla weapon damage table in `core/gear.ts`. Values are
 *  deliberately conservative to avoid one-shot outliers.
 * ============================================================================
 */

import {
  EntityComponentTypes,
  EntityDamageCause,
  system,
  world,
  type Entity,
  type EntityHealthComponent,
  type Player,
} from '@minecraft/server';

import { PARTICLES, SOUNDS, TAGS } from '../config';
import { estimatedWeaponDamage } from '../core/gear';
import { getHeldItem } from '../core/inventory';
import { readItemData } from '../core/itemData';
import { RARITY_BY_KEY } from '../core/rarity';
import { actionBar, burst, playSound } from '../util/feedback';
import { chance } from '../util/random';
import { getPlayerStats } from './equipment';
import { stripFormatting } from '../util/text';
import { dropEliteLoot } from './bosses';

/** True for player entities without relying on `instanceof`. */
function isPlayer(entity: Entity | undefined): entity is Player {
  return entity !== undefined && entity.typeId === 'minecraft:player';
}

/** Heal a player without exceeding their current max health. */
function heal(player: Player, amount: number): void {
  if (amount <= 0) return;
  try {
    const health = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
    if (!health) return;
    health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + amount));
    burst(player.dimension, player.location, PARTICLES.heal, 3, 0.4, 1.2);
  } catch {
    // Player left / read-only context.
  }
}

/** Melee hit resolution: weapon affixes trigger here. */
function onEntityHit(event: { damagingEntity: Entity; hitEntity: Entity }): void {
  const attacker = event.damagingEntity;
  if (!isPlayer(attacker)) return;

  const target = event.hitEntity;
  if (!target.isValid()) return;

  const stats = getPlayerStats(attacker);
  const weapon = getHeldItem(attacker);
  const weaponData = weapon ? readItemData(weapon) : undefined;
  const tier = weaponData ? RARITY_BY_KEY[weaponData.rarity].tier : 0;
  const baseDamage = weapon ? estimatedWeaponDamage(weapon.typeId) : 1;

  let bonus = 0;
  let critical = false;
  let smited = false;

  // --- Keen: critical strikes -----------------------------------------------
  if (stats.crit > 0 && chance(stats.crit)) {
    bonus += Math.max(1, Math.round(baseDamage * 0.75));
    critical = true;
    burst(target.dimension, { x: target.location.x, y: target.location.y + 1, z: target.location.z }, PARTICLES.crit, 8, 0.5, 0.6);
  }

  // --- Thunderous: extra smite damage ---------------------------------------
  if (stats.thunderChance > 0 && chance(stats.thunderChance)) {
    bonus += 4 + tier * 2;
    smited = true;
    burst(target.dimension, { x: target.location.x, y: target.location.y + 1.5, z: target.location.z }, PARTICLES.thunder, 6, 0.35, 0.8);
    playSound(attacker, SOUNDS.upgrade, 0.35, 1.6);
  }

  // --- Hunter: bonus damage against elites ----------------------------------
  if (stats.eliteDamage > 0 && target.hasTag(TAGS.elite)) {
    bonus += Math.max(1, Math.round(baseDamage * stats.eliteDamage));
  }

  if (bonus > 0) {
    try {
      target.applyDamage(bonus, { cause: EntityDamageCause.entityAttack, damagingEntity: attacker });
    } catch {
      // Target may have died from the vanilla hit first.
    }
  }

  // --- Blazing / Frostbound -------------------------------------------------
  if (stats.fireSeconds > 0) {
    try {
      target.setOnFire(stats.fireSeconds, true);
      burst(target.dimension, { x: target.location.x, y: target.location.y + 1, z: target.location.z }, 'minecraft:basic_flame_particle', 4, 0.3, 0.5);
    } catch {
      // Some entities are fire-immune / invulnerable.
    }
  }

  if (stats.frostTicks > 0) {
    try {
      target.addEffect('slowness', Math.round(stats.frostTicks), {
        amplifier: tier >= 3 ? 1 : 0,
        showParticles: true,
      });
      burst(target.dimension, { x: target.location.x, y: target.location.y + 1, z: target.location.z }, PARTICLES.frost, 5, 0.4, 0.6);
    } catch {
      // Ignore immunity.
    }
  }

  // --- Vampiric: lifesteal ---------------------------------------------------
  if (stats.lifesteal > 0) {
    heal(attacker, Math.max(1, Math.round((baseDamage + bonus) * stats.lifesteal)));
  }

  if (critical) playSound(attacker, SOUNDS.uiClick, 0.5, 1.8);
  if (smited) playSound(attacker, SOUNDS.bossHurt, 0.4, 1.4);
}

/** Being hit: knockback resistance + thorns. */
function onEntityHurt(event: {
  damage: number;
  hurtEntity: Entity;
  damageSource: { damagingEntity?: Entity };
}): void {
  if (!isPlayer(event.hurtEntity)) return;
  const player = event.hurtEntity;
  if (event.damage <= 0) return;

  const stats = getPlayerStats(player);
  const attacker = event.damageSource.damagingEntity;

  // --- Bulwark / Warden: probabilistic knockback cancellation ---------------
  if (stats.kbResistPct > 0 && chance(stats.kbResistPct)) {
    system.runTimeout(() => {
      try {
        if (player.isValid()) player.clearVelocity();
      } catch {
        // Player gone.
      }
    }, 1);
  }

  // --- Thorns: reflect flat damage -----------------------------------------
  if (stats.thorns > 0 && attacker && attacker.isValid() && attacker.id !== player.id) {
    try {
      attacker.applyDamage(Math.round(stats.thorns), {
        cause: EntityDamageCause.entityAttack,
        damagingEntity: player,
      });
      burst(attacker.dimension, { x: attacker.location.x, y: attacker.location.y + 1, z: attacker.location.z }, PARTICLES.crit, 3, 0.3, 0.4);
    } catch {
      // Attacker vanished or is immune.
    }
  }
}

/** Kill resolution: elite loot + Sage XP bonus. */
function onEntityDie(event: { deadEntity: Entity; damageSource: { damagingEntity?: Entity } }): void {
  const killer = event.damageSource.damagingEntity;
  if (!isPlayer(killer)) return;

  const dead = event.deadEntity;
  const stats = getPlayerStats(killer);

  if (dead.hasTag(TAGS.elite)) {
    try {
      dropEliteLoot(dead, killer);
    } catch (error) {
      console.warn(`[Apotheosis] Elite loot failed: ${String(error)}`);
    }
  }

  if (stats.xpBonus > 0) {
    try {
      const gained = Math.max(1, Math.round(stats.xpBonus));
      killer.addExperience(gained);
      actionBar(killer, `§b+${gained} XP §7(Sage)`);
    } catch {
      // Ignore XP failures.
    }
  } else if (dead.hasTag(TAGS.elite)) {
    tellKill(killer, dead);
  }
}

/** Small quality-of-life message when an elite dies without Sage. */
function tellKill(player: Player, dead: Entity): void {
  const name = stripFormatting(dead.nameTag || 'Elite');
  player.sendMessage(`§8[§5Apotheosis§8] §7You felled §6${name}§7.`);
}

/** Register every combat subscription. */
export function startCombatSystem(): void {
  world.afterEvents.entityHitEntity.subscribe((event) => {
    try {
      onEntityHit(event);
    } catch (error) {
      console.warn(`[Apotheosis] Hit handler failed: ${String(error)}`);
    }
  });

  world.afterEvents.entityHurt.subscribe((event) => {
    try {
      onEntityHurt(event);
    } catch (error) {
      console.warn(`[Apotheosis] Hurt handler failed: ${String(error)}`);
    }
  });

  world.afterEvents.entityDie.subscribe((event) => {
    try {
      onEntityDie(event);
    } catch (error) {
      console.warn(`[Apotheosis] Death handler failed: ${String(error)}`);
    }
  });
}
