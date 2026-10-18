/**
 * Elite mini-boss definitions.
 *
 * Each rarity maps to one or more custom entity definitions in
 * `apotheosis_bp/entities/`. The JSON files define health, hitbox, AI and the
 * baseline equipment; this module adds the dynamic part at spawn time:
 * coloured names, affix weapons, rarity auras and loot rarity.
 */

import type { RarityKey } from './rarity';
import { pick } from '../util/random';
import { IDS, NS } from '../config';

export interface EliteDef {
  /** Custom entity identifier defined in the behaviour pack. */
  entityId: string;
  /** Rarity this elite is themed around (also drives its drop rarity). */
  rarity: RarityKey;
  /** Name fragments; combined into `☠ <name> <title>`. */
  names: readonly string[];
  titles: readonly string[];
  /** Baseline health defined in the behaviour-pack entity JSON. */
  health: number;
  /** Base weapon handed to the elite at spawn. */
  weapon: string;
  /** Armour set given at spawn. */
  armor: 'iron' | 'chain' | 'diamond' | 'netherite';
  /** Extra flame immunity for the molten champions. */
  fireImmune?: boolean;
}

export const ELITES: readonly EliteDef[] = [
  {
    entityId: `${NS}:elite_zombie_brute`,
    rarity: 'uncommon',
    names: ['Vorgath', 'Mordrek', 'Grulmar', 'Skarn'],
    titles: ['the Bloodsworn', 'the Rotbringer', 'the Grave-Eater', 'the Unyielding'],
    health: 70,
    weapon: 'minecraft:iron_sword',
    armor: 'iron',
  },
  {
    entityId: `${NS}:elite_husk_juggernaut`,
    rarity: 'rare',
    names: ['Kharzug', 'Dunmar', 'Ozrak'],
    titles: ['the Unbroken', 'the Sand Reaver', 'the Juggernaut', 'the Wastes-Walker'],
    health: 110,
    weapon: 'minecraft:iron_axe',
    armor: 'iron',
  },
  {
    entityId: `${NS}:elite_skeleton_ranger`,
    rarity: 'rare',
    names: ['Raevan', 'Sylas', 'Corvin'],
    titles: ['the Deadeye', 'the Bonecaller', 'the Swift', 'the Hollow'],
    health: 80,
    weapon: 'minecraft:iron_sword',
    armor: 'chain',
  },
  {
    entityId: `${NS}:elite_stray_sorcerer`,
    rarity: 'epic',
    names: ['Ilyra', 'Frostwyn', 'Halveth'],
    titles: ['the Frozen Choir', 'the Rimebound', 'the Pale Herald'],
    health: 140,
    weapon: IDS.bossBlade,
    armor: 'diamond',
  },
  {
    entityId: `${NS}:elite_drowned_champion`,
    rarity: 'mythic',
    names: ['Nauthis', 'Kael', 'Thessaly'],
    titles: ['the Drowned King', 'Tidebreaker', 'the Abyssal'],
    health: 200,
    weapon: IDS.bossCleaver,
    armor: 'netherite',
    fireImmune: true,
  },
] as const;

/** Armour piece identifiers for each set. */
export const ARMOR_SETS: Record<'iron' | 'diamond' | 'netherite' | 'chain', readonly string[]> = {
  iron: ['minecraft:iron_helmet', 'minecraft:iron_chestplate', 'minecraft:iron_leggings', 'minecraft:iron_boots'],
  chain: ['minecraft:chainmail_helmet', 'minecraft:chainmail_chestplate', 'minecraft:chainmail_leggings', 'minecraft:chainmail_boots'],
  diamond: ['minecraft:diamond_helmet', 'minecraft:diamond_chestplate', 'minecraft:diamond_leggings', 'minecraft:diamond_boots'],
  netherite: ['minecraft:netherite_helmet', 'minecraft:netherite_chestplate', 'minecraft:netherite_leggings', 'minecraft:netherite_boots'],
};

/** Every elite that can carry a given rarity. */
export function elitesForRarity(rarity: RarityKey): EliteDef[] {
  return ELITES.filter((elite) => elite.rarity === rarity);
}

/** Pick a random elite definition for a rarity. */
export function pickElite(rarity: RarityKey): EliteDef | undefined {
  const options = elitesForRarity(rarity);
  return options.length > 0 ? pick(options) : undefined;
}

/** Look up an elite definition by custom entity id. */
export function eliteByEntityId(entityId: string): EliteDef | undefined {
  return ELITES.find((elite) => elite.entityId === entityId);
}

/** Generate a memorable, colour-coded boss name. */
export function buildEliteName(def: EliteDef, color: string, rarityName: string): string {
  return `${color}§l☠ ${pick(def.names)} ${pick(def.titles)} §r§8[${color}${rarityName}§8]`;
}
