/**
 * ============================================================================
 *  Apotheosis Codex
 * ============================================================================
 *  An in-game manual built with ActionFormData pages. It covers rarities,
 *  every affix (weapons/armour), elite bosses, spawner rules and commands.
 *  Keeping documentation in-game matters on consoles/realms where players
 *  cannot open a README next to the world.
 * ============================================================================
 */

import { ActionFormData } from '@minecraft/server-ui';
import type { Player } from '@minecraft/server';

import { SPAWNER, SPAWNER_MOBS } from '../config';
import { AFFIXES, type AffixDef, type GearSlot } from '../core/affixes';
import { ELITES } from '../core/elites';
import { RARITIES, RARITY_BY_KEY, type RarityKey } from '../core/rarity';
import { percent } from '../util/text';
import { showAction } from './forms';
import { spawnerSummary } from './spawnerUI';

const ORB_ICON = 'textures/items/apoth_orb_rare';
const BLADE_ICON = 'textures/items/apoth_boss_blade';
const HAMMER_ICON = 'textures/items/apoth_reforge_hammer';
const EFFIGY_ICON = 'textures/items/apoth_effigy';
const FORK_ICON = 'textures/items/apoth_spawner_tuning_fork';
const CODEX_ICON = 'textures/items/apoth_codex';

/** Compact per-rarity value string, e.g. `4% / 7% / 10% / 14% / 18%`. */
function compactValues(def: AffixDef): string {
  switch (def.unit) {
    case 'percent':
      return def.values.map((value) => percent(value, 0)).join(' / ');
    case 'seconds':
      return def.values.map((value) => `${value}s`).join(' / ');
    case 'ticks':
      return def.values.map((value) => `${value / 20}s`).join(' / ');
    case 'amplifier':
      return def.values.map((value) => `Lv${value + 1}`).join(' / ');
    case 'flat':
    default:
      return def.values.join(' / ');
  }
}

function rarityBody(): string {
  const lines: string[] = ['§7Rarity sets affix slots, potency and costs.'];
  for (const rarity of RARITIES) {
    const orb = rarity.upgrade.orb ? ' §8+ orb' : '';
    lines.push(
      `${rarity.color}${rarity.bold ? '§l' : ''}${rarity.name} §r§8— §7${rarity.affixSlots} rolls §8| §7reforge §f${rarity.reforge.dust}d/${rarity.reforge.levels}L §8| §7upgrade §f${rarity.upgrade.dust}d/${rarity.upgrade.levels}L${orb}`,
    );
  }
  lines.push('§8Each item can hold one extra gem affix.');
  lines.push('§8Mythic items cannot be upgraded further.');
  return lines.join('\n');
}

function affixBody(slot: GearSlot): string {
  const pool = AFFIXES.filter((def) => def.slot === slot || def.slot === 'any');
  const lines = [`§7Values scale per rarity: §fcommon → mythic`];
  for (const def of pool) {
    const marker = def.kind === 'prefix' ? '✦' : '❖';
    lines.push(`§f${marker} ${def.name} §8— §7${def.label}\n§8   ${compactValues(def)}`);
  }
  return lines.join('\n');
}

function eliteBody(): string {
  const lines = ['§7Elites are promoted undead or effigy summons.'];
  for (const def of ELITES) {
    const rarity = RARITY_BY_KEY[def.rarity];
    lines.push(
      `${rarity.color}${rarity.name} §8— §f${def.names[0]} ${def.titles[0]}\n§8   ${def.health} HP · ${def.armor} armour · drops ${rarity.name} gear`,
    );
  }
  lines.push('§8Low-health elites enrage (+speed, +strength).');
  lines.push('§8Kill them for dust, gems, orbs and affix gear.');
  return lines.join('\n');
}

function spawnerBody(): string {
  const lines = [
    '§7Vanilla spawners cannot be edited by scripts.',
    '§7Bind one with the §fTuning Fork§7 to simulate it.',
    '',
    `§7Mobs per wave: §f${SPAWNER.minCount}–${SPAWNER.maxCount}`,
    `§7Delay: §f${SPAWNER.minDelay}–${SPAWNER.maxDelay}s`,
    `§7Population cap: §f${SPAWNER.minMaxNearby}–${SPAWNER.maxMaxNearby}`,
    `§7Activation range: §f${SPAWNER.minRange}–${SPAWNER.maxRange}`,
    `§7Mob types: §f${SPAWNER_MOBS.length}`,
    '',
    '§7Configured:',
    ...spawnerSummary().slice(0, 6),
  ];
  return lines.join('\n');
}

function commandBody(): string {
  return [
    '§7Requires cheats enabled.',
    '§8/scriptevent apoth:help',
    '§8/scriptevent apoth:give kit',
    '§8/scriptevent apoth:give gem keen epic',
    '§8/scriptevent apoth:give gear mythic weapon',
    '§8/scriptevent apoth:give orb rare',
    '§8/scriptevent apoth:summon mythic',
    '§8/scriptevent apoth:config elitechance 0.08',
    '§8/scriptevent apoth:status',
    '',
    '§7Full docs: §fdocs/COMMANDS.md',
  ].join('\n');
}

async function page(player: Player, title: string, body: string): Promise<boolean> {
  const response = await showAction(
    player,
    new ActionFormData().title(title).body(body).button('§7Back').button('§8Close'),
  );
  return Boolean(response && !response.canceled && response.selection === 0);
}

/** Open the codex main menu. */
export async function openCodex(player: Player): Promise<void> {
  for (let depth = 0; depth < 12; depth++) {
    const form = new ActionFormData()
      .title('§5Apotheosis Codex')
      .body('§7Rarities, affixes, elites and spawners.')
      .button('§fRarities', ORB_ICON)
      .button('§fWeapon affixes', BLADE_ICON)
      .button('§fArmour affixes', HAMMER_ICON)
      .button('§fElite bosses', EFFIGY_ICON)
      .button('§fSpawners', FORK_ICON)
      .button('§fCommands', CODEX_ICON)
      .button('§8Close');

    const response = await showAction(player, form);
    if (!response || response.canceled || response.selection === undefined || response.selection === 6) return;

    let keepOpen = true;
    switch (response.selection) {
      case 0:
        keepOpen = await page(player, '§5Rarities', rarityBody());
        break;
      case 1:
        keepOpen = await page(player, '§5Weapon Affixes', affixBody('weapon'));
        break;
      case 2:
        keepOpen = await page(player, '§5Armour Affixes', affixBody('armor'));
        break;
      case 3:
        keepOpen = await page(player, '§5Elite Bosses', eliteBody());
        break;
      case 4:
        keepOpen = await page(player, '§5Spawners', spawnerBody());
        break;
      case 5:
        keepOpen = await page(player, '§5Commands', commandBody());
        break;
      default:
        return;
    }
    if (!keepOpen) return;
  }
}

/** Exposed for tests: ensure every rarity has at least one elite theme. */
export function rarityWithoutElite(): RarityKey[] {
  return RARITIES.filter((rarity) => rarity.tier > 0 && !ELITES.some((elite) => elite.rarity === rarity.key)).map(
    (rarity) => rarity.key,
  );
}
