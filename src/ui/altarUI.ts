/**
 * ============================================================================
 *  Reforging Altar UI
 * ============================================================================
 *  ActionFormData is the main menu; MessageFormData handles confirmations and
 *  the inspector; ModalFormData is used by the spawner UI. This file is pure
 *  presentation — every rule lives in `systems/altar.ts`.
 * ============================================================================
 */

import { ActionFormData } from '@minecraft/server-ui';
import type { Player } from '@minecraft/server';

import { IDS, SOUNDS } from '../config';
import { AFFIX_BY_ID, affixValueText } from '../core/affixes';
import { countBlankGems, countItem, getInventory } from '../core/inventory';
import { gemDisplayName } from '../core/naming';
import { readGemData } from '../core/itemData';
import { RARITY_BY_KEY, affixCapacity, nextRarity } from '../core/rarity';
import {
  gemSlots,
  getHeldGear,
  infuseBlankGem,
  inspectHeld,
  listApplicableAffixes,
  reforgeCostFor,
  reforgeHeld,
  salvageHeld,
  socketGemFromSlot,
  upgradeHeld,
  upgradeInfoFor,
  type AltarResult,
  type HeldGear,
} from '../systems/altar';
import { actionBar, playSound, tell } from '../util/feedback';
import { stripFormatting } from '../util/text';
import { showAction } from './forms';

const DUST_ICON = 'textures/items/apoth_arcane_dust';
const GEM_ICON = 'textures/items/apoth_affix_gem';
const ORB_ICON = 'textures/items/apoth_orb_epic';
const HAMMER_ICON = 'textures/items/apoth_reforge_hammer';

/** Show the result of an altar operation as chat + action bar. */
function announce(player: Player, result: AltarResult): void {
  if (result.ok) {
    tell(player, `§8[§5Apotheosis§8] §a✔ §7${result.message}`);
    actionBar(player, `§a✔ ${stripFormatting(result.message)}`);
  } else {
    tell(player, `§8[§5Apotheosis§8] §c✖ §7${result.message}`);
    playSound(player, SOUNDS.error, 0.6, 0.8);
  }
}

async function confirm(player: Player, title: string, body: string, confirmLabel: string): Promise<boolean> {
  const response = await showAction(
    player,
    new ActionFormData().title(title).body(body).button(confirmLabel).button('§8Cancel'),
  );
  return Boolean(response && !response.canceled && response.selection === 0);
}

/** Header text shown in the main altar form. */
function buildBody(player: Player, gear: HeldGear, dust: number, gemCount: number, blankCount: number): string {
  const lines = [`§7Held: §f${stripFormatting(gear.item.nameTag ?? gear.item.typeId)}`];

  if (gear.data) {
    const rarity = RARITY_BY_KEY[gear.data.rarity];
    lines.push(
      `${rarity.color}${rarity.bold ? '§l' : ''}${rarity.name} §r§8• §7iLvl ${gear.data.level} §8• §7${gear.data.affixes.length}/${affixCapacity(gear.data.rarity)} affixes`,
    );
  } else {
    lines.push('§8Unaffixed — socket a gem to begin.');
  }

  lines.push(`§7Dust: §d${dust} §8| §7Level: §a${player.level}`);
  lines.push(`§7Gems: §d${gemCount} §8| §7Blank: §7${blankCount}`);
  return lines.join('\n');
}

/** Gem picker. A successful socket returns to the main menu. */
async function pickGem(player: Player): Promise<void> {
  const gems = gemSlots(player);
  if (gems.length === 0) {
    tell(player, '§7You have no affix gems. Infuse a blank gem or slay elites.');
    return;
  }

  const form = new ActionFormData()
    .title('§5Socket a Gem')
    .body('§7Choose a gem to socket into your held item.\n§8Cost: 2 Arcane Dust + 1 level');

  for (const entry of gems) {
    const info = readGemData(entry.item);

    if (!info) {
      form.button('§7Blank Affix Gem §8— infuse first', GEM_ICON);
    } else {
      const def = AFFIX_BY_ID[info.affix];
      form.button(`${gemDisplayName(info)} §8— ${affixValueText(def, def.values[RARITY_BY_KEY[info.rarity].tier])}`, GEM_ICON);
    }
  }
  form.button('§8Back', DUST_ICON);

  const response = await showAction(player, form);
  if (!response || response.canceled || response.selection === undefined) return;
  if (response.selection >= gems.length) return;

  const entry = gems[response.selection];
  if (!entry) return;

  const gem = readGemData(entry.item);
  if (!gem) {
    tell(player, '§7This gem is blank. Use “Infuse blank gem” first.');
    return;
  }

  const def = AFFIX_BY_ID[gem.affix];
  const ok = await confirm(
    player,
    '§5Socket Gem',
    `Socket §f${def.name} §7(${RARITY_BY_KEY[gem.rarity].name})?\n§8Cost: 2 Arcane Dust + 1 level`,
    '§aSocket',
  );
  if (ok) announce(player, socketGemFromSlot(player, entry.slot));
}

