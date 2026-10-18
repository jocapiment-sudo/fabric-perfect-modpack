/**
 * ============================================================================
 *  Apotheosis: Bedrock Edition — global configuration
 * ============================================================================
 *  Every tunable constant lives here so server owners can rebalance the pack
 *  without touching gameplay code. The values below are mirrored in
 *  docs/MECHANICS.md.
 *
 *  Target: Minecraft Bedrock 1.20.80+  |  @minecraft/server 1.10.0
 * ============================================================================
 */

/** Namespace used by every custom identifier in this add-on. */
export const NS = 'apotheosis';

/** All custom block / item identifiers, collected in one place. */
export const IDS = {
  // Blocks
  altar: `${NS}:reforging_altar`,
  spawner: `${NS}:affix_spawner`,

  // Tools & consumables
  hammer: `${NS}:reforging_hammer`,
  fork: `${NS}:spawner_tuning_fork`,
  codex: `${NS}:codex_of_affixes`,
  dust: `${NS}:arcane_dust`,
  gem: `${NS}:affix_gem`,
  effigy: `${NS}:affix_effigy`,

  // Rarity orbs (one item per rarity so recipes can produce them)
  orbUncommon: `${NS}:orb_uncommon`,
  orbRare: `${NS}:orb_rare`,
  orbEpic: `${NS}:orb_epic`,
  orbMythic: `${NS}:orb_mythic`,

  // Elite weapons that also appear in the boss loot tables
  bossBlade: `${NS}:boss_blade`,
  bossCleaver: `${NS}:boss_cleaver`,

  // Vanilla blocks we interact with
  vanillaSpawner: 'minecraft:mob_spawner',
} as const;

/**
 * Dynamic-property keys.
 *
 * World scoped:
 *   - `spawners` : persisted settings for every Apotheosis spawner.
 *   - `settings` : runtime tuning (natural elites on/off, caps, chances).
 * Item scoped (non-stackable items only):
 *   - `item`     : affix payload for a piece of gear.
 *   - `gem`      : affix payload for an affix gem.
 * Entity scoped:
 *   - `rarity`   : rarity key of an elite, used by the loot system.
 */
export const DP = {
  item: 'apoth:item',
  gem: 'apoth:gem',
  rarity: 'apoth:rarity',
  spawners: 'apoth:spawners',
  settings: 'apoth:settings',
} as const;

/** Entity tags used to recognise our elites and internals. */
export const TAGS = {
  elite: 'apoth:elite',
  enraged: 'apoth:enraged',
  summoned: 'apoth:summoned',
  noElite: 'apoth:no_elite',
} as const;

/** Rarity prefix used on elite tags, e.g. `apoth:rarity:mythic`. */
export const RARITY_TAG_PREFIX = 'apoth:rarity:';

/** Maximum number of affixes an item can ever hold, regardless of rarity. */
export const MAX_AFFIXES = 5;

/** Tick intervals for the scripted systems (20 ticks = 1 second). */
export const TICK = {
  /** Equipped-gear scan. Cheap, but do not drop below 10. */
  equipmentScan: 10,
  /** Re-apply vanilla effects so they never visibly expire. */
  equipmentRefresh: 40,
  /** Elite aura particles + nearby boss bars. */
  bossAura: 20,
  /** Spawner simulation (countdowns are tick based). */
  spawner: 20,
  /** How long a hotbar interaction lock lasts, in ticks. */
  interactionLock: 6,
} as const;

/** Runtime settings persisted in the world (see `systems/commands.ts`). */
export interface AddonSettings {
  /** Convert naturally spawned vanilla undead into elites. */
  naturalElites: boolean;
  /** Chance (0..1) for an eligible natural spawn to become an elite. */
  eliteChance: number;
  /** Maximum number of live elites kept per dimension. */
  maxElitesPerDimension: number;
  /** Chance (0..1) that an Apotheosis spawner spawns an elite instead. */
  spawnerEliteChance: number;
}

export const DEFAULT_SETTINGS: AddonSettings = {
  naturalElites: true,
  eliteChance: 0.04,
  maxElitesPerDimension: 4,
  spawnerEliteChance: 0.1,
};

