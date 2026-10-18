/**
 * Aggregated affix stats.
 *
 * All equippable affix items (mainhand, offhand, four armour slots) contribute
 * to a single `StatBlock`. Passive stats are converted to vanilla effects by
 * `systems/equipment.ts`; the remaining stats are consumed by combat hooks.
 */

import { AFFIX_BY_ID, type StatKey } from './affixes';
import type { ItemData } from './itemData';
import { percent } from '../util/text';

/** Every stat starts at zero. Field names intentionally mirror `StatKey`. */
export type StatBlock = Record<StatKey, number>;

export function emptyStats(): StatBlock {
  return {
    crit: 0,
    lifesteal: 0,
    fireSeconds: 0,
    frostTicks: 0,
    thunderChance: 0,
    flatDamage: 0,
    eliteDamage: 0,
    xpBonus: 0,
    health: 0,
    speedPct: 0,
    resistancePct: 0,
    kbResistPct: 0,
    absorptionHp: 0,
    fireResSeconds: 0,
    waterBreathingSeconds: 0,
    jumpAmp: 0,
    luckAmp: 0,
    thorns: 0,
  };
}

/** Sum every affix from one item into `stats`. */
export function addItemStats(stats: StatBlock, data: ItemData): void {
  for (const instance of data.affixes) {
    const def = AFFIX_BY_ID[instance.id];
    stats[def.stat] += instance.v;
  }
}

/**
 * Safety caps. Even a full mythic set with stacked gems should stay inside
 * ranges the vanilla effect system can express.
 */
export function capStats(stats: StatBlock): StatBlock {
  stats.crit = Math.min(0.75, stats.crit);
  stats.lifesteal = Math.min(0.5, stats.lifesteal);
  stats.thunderChance = Math.min(0.5, stats.thunderChance);
  stats.fireSeconds = Math.min(15, stats.fireSeconds);
  stats.frostTicks = Math.min(200, stats.frostTicks);
  stats.flatDamage = Math.min(12, stats.flatDamage);
  stats.eliteDamage = Math.min(1, stats.eliteDamage);
  stats.xpBonus = Math.min(20, stats.xpBonus);
  stats.health = Math.min(40, stats.health);
  stats.speedPct = Math.min(0.6, stats.speedPct);
  stats.resistancePct = Math.min(0.6, stats.resistancePct);
  stats.kbResistPct = Math.min(0.85, stats.kbResistPct);
  stats.absorptionHp = Math.min(12, stats.absorptionHp);
  stats.fireResSeconds = Math.min(60, stats.fireResSeconds);
  stats.waterBreathingSeconds = Math.min(60, stats.waterBreathingSeconds);
  stats.jumpAmp = Math.min(3, stats.jumpAmp);
  stats.luckAmp = Math.min(4, stats.luckAmp);
  stats.thorns = Math.min(8, stats.thorns);
  return stats;
}

/** Aggregate a set of equipped items. */
export function statsFromItems(data: readonly (ItemData | undefined)[]): StatBlock {
  const stats = emptyStats();
  for (const item of data) {
    if (item) addItemStats(stats, item);
  }
  return capStats(stats);
}

/** Human-readable stat summary used by the "Inspect" altar screen. */
export function statSummaryLines(stats: StatBlock): string[] {
  const lines: string[] = [];
  const push = (value: number, text: string): void => {
    if (value > 0) lines.push(`§a• §7${text}`);
  };

  push(stats.health, `+${Math.round(stats.health)} max health`);
  push(stats.speedPct, `+${percent(stats.speedPct)} movement speed`);
  push(stats.resistancePct, `+${percent(stats.resistancePct)} damage resistance`);
  push(stats.kbResistPct, `+${percent(stats.kbResistPct)} knockback resistance`);
  push(stats.absorptionHp, `+${Math.round(stats.absorptionHp)} absorption health`);
  push(stats.flatDamage, `+${Math.round(stats.flatDamage)} attack damage`);
  push(stats.crit, `+${percent(stats.crit)} critical strike chance`);
  push(stats.lifesteal, `+${percent(stats.lifesteal)} lifesteal`);
  push(stats.thunderChance, `+${percent(stats.thunderChance)} smite chance`);
  push(stats.fireSeconds, `+${Math.round(stats.fireSeconds)}s burn on hit`);
  push(stats.frostTicks, `+${(stats.frostTicks / 20).toFixed(1)}s slowness on hit`);
  push(stats.eliteDamage, `+${percent(stats.eliteDamage)} damage vs elites`);
  push(stats.thorns, `+${Math.round(stats.thorns)} thorns damage`);
  push(stats.fireResSeconds, `+${Math.round(stats.fireResSeconds)}s fire resistance`);
  push(stats.waterBreathingSeconds, `+${Math.round(stats.waterBreathingSeconds)}s water breathing`);
  push(stats.jumpAmp + (stats.jumpAmp > 0 ? 1 : 0), `+${Math.round(stats.jumpAmp) + 1} jump boost`);
  push(stats.luckAmp + (stats.luckAmp > 0 ? 1 : 0), `+${Math.round(stats.luckAmp) + 1} luck`);
  push(stats.xpBonus, `+${Math.round(stats.xpBonus)} XP on kill`);

  return lines.length > 0 ? lines : ['§8No passive stats.'];
}
