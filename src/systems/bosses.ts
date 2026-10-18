/**
 * ============================================================================
 *  Affix bosses (elite mini-bosses)
 * ============================================================================
 *  Custom entity JSON files define the physical shell (health, hitbox, AI,
 *  baseline gear). This module adds the dynamic layer:
 *
 *    - rarity-weighted promotion of naturally spawned undead,
 *    - coloured names + rarity tags,
 *    - affix weapons/armour equipped at spawn,
 *    - aura particles, a boss health bar and a low-health enrage phase,
 *    - rarity-scaled loot drops (dust, gems, orbs, affix gear).
 *
 *  Elites never despawn (the entity JSON is marked persistent) and are capped
 *  per dimension via the runtime settings.
 * ============================================================================
 */

import {
  EntityComponentTypes,
  EntityInitializationCause,
  EquipmentSlot,
  system,
  world,
  type Dimension,
  type Entity,
  type EntityEquippableComponent,
  type EntityHealthComponent,
  type Player,
  type Vector3,
} from '@minecraft/server';

import { DP, NATURAL_ELITE_SOURCES, PARTICLES, RARITY_TAG_PREFIX, SOUNDS, TAGS, TICK } from '../config';
import { AFFIXES } from '../core/affixes';
import { ARMOR_SETS, buildEliteName, eliteByEntityId, pickElite, type EliteDef } from '../core/elites';
import {
  createAffixItem,
  createDust,
  createGem,
  createOrb,
  createRandomGearDrop,
  makeStack,
} from '../core/itemFactory';
import { isRarityKey, RARITY_BY_KEY, rollRarity, type RarityKey } from '../core/rarity';
import { actionBar, burst, playSoundAt, tell } from '../util/feedback';
import { chance, pick, randFloat, randInt } from '../util/random';
import { healthBar, percent, stripFormatting } from '../util/text';
import { loadSettings } from '../util/store';

/** Long duration used for elite buffs; refreshed on spawn/death only. */
const ELITE_EFFECT_TICKS = 2_000_000;

/** Rarity stored on the elite via dynamic property / tag. */
export function eliteRarityOf(entity: Entity): RarityKey | undefined {
  try {
    const raw = entity.getDynamicProperty(DP.rarity);
    if (isRarityKey(raw)) return raw;
  } catch {
    // Fall through to tags.
  }
  const tag = entity.getTags().find((value) => value.startsWith(RARITY_TAG_PREFIX));
  if (tag) {
    const key = tag.slice(RARITY_TAG_PREFIX.length);
    if (isRarityKey(key)) return key;
  }
  return eliteByEntityId(entity.typeId)?.rarity;
}

/** Apply the passive buffs that make an elite feel like a mini-boss. */
function applyEliteBuffs(entity: Entity, def: EliteDef, rarity: RarityKey): void {
  const tier = RARITY_BY_KEY[rarity].tier;
  try {
    entity.addEffect('health_boost', ELITE_EFFECT_TICKS, { amplifier: Math.min(4, tier), showParticles: false });
    entity.addEffect('speed', ELITE_EFFECT_TICKS, { amplifier: Math.min(2, Math.max(0, tier - 1)), showParticles: false });
    entity.addEffect('strength', ELITE_EFFECT_TICKS, { amplifier: Math.min(2, Math.max(0, tier - 1)), showParticles: false });
    entity.addEffect('resistance', ELITE_EFFECT_TICKS, { amplifier: tier >= 3 ? 1 : 0, showParticles: false });
    if (def.fireImmune) entity.addEffect('fire_resistance', ELITE_EFFECT_TICKS, { amplifier: 0, showParticles: false });

    const health = entity.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
    if (health) health.setCurrentValue(health.effectiveMax);

    // Health boost may not be reflected in `effectiveMax` until the next tick.
    system.runTimeout(() => {
      try {
        if (!entity.isValid()) return;
        const delayed = entity.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
        if (delayed) delayed.setCurrentValue(delayed.effectiveMax);
      } catch {
        // Entity removed before the top-up.
      }
    }, 1);
  } catch (error) {
    console.warn(`[Apotheosis] Could not buff elite: ${String(error)}`);
  }
}

