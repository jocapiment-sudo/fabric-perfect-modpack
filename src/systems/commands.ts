/**
 * ============================================================================
 *  Admin / testing commands (`/scriptevent apoth:…`)
 * ============================================================================
 *  Script events are available on any world with cheats enabled. They are the
 *  most portable way to hand out the pack's items without shipping a custom
 *  command registration (Bedrock's Script API has no command registry in the
 *  1.10 module).
 *
 *  Examples:
 *    /scriptevent apoth:help
 *    /scriptevent apoth:give kit
 *    /scriptevent apoth:give gem keen epic
 *    /scriptevent apoth:give gear mythic weapon
 *    /scriptevent apoth:summon mythic
 *    /scriptevent apoth:config elitechance 0.08
 * ============================================================================
 */

import { system, type Player } from '@minecraft/server';

import { DEFAULT_SETTINGS, SPAWNER_MOBS, type AddonSettings } from '../config';
import { isAffixId } from '../core/affixes';
import {
  createBlankGem,
  createCodex,
  createDust,
  createEffigy,
  createFork,
  createGem,
  createHammer,
  createOrb,
  createRandomGearDrop,
} from '../core/itemFactory';
import { giveOrDrop } from '../core/inventory';
import { RARITY_KEYS, isRarityKey, type RarityKey } from '../core/rarity';
import { tell } from '../util/feedback';
import { loadSettings, saveSettings } from '../util/store';
import { listSpawnerConfigs } from './spawner';
import { elitePopulation, summonEliteNear } from './bosses';

const PREFIX = '§8[§5Apotheosis§8] §7';

function giveItem(player: Player, item: ReturnType<typeof createHammer>): boolean {
  if (!item) return false;
  giveOrDrop(player, item);
  return true;
}

function parseAmount(value: string | undefined, fallback: number, max = 64): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function parseRarity(value: string | undefined, fallback: RarityKey = 'rare'): RarityKey | undefined {
  if (!value) return fallback;
  return isRarityKey(value) ? value : undefined;
}

function showHelp(player: Player): void {
  player.sendMessage([
    '§5§lApotheosis §8— §7commands',
    `${PREFIX}/scriptevent apoth:give <hammer|fork|codex|effigy|dust|orb|gem|gear|blankgem> [args]`,
    `${PREFIX}/scriptevent apoth:give kit`,
    `${PREFIX}/scriptevent apoth:summon <uncommon|rare|epic|mythic>`,
    `${PREFIX}/scriptevent apoth:config [key] [value]`,
    `${PREFIX}/scriptevent apoth:status`,
    '§8Examples:',
    '§8/scriptevent apoth:give gem keen epic',
    '§8/scriptevent apoth:give gear mythic weapon',
    '§8/scriptevent apoth:config elitechance 0.08',
  ].join('\n'));
}

function giveKit(player: Player): void {
  const items = [
    createHammer(),
    createFork(),
    createCodex(),
    createEffigy(),
    createDust(24),
    createOrb('rare', 2),
    createOrb('epic', 1),
    createBlankGem(),
    createGem('keen', 'rare'),
    createGem('berserker', 'rare'),
  ];
  let given = 0;
  for (const item of items) {
    if (giveItem(player, item)) given++;
  }
  tell(player, `${PREFIX}Gave §a${given}§7 items. Check your inventory.`);
}

function handleGive(player: Player, args: string[]): void {
  const kind = (args[0] ?? '').toLowerCase();

  switch (kind) {
    case 'hammer':
      giveItem(player, createHammer());
      break;
    case 'fork':
      giveItem(player, createFork());
      break;
    case 'codex':
      giveItem(player, createCodex());
      break;
    case 'effigy':
      giveItem(player, createEffigy());
      break;
    case 'dust':
      giveItem(player, createDust(parseAmount(args[1], 16)));
      break;
    case 'orb': {
      const rarity = parseRarity(args[1], 'rare');
      if (!rarity || rarity === 'common') {
        tell(player, `${PREFIX}Usage: apoth:give orb <uncommon|rare|epic|mythic> [amount]`);
        return;
      }
      giveItem(player, createOrb(rarity, parseAmount(args[2], 1, 16)));
      break;
    }
    case 'gem': {
      const affix = args[1];
      if (!isAffixId(affix)) {
        tell(player, `${PREFIX}Usage: apoth:give gem <affixId> [rarity]`);
        return;
      }
      const rarity = parseRarity(args[2], 'rare');
      if (!rarity) {
        tell(player, `${PREFIX}Unknown rarity. Use ${RARITY_KEYS.join(', ')}.`);
        return;
      }
      giveItem(player, createGem(affix, rarity));
      break;
    }
    case 'gear': {
      const rarity = parseRarity(args[1], 'rare');
      if (!rarity) {
        tell(player, `${PREFIX}Unknown rarity. Use ${RARITY_KEYS.join(', ')}.`);
        return;
      }
      const bias = args[2] === 'weapon' || args[2] === 'armor' ? args[2] : undefined;
      giveItem(player, createRandomGearDrop(rarity, { slotBias: bias }));
      break;
    }
    case 'blankgem':
      giveItem(player, createBlankGem());
      break;
    case 'kit':
      giveKit(player);
      return;
    default:
      showHelp(player);
      return;
  }

  tell(player, `${PREFIX}Item delivered.`);
}

