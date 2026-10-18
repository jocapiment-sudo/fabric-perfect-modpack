/**
 * ============================================================================
 *  Apotheosis spawners
 * ============================================================================
 *  Bedrock's Script API cannot read or write block NBT, so a vanilla
 *  `minecraft:mob_spawner` cannot be retuned in place (its entity type and
 *  timings live in NBT). Instead, using the Spawner Tuning Fork on a vanilla
 *  spawner **binds** it: the block is replaced with `apotheosis:affix_spawner`
 *  and all spawning is from then on simulated by this module.
 *
 *  Persistence: every spawner's settings are stored in a single world dynamic
 *  property (`apoth:spawners`) and saved through a debounced JSON store.
 *  Runtime countdowns stay in memory — they do not need to survive a restart.
 * ============================================================================
 */

import {
  BlockPermutation,
  system,
  world,
  type Block,
  type Dimension,
  type Player,
  type Vector3,
} from '@minecraft/server';

import { DP, IDS, PARTICLES, SOUNDS, SPAWNER, SPAWNER_MOBS, TAGS, TICK } from '../config';
import { rollRarity } from '../core/rarity';
import { burst, playSoundAt, tell } from '../util/feedback';
import { chance, randFloat, randInt } from '../util/random';
import { DebouncedJsonStore, readWorldJson } from '../util/store';
import { spawnElite } from './bosses';

/** Fully resolved settings for one scripted spawner. */
export interface SpawnerConfig {
  dimension: string;
  x: number;
  y: number;
  z: number;
  /** Entity identifier to spawn. */
  mob: string;
  /** Seconds between waves. */
  delay: number;
  /** Mobs spawned per wave. */
  count: number;
  /** Maximum mobs of the same type within `populationRadius`. */
  maxNearby: number;
  /** Player activation radius (blocks). */
  range: number;
  /** 0..1 chance that a wave spawns an elite instead. */
  eliteChance: number;
  /** Whether to show portal particles. */
  particles: boolean;
}

type SpawnerMap = Record<string, SpawnerConfig>;

const store = new DebouncedJsonStore(DP.spawners, 20);
const countdowns = new Map<string, number>();
let configs: SpawnerMap = {};
let loaded = false;