/** Defaults and hard limits for scripted mob spawners. */
export const SPAWNER = {
  defaultDelay: 30,
  minDelay: 5,
  maxDelay: 180,
  defaultCount: 2,
  minCount: 1,
  maxCount: 6,
  defaultMaxNearby: 8,
  minMaxNearby: 2,
  maxMaxNearby: 24,
  defaultRange: 12,
  minRange: 4,
  maxRange: 32,
  /** Radius used when counting nearby mobs for the `maxNearby` cap. */
  populationRadius: 16,
  /** Maximum horizontal/vertical offset when placing a spawned mob. */
  spawnSpread: 3.5,
} as const;

/** Mobs that can be selected in the spawner UI. */
export interface SpawnerMob {
  id: string;
  name: string;
  /** Families used to count "similar" mobs for the population cap. */
  families: string[];
}

export const SPAWNER_MOBS: readonly SpawnerMob[] = [
  { id: 'minecraft:zombie', name: 'Zombie', families: ['zombie', 'undead'] },
  { id: 'minecraft:husk', name: 'Husk', families: ['husk', 'undead'] },
  { id: 'minecraft:drowned', name: 'Drowned', families: ['drowned', 'undead'] },
  { id: 'minecraft:skeleton', name: 'Skeleton', families: ['skeleton', 'undead'] },
  { id: 'minecraft:stray', name: 'Stray', families: ['skeleton', 'undead'] },
  { id: 'minecraft:spider', name: 'Spider', families: ['spider'] },
  { id: 'minecraft:cave_spider', name: 'Cave Spider', families: ['spider'] },
  { id: 'minecraft:creeper', name: 'Creeper', families: ['creeper'] },
  { id: 'minecraft:slime', name: 'Slime', families: ['slime'] },
  { id: 'minecraft:pillager', name: 'Pillager', families: ['pillager', 'illager'] },
  { id: 'minecraft:vindicator', name: 'Vindicator', families: ['vindicator', 'illager'] },
  { id: 'minecraft:blaze', name: 'Blaze', families: ['blaze'] },
  { id: 'minecraft:magma_cube', name: 'Magma Cube', families: ['magma_cube'] },
  { id: 'minecraft:wither_skeleton', name: 'Wither Skeleton', families: ['wither', 'undead'] },
  { id: 'minecraft:enderman', name: 'Enderman', families: ['enderman'] },
  { id: 'minecraft:witch', name: 'Witch', families: ['witch'] },
] as const;

/** Vanilla mobs that can be promoted to elites when they spawn. */
export const NATURAL_ELITE_SOURCES: readonly string[] = [
  'minecraft:zombie',
  'minecraft:husk',
  'minecraft:drowned',
  'minecraft:skeleton',
  'minecraft:stray',
];

/**
 * Particle identifiers. Only particles that ship with the vanilla Bedrock
 * resource pack are used, so the add-on never depends on custom particles.
 */
export const PARTICLES = {
  spawner: 'minecraft:basic_portal_particle',
  spawnerBurst: 'minecraft:basic_flame_particle',
  eliteCommon: 'minecraft:villager_happy',
  eliteRare: 'minecraft:enchanting_table_particle',
  eliteEpic: 'minecraft:totem_particle',
  eliteMythic: 'minecraft:basic_flame_particle',
  crit: 'minecraft:crit_particle',
  frost: 'minecraft:snowflake_particle',
  heal: 'minecraft:heart_particle',
  thunder: 'minecraft:endrod',
  salvage: 'minecraft:basic_smoke_particle',
  forge: 'minecraft:enchanting_table_particle',
} as const;

/** Sound events that are guaranteed to exist in the vanilla sound registry. */
export const SOUNDS = {
  uiOpen: 'block.enchanting_table.use',
  uiClick: 'random.orb',
  reforge: 'block.amethyst_block.resonate',
  upgrade: 'random.levelup',
  salvage: 'random.pop',
  error: 'random.fizz',
  bossSpawn: 'mob.wither.spawn',
  bossHurt: 'mob.wither.hurt',
  eliteAmbient: 'mob.zombie.ambient',
  spawner: 'mob.endermen.portal',
  gem: 'block.amethyst_block.chime',
} as const;

/** Colours reused by chat messages. */
export const COLORS = {
  muted: '§7',
  value: '§a',
  bad: '§c',
  gold: '§6',
  white: '§f',
  dark: '§8',
  reset: '§r',
} as const;