/** Give the elite rarity-appropriate affix gear (visual + lore). */
function equipElite(entity: Entity, def: EliteDef, rarity: RarityKey): void {
  const equippable = entity.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
  if (!equippable) return;

  const tier = RARITY_BY_KEY[rarity].tier;
  const armor = ARMOR_SETS[def.armor];
  const armorSlots = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet] as const;

  armor.forEach((typeId, index) => {
    const slot = armorSlots[index];
    if (!slot) return;
    const piece = createAffixItem(typeId, rarity, { level: 18 + tier * 5, enchant: true }) ?? makeStack(typeId);
    if (piece) {
      try {
        equippable.setEquipment(slot, piece);
      } catch {
        // Entity may not support that slot.
      }
    }
  });

  const weapon =
    createAffixItem(def.weapon, rarity, { level: 22 + tier * 5, enchant: true }) ?? makeStack(def.weapon);
  if (weapon) {
    try {
      equippable.setEquipment(EquipmentSlot.Mainhand, weapon);
    } catch {
      // Ignore.
    }
  }
}

/** Add tags, name, buffs and gear to a freshly spawned elite. */
function decorateElite(entity: Entity, def: EliteDef, rarity: RarityKey): void {
  const rarityDef = RARITY_BY_KEY[rarity];
  try {
    entity.addTag(TAGS.elite);
    entity.addTag(`${RARITY_TAG_PREFIX}${rarity}`);
    entity.removeTag(TAGS.enraged);
    entity.setDynamicProperty(DP.rarity, rarity);
    entity.nameTag = buildEliteName(def, rarityDef.color, rarityDef.name);
    entity.addTag(TAGS.noElite); // never re-promote an elite
  } catch (error) {
    console.warn(`[Apotheosis] Could not decorate elite: ${String(error)}`);
  }

  equipElite(entity, def, rarity);
  applyEliteBuffs(entity, def, rarity);
}

export interface SpawnEliteOptions {
  /** Show particles / boss-arrival feedback. */
  announce?: boolean;
  /** Tag applied to the elite (e.g. `apoth:summoned`). */
  tag?: string;
}

/**
 * Spawn an elite of the requested rarity at a location.
 * Returns `undefined` if the custom entity is missing or spawning failed.
 */
export function spawnElite(
  dimension: Dimension,
  location: Vector3,
  rarity: RarityKey,
  options: SpawnEliteOptions = {},
): Entity | undefined {
  const def = pickElite(rarity);
  if (!def) {
    console.warn(`[Apotheosis] No elite definition for rarity "${rarity}".`);
    return undefined;
  }

  try {
    const entity = dimension.spawnEntity(def.entityId, location);
    decorateElite(entity, def, rarity);
    if (options.tag) entity.addTag(options.tag);

    if (options.announce !== false) {
      burst(dimension, location, RARITY_BY_KEY[rarity].particle, 30, 1.4, 2.0);
      playSoundAt(location, SOUNDS.bossSpawn, 0.55, 1);
      for (const player of dimension.getPlayers({ location, maxDistance: 40 })) {
        actionBar(player, `§c☠ An elite has awakened §8— ${RARITY_BY_KEY[rarity].color}${RARITY_BY_KEY[rarity].name}`);
      }
    }
    return entity;
  } catch (error) {
    console.warn(`[Apotheosis] Failed to spawn elite "${def.entityId}": ${String(error)}`);
    return undefined;
  }
}

/**
 * Natural-spawn promotion: 4 % (configurable) of eligible undead become
 * elites, capped per dimension. The vanilla mob is replaced so no duplicate
 * entity is left behind.
 */
function onEntitySpawn(event: { cause: EntityInitializationCause; entity: Entity }): void {
  if (event.cause !== EntityInitializationCause.Spawned) return;

  const entity = event.entity;
  if (entity.typeId === 'minecraft:player') return;
  if (!NATURAL_ELITE_SOURCES.includes(entity.typeId)) return;
  if (entity.hasTag(TAGS.elite) || entity.hasTag(TAGS.noElite)) return;
  if (entity.getComponent(EntityComponentTypes.IsBaby)) return;

  const settings = loadSettings();
  if (!settings.naturalElites || !chance(settings.eliteChance)) return;

  try {
    const existing = entity.dimension.getEntities({ tags: [TAGS.elite] });
    if (existing.length >= settings.maxElitesPerDimension) return;
  } catch {
    return;
  }

  // Natural elites skew towards lower rarities; luck nudges them upward.
  const rarity = rollRarity({ minTier: 1, luck: 0.15 });
  const location = { ...entity.location };
  const dimension = entity.dimension;

  const elite = spawnElite(dimension, location, rarity, { announce: false });
  if (!elite) return;

  try {
    entity.remove();
  } catch {
    // If removal fails (e.g. entity already gone), leave it; the elite is live.
  }

  burst(dimension, location, RARITY_BY_KEY[rarity].particle, 18, 1, 2);
  for (const player of dimension.getPlayers({ location, maxDistance: 36 })) {
    const label = stripFormatting(elite.nameTag);
    tell(player, `§8[§5Apotheosis§8] §7A ${RARITY_BY_KEY[rarity].color}${RARITY_BY_KEY[rarity].name}§7 elite stirs: §f${label}`);
  }
}