function printSettings(player: Player): void {
  const settings = loadSettings();
  tell(
    player,
    [
      `${PREFIX}§fSettings`,
      `§8naturalElites: §a${settings.naturalElites}`,
      `§8eliteChance: §a${settings.eliteChance}`,
      `§8maxElitesPerDimension: §a${settings.maxElitesPerDimension}`,
      `§8spawnerEliteChance: §a${settings.spawnerEliteChance}`,
    ].join('\n'),
  );
}

function handleConfig(player: Player, args: string[]): void {
  if (args.length === 0) {
    printSettings(player);
    tell(player, `${PREFIX}Keys: naturalelites, elitechance, maxelites, spawnerchance, reset`);
    return;
  }

  const key = args[0]?.toLowerCase() ?? '';
  const value = args[1];
  const settings: AddonSettings = loadSettings();

  if (key === 'reset') {
    saveSettings({ ...DEFAULT_SETTINGS });
    printSettings(player);
    return;
  }

  switch (key) {
    case 'naturalelites': {
      if (value !== 'true' && value !== 'false') {
        tell(player, `${PREFIX}Use true or false.`);
        return;
      }
      settings.naturalElites = value === 'true';
      break;
    }
    case 'elitechance': {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
        tell(player, `${PREFIX}Chance must be between 0 and 1.`);
        return;
      }
      settings.eliteChance = numeric;
      break;
    }
    case 'maxelites': {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 20) {
        tell(player, `${PREFIX}Max elites must be between 0 and 20.`);
        return;
      }
      settings.maxElitesPerDimension = Math.floor(numeric);
      break;
    }
    case 'spawnerchance': {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
        tell(player, `${PREFIX}Chance must be between 0 and 1.`);
        return;
      }
      settings.spawnerEliteChance = numeric;
      break;
    }
    default:
      tell(player, `${PREFIX}Unknown key "${key}".`);
      return;
  }

  saveSettings(settings);
  printSettings(player);
}

function handleSummon(player: Player, args: string[]): void {
  const rarity = parseRarity(args[0], 'rare');
  if (!rarity || rarity === 'common') {
    tell(player, `${PREFIX}Usage: apoth:summon <uncommon|rare|epic|mythic>`);
    return;
  }
  const elite = summonEliteNear(player, rarity);
  tell(player, elite ? `${PREFIX}Summoned a ${rarity} elite.` : `${PREFIX}§cThat elite definition is missing.`);
}

function handleScriptEvent(player: Player, id: string, message: string): void {
  const args = message.trim().length > 0 ? message.trim().split(/\s+/) : [];
  switch (id) {
    case 'apoth:help':
      showHelp(player);
      return;
    case 'apoth:give':
      handleGive(player, args);
      return;
    case 'apoth:summon':
      handleSummon(player, args);
      return;
    case 'apoth:config':
      handleConfig(player, args);
      return;
    case 'apoth:status': {
      const settings = loadSettings();
      tell(
        player,
        [
          `${PREFIX}§fStatus`,
          `§8Elites nearby (dimension): §a${elitePopulation()}`,
          `§8Spawners configured: §a${listSpawnerConfigs().length}`,
          `§8Mobs available: §a${SPAWNER_MOBS.length}`,
          `§8Natural elites: §a${settings.naturalElites} §8(${Math.round(settings.eliteChance * 100)}%)`,
        ].join('\n'),
      );
      return;
    }
    default:
      showHelp(player);
  }
}

/** Register the script-event listener. */
export function startCommands(): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (event) => {
      const source = event.sourceEntity;
      if (!source || source.typeId !== 'minecraft:player') return;
      try {
        handleScriptEvent(source as Player, event.id, event.message);
      } catch (error) {
        console.warn(`[Apotheosis] Command failed: ${String(error)}`);
      }
    },
    { namespaces: ['apoth'] },
  );

}