/** Affix picker for a blank gem. */
async function pickInfusion(player: Player, gear: HeldGear): Promise<void> {
  const choices = listApplicableAffixes(gear);
  if (choices.length === 0) {
    tell(player, '§7No affixes are available for this item (all slots are filled).');
    return;
  }

  const form = new ActionFormData()
    .title('§5Infuse a Blank Gem')
    .body('§7Choose the affix to seal into a blank gem.\n§8Cost: 4 Arcane Dust + 1 level');

  for (const choice of choices) {
    const marker = choice.def.kind === 'prefix' ? '✦' : '❖';
    form.button(`§f${marker} ${choice.def.name} §8(${affixValueText(choice.def, choice.value)})`, GEM_ICON);
  }
  form.button('§8Back', DUST_ICON);

  const response = await showAction(player, form);
  if (!response || response.canceled || response.selection === undefined) return;
  if (response.selection >= choices.length) return;

  const choice = choices[response.selection];
  if (!choice) return;

  const ok = await confirm(
    player,
    '§5Infuse Gem',
    `Seal §f${choice.def.name} §7into a blank gem?\n§8Cost: 4 Arcane Dust + 1 level`,
    '§aInfuse',
  );
  if (ok) announce(player, infuseBlankGem(player, choice.def.id));
}

/** Inspect dialog. */
async function inspect(player: Player): Promise<void> {
  const result = inspectHeld(player);
  if (!result.ok) {
    announce(player, result);
    return;
  }
  await showAction(
    player,
    new ActionFormData().title('§5Item Inspection').body(result.message).button('§7Back').button('§8Close'),
  );
}

/**
 * Main altar loop. The menu re-opens after every successful action so players
 * can chain reforge -> upgrade -> socket without walking away.
 */
export async function openAltar(player: Player): Promise<void> {
  playSound(player, SOUNDS.uiOpen, 0.7, 1.1);

  for (let depth = 0; depth < 15; depth++) {
    const gear = getHeldGear(player);
    if ('error' in gear) {
      tell(player, `§c✖ §7${gear.error}`);
      playSound(player, SOUNDS.error, 0.6, 0.8);
      return;
    }

    const container = getInventory(player);
    const dust = container ? countItem(container, IDS.dust) : 0;
    const gems = gemSlots(player);
    const blanks = container ? countBlankGems(container) : 0;

    const data = gear.data;
    const reforgeCost = data ? reforgeCostFor(data) : undefined;
    const upgrade = data ? upgradeInfoFor(data) : undefined;
    const target = data ? nextRarity(data.rarity) : undefined;

    const form = new ActionFormData()
      .title('§5Reforging Altar')
      .body(buildBody(player, gear, dust, gems.length, blanks))
      .button(
        reforgeCost ? `§fReforge affixes §8(${reforgeCost.dust}d, ${reforgeCost.levels}L)` : '§8Reforge (needs affixes)',
        HAMMER_ICON,
      )
      .button(
        upgrade && target
          ? `§fUpgrade → ${target.color}${target.name} §8(${upgrade.cost.dust}d, orb)`
          : '§8Upgrade (max rarity)',
        ORB_ICON,
      )
      .button(`§fSocket a gem §8(${gems.length})`, GEM_ICON)
      .button(`§fInfuse blank gem §8(${blanks})`, GEM_ICON)
      .button('§fInspect item', DUST_ICON)
      .button('§cSalvage item', DUST_ICON)
      .button('§8Close');

    const response = await showAction(player, form);
    if (!response || response.canceled || response.selection === undefined) return;

    switch (response.selection) {
      case 0:
        announce(player, reforgeHeld(player));
        break;

      case 1: {
        if (!data || !upgrade || !target) {
          announce(player, { ok: false, message: 'This item cannot be upgraded further.' });
          break;
        }
        const ok = await confirm(
          player,
          '§5Upgrade Rarity',
          `Upgrade to ${target.color}${target.name}§7?\n§8Cost: ${upgrade.cost.dust} dust, ${upgrade.cost.levels} levels, 1 ${target.name} Orb`,
          '§aUpgrade',
        );
        if (ok) announce(player, upgradeHeld(player));
        break;
      }

      case 2:
        await pickGem(player);
        break;

      case 3:
        await pickInfusion(player, gear);
        break;

      case 4:
        await inspect(player);
        break;

      case 5: {
        const ok = await confirm(
          player,
          '§cSalvage Item',
          '§7This permanently destroys the held item and returns some materials.\n§cThis cannot be undone.',
          '§cSalvage',
        );
        if (ok) {
          announce(player, salvageHeld(player));
          return;
        }
        break;
      }

      case 6:
      default:
        return;
    }
  }

  tell(player, '§8The altar’s hum fades.');
}

// Re-exported so other UIs can reuse the held-item guard.
export { getHeldGear };