/** Show a boss bar and spawn aura particles for nearby players. */
function bossAuraTick(): void {
  for (const player of world.getAllPlayers()) {
    let closest: Entity | undefined;
    let closestDistance = Number.MAX_VALUE;

    let elites: Entity[] = [];
    try {
      elites = player.dimension.getEntities({
        location: player.location,
        maxDistance: 32,
        tags: [TAGS.elite],
      });
    } catch {
      continue;
    }

    for (const elite of elites) {
      if (!elite.isValid()) continue;

      const rarity = eliteRarityOf(elite) ?? 'common';
      const rarityDef = RARITY_BY_KEY[rarity];

      // Aura: two particles per second, biased to the elite's torso.
      if (chance(0.8)) {
        burst(elite.dimension, {
          x: elite.location.x,
          y: elite.location.y + randFloat(0.4, 1.8),
          z: elite.location.z,
        }, rarityDef.particle, 2, 0.5, 0.4);
      }
      if (elite.hasTag(TAGS.enraged) && chance(0.4)) {
        burst(elite.dimension, { x: elite.location.x, y: elite.location.y + 1, z: elite.location.z }, PARTICLES.salvage, 2, 0.4, 0.6);
      }

      maybeEnrage(elite);

      const dx = elite.location.x - player.location.x;
      const dz = elite.location.z - player.location.z;
      const distance = dx * dx + dz * dz;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = elite;
      }
    }

    if (closest) showBossBar(player, closest);
  }
}

/** Low-health enrage: faster, stronger, and visibly angry. */
function maybeEnrage(elite: Entity): void {
  if (elite.hasTag(TAGS.enraged)) return;
  const health = elite.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
  if (!health || health.effectiveMax <= 0) return;
  if (health.currentValue / health.effectiveMax > 0.35) return;

  try {
    elite.addTag(TAGS.enraged);
    elite.addEffect('speed', ELITE_EFFECT_TICKS, { amplifier: 2, showParticles: false });
    elite.addEffect('strength', ELITE_EFFECT_TICKS, { amplifier: 2, showParticles: false });
    burst(elite.dimension, elite.location, PARTICLES.salvage, 20, 1, 2);
    playSoundAt(elite.location, SOUNDS.bossHurt, 1, 0.7);
  } catch {
    // Ignore; the elite will simply not enrage.
  }
}

/** Draw the boss bar into the action bar of a nearby player. */
function showBossBar(player: Player, elite: Entity): void {
  const health = elite.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
  if (!health) return;
  const current = Math.max(0, Math.ceil(health.currentValue));
  const max = Math.max(1, Math.ceil(health.effectiveMax));
  const name = elite.nameTag || '§cElite';
  actionBar(player, `${name} §8${healthBar(health.currentValue, health.effectiveMax, 10)} §c${current}§8/§c${max}`);
}

/**
 * Drop rarity-scaled loot when a player kills an elite.
 * The entity JSON loot table still supplies vanilla extras (bones, ingots).
 */