/** Stable key for a block position inside a dimension. */
export function spawnerKey(dimensionId: string, location: Vector3): string {
  return `${dimensionId}|${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

/** Validate and clamp a persisted config; returns `undefined` if unusable. */
function sanitizeConfig(raw: SpawnerConfig, key: string): SpawnerConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const dimension = typeof raw.dimension === 'string' && raw.dimension.length > 0 ? raw.dimension : key.split('|')[0];
  if (!dimension) return undefined;

  const x = Math.floor(Number(raw.x));
  const y = Math.floor(Number(raw.y));
  const z = Math.floor(Number(raw.z));
  if (![x, y, z].every(Number.isFinite)) return undefined;

  const mob = SPAWNER_MOBS.some((entry) => entry.id === raw.mob) ? raw.mob : 'minecraft:zombie';

  return {
    dimension,
    x,
    y,
    z,
    mob,
    delay: Math.round(clamp(raw.delay, SPAWNER.minDelay, SPAWNER.maxDelay, SPAWNER.defaultDelay)),
    count: Math.round(clamp(raw.count, SPAWNER.minCount, SPAWNER.maxCount, SPAWNER.defaultCount)),
    maxNearby: Math.round(clamp(raw.maxNearby, SPAWNER.minMaxNearby, SPAWNER.maxMaxNearby, SPAWNER.defaultMaxNearby)),
    range: Math.round(clamp(raw.range, SPAWNER.minRange, SPAWNER.maxRange, SPAWNER.defaultRange)),
    eliteChance: clamp(raw.eliteChance, 0, 1, 0.1),
    particles: raw.particles !== false,
  };
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const raw = readWorldJson<SpawnerMap>(DP.spawners, {});
  configs = {};
  for (const [key, value] of Object.entries(raw)) {
    const sanitized = sanitizeConfig(value, key);
    if (sanitized) configs[key] = sanitized;
  }
}

function persist(): void {
  store.save(configs);
}

/** Defaults used when a vanilla spawner is bound or a block is placed. */
export function defaultSpawnerConfig(dimensionId: string, location: Vector3, mob = 'minecraft:zombie'): SpawnerConfig {
  return {
    dimension: dimensionId,
    x: Math.floor(location.x),
    y: Math.floor(location.y),
    z: Math.floor(location.z),
    mob,
    delay: SPAWNER.defaultDelay,
    count: SPAWNER.defaultCount,
    maxNearby: SPAWNER.defaultMaxNearby,
    range: SPAWNER.defaultRange,
    eliteChance: 0.1,
    particles: true,
  };
}

/** The config attached to a block position, if any. */
export function getSpawnerConfig(dimensionId: string, location: Vector3): SpawnerConfig | undefined {
  ensureLoaded();
  return configs[spawnerKey(dimensionId, location)];
}

/** All stored configs (read-only copy for UIs/debug). */
export function listSpawnerConfigs(): readonly SpawnerConfig[] {
  ensureLoaded();
  return Object.values(configs);
}

/** Create or replace a spawner config. */
export function upsertSpawner(config: SpawnerConfig): SpawnerConfig {
  ensureLoaded();
  const key = spawnerKey(config.dimension, config);
  const sanitized = sanitizeConfig(config, key);
  if (!sanitized) return config;
  configs[key] = sanitized;
  countdowns.set(key, sanitized.delay * 20);
  persist();
  return sanitized;
}

/** Delete a config (block broken or replaced). */
export function removeSpawner(dimensionId: string, location: Vector3): void {
  ensureLoaded();
  const key = spawnerKey(dimensionId, location);
  if (!(key in configs)) return;
  delete configs[key];
  countdowns.delete(key);
  persist();
}

/** Turn a vanilla mob spawner into an Apotheosis spawner. */
export function convertVanillaSpawner(block: Block, player: Player): SpawnerConfig | undefined {
  try {
    block.setPermutation(BlockPermutation.resolve(IDS.spawner));
  } catch (error) {
    console.warn(`[Apotheosis] Failed to bind spawner: ${String(error)}`);
    tell(player, '§cCould not bind this spawner.');
    return undefined;
  }

  const config = upsertSpawner(defaultSpawnerConfig(block.dimension.id, block.location));
  burst(block.dimension, block.center(), PARTICLES.spawnerBurst, 24, 0.8, 1.2);
  playSoundAt(block.center(), SOUNDS.reforge, 1, 0.8);
  return config;
}

/** True when the block at `location` is still our custom spawner. */
function isOurSpawner(dimension: Dimension, config: SpawnerConfig): boolean {
  try {
    const block = dimension.getBlock({ x: config.x, y: config.y, z: config.z });
    return Boolean(block?.permutation.matches(IDS.spawner));
  } catch {
    return false;
  }
}

/**
 * Attempt to place one mob near the spawner.
 * Returns true when an entity was spawned.
 */
function spawnMob(dimension: Dimension, config: SpawnerConfig): boolean {
  const center: Vector3 = { x: config.x + 0.5, y: config.y, z: config.z + 0.5 };

  for (let attempt = 0; attempt < 8; attempt++) {
    const x = Math.floor(center.x + randFloat(-SPAWNER.spawnSpread, SPAWNER.spawnSpread));
    const y = Math.floor(center.y + randInt(-1, 2));
    const z = Math.floor(center.z + randFloat(-SPAWNER.spawnSpread, SPAWNER.spawnSpread));

    let block: Block | undefined;
    try {
      block = dimension.getBlock({ x, y, z });
    } catch {
      continue;
    }
    if (!block || !block.isAir) continue;

    const below = block.below();
    if (!below || below.isAir) continue; // no floating mobs

    try {
      if (config.eliteChance > 0 && chance(config.eliteChance)) {
        const rarity = rollRarity({ minTier: 1 });
        const elite = spawnElite(dimension, { x: x + 0.5, y, z: z + 0.5 }, rarity, {
          announce: false,
          tag: TAGS.summoned,
        });
        if (elite) {
          burst(dimension, { x: x + 0.5, y: y + 1, z: z + 0.5 }, PARTICLES.spawnerBurst, 10, 0.5, 0.8);
          return true;
        }
      }

      const mob = dimension.spawnEntity(config.mob, { x: x + 0.5, y, z: z + 0.5 });
      mob.addTag(TAGS.noElite);
      burst(dimension, { x: x + 0.5, y: y + 1, z: z + 0.5 }, PARTICLES.spawner, 6, 0.4, 0.8);
      return true;
    } catch (error) {
      console.warn(`[Apotheosis] Spawner could not spawn "${config.mob}": ${String(error)}`);
      return false;
    }
  }

  return false;
}

/** One simulation step for one spawner. */
function tickSpawner(config: SpawnerConfig): void {
  let dimension: Dimension;
  try {
    dimension = world.getDimension(config.dimension);
  } catch {
    return;
  }

  if (!isOurSpawner(dimension, config)) {
    removeSpawner(config.dimension, config);
    return;
  }

  const key = spawnerKey(config.dimension, config);
  const center: Vector3 = { x: config.x + 0.5, y: config.y + 0.5, z: config.z + 0.5 };

  // Activation: at least one player inside the configured radius.
  let nearbyPlayers: Player[] = [];
  try {
    nearbyPlayers = dimension.getPlayers({ location: center, maxDistance: config.range });
  } catch {
    return;
  }
  if (nearbyPlayers.length === 0) return;

  const remaining = (countdowns.get(key) ?? config.delay * 20) - TICK.spawner;
  if (remaining > 0) {
    countdowns.set(key, remaining);
    return;
  }

  // Population cap, measured in a wider radius than the activation range.
  let population = 0;
  try {
    population = dimension.getEntities({
      location: center,
      maxDistance: SPAWNER.populationRadius,
      type: config.mob,
    }).length;
  } catch {
    // Ignore and try next tick.
  }

  if (population >= config.maxNearby) {
    countdowns.set(key, 40);
    if (config.particles) burst(dimension, center, PARTICLES.spawner, 2, 0.35, 0.5);
    return;
  }

  let spawned = 0;
  for (let i = 0; i < config.count && population + spawned < config.maxNearby; i++) {
    if (spawnMob(dimension, config)) spawned++;
  }

  if (config.particles) {
    burst(dimension, center, PARTICLES.spawner, 8, 0.4, 0.8);
  }
  if (spawned > 0) {
    playSoundAt(center, SOUNDS.spawner, 0.55, 1.2);
  }

  countdowns.set(key, Math.max(1, config.delay) * 20);
}

/** Start the spawner loop and break-block cleanup. */
export function startSpawnerSystem(): void {
  ensureLoaded();

  system.runInterval(() => {
    for (const config of Object.values(configs)) {
      try {
        tickSpawner(config);
      } catch (error) {
        console.warn(`[Apotheosis] Spawner tick failed: ${String(error)}`);
      }
    }
  }, TICK.spawner);

  world.afterEvents.playerBreakBlock.subscribe((event) => {
    try {
      if (event.brokenBlockPermutation.matches(IDS.spawner)) {
        removeSpawner(event.dimension.id, event.block.location);
      }
    } catch (error) {
      console.warn(`[Apotheosis] Spawner cleanup failed: ${String(error)}`);
    }
  });
}

/** Force an immediate save (used by admin commands / reload). */
export function flushSpawners(): void {
  store.flush(configs);
}