export function dropEliteLoot(deadEntity: Entity, killer: Player): void {
  const rarity = eliteRarityOf(deadEntity) ?? 'uncommon';
  const rarityDef = RARITY_BY_KEY[rarity];
  const dimension = deadEntity.dimension;
  const base = { ...deadEntity.location };
  const bossName = stripFormatting(deadEntity.nameTag || 'an elite');

  const drop = (item: ReturnType<typeof createDust>): void => {
    if (!item) return;
    try {
      dimension.spawnItem(item, {
        x: base.x + randFloat(-0.6, 0.6),
        y: base.y + 0.2,
        z: base.z + randFloat(-0.6, 0.6),
      });
    } catch {
      // Chunk unloaded mid-death.
    }
  };

  // 1. Arcane dust — always.
  drop(createDust(randInt(3, 5 + rarityDef.tier * 2)));

  // 2. Affix gem — 60 % (weighted towards the elite's weapon pool).
  if (chance(0.6)) {
    const weaponAffixes = AFFIXES.filter((affix) => affix.slot === 'weapon');
    drop(createGem(pick(weaponAffixes).id, rarity));
  }

  // 3. Rarity orb — 40 %, one tier below the elite's rarity.
  if (chance(0.4)) {
    const orbRarity: RarityKey | undefined =
      rarity === 'mythic' ? 'epic' : rarity === 'epic' ? 'rare' : rarity === 'rare' ? 'uncommon' : undefined;
    if (orbRarity) drop(createOrb(orbRarity, 1));
  }

  // 4. Full affix gear — more likely the higher the rarity.
  const gearChance = Math.min(0.85, 0.35 + rarityDef.tier * 0.12);
  if (chance(gearChance)) {
    drop(createRandomGearDrop(rarity, { boss: bossName }));
  }

  burst(dimension, base, rarityDef.particle, 36, 1.2, 1.8);
  playSoundAt(base, SOUNDS.upgrade, 0.8, 1.1);
  tell(
    killer,
    `§8[§5Apotheosis§8] §6☠ ${bossName}§7 was slain. §7Loot scales with ${rarityDef.color}${rarityDef.name}§7.`,
  );
}

/**
 * Affix Effigy ritual: a short particle spiral followed by a random elite.
 * Runs entirely on `system.runInterval` so it survives across ticks.
 */
export function summonRitual(player: Player): void {
  const rarity = rollRarity({ minTier: 1, luck: 0.25 });
  const direction = player.getViewDirection();
  const center: Vector3 = {
    x: player.location.x + direction.x * 2,
    y: player.location.y + 0.1,
    z: player.location.z + direction.z * 2,
  };
  const dimension = player.dimension;
  let elapsed = 0;

  tell(player, '§5The effigy crumbles… §7something answers the call.');
  playSoundAt(center, SOUNDS.uiOpen, 1, 0.6);

  const runId = system.runInterval(() => {
    elapsed += 5;
    const angle = elapsed * 0.35;
    burst(dimension, {
      x: center.x + Math.cos(angle) * 1.4,
      y: center.y + elapsed / 40,
      z: center.z + Math.sin(angle) * 1.4,
    }, PARTICLES.eliteEpic, 2, 0.1, 0.1);

    if (elapsed < 40) return;

    system.clearRun(runId);
    const elite = spawnElite(dimension, center, rarity, { announce: true, tag: TAGS.summoned });
    if (elite) {
      const label = stripFormatting(elite.nameTag);
      tell(player, `§6☠ ${label} §7has been summoned!`);
    } else {
      tell(player, '§cThe ritual fizzled — the elite definition is missing.');
    }
  }, 5);
}

/** Register the natural-spawn hook and the aura loop. */
export function startBossSystem(): void {
  world.afterEvents.entitySpawn.subscribe((event) => {
    try {
      onEntitySpawn(event);
    } catch (error) {
      console.warn(`[Apotheosis] Elite spawn promotion failed: ${String(error)}`);
    }
  });

  system.runInterval(() => {
    try {
      bossAuraTick();
    } catch (error) {
      console.warn(`[Apotheosis] Boss aura tick failed: ${String(error)}`);
    }
  }, TICK.bossAura);
}

/** Exposed for the codex UI: current elite population summary. */
export function elitePopulation(): number {
  let total = 0;
  for (const player of world.getAllPlayers()) {
    try {
      total = Math.max(total, player.dimension.getEntities({ tags: [TAGS.elite] }).length);
    } catch {
      // Ignore unloaded dimensions.
    }
  }
  return total;
}

/** Debug helper used by the admin command: summon near a player. */
export function summonEliteNear(player: Player, rarity: RarityKey): Entity | undefined {
  return spawnElite(player.dimension, { ...player.location }, rarity, { announce: true, tag: TAGS.summoned });
}

/** Re-exported for UI copy. */
export const eliteRarityPercent = percent;
