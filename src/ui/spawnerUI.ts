/**
 * ============================================================================
 *  Spawner UI
 * ============================================================================
 *  ModalFormData is a natural fit for numeric tuning: sliders for delay,
 *  wave size, population cap, activation range and elite chance, a dropdown
 *  for the mob type and a toggle for particles.
 * ============================================================================
 */

import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import type { Block, Player } from '@minecraft/server';

import { IDS, PARTICLES, SOUNDS, SPAWNER, SPAWNER_MOBS } from '../config';
import { burst, playSoundAt, tell } from '../util/feedback';
import {
  convertVanillaSpawner,
  defaultSpawnerConfig,
  getSpawnerConfig,
  listSpawnerConfigs,
  upsertSpawner,
  type SpawnerConfig,
} from '../systems/spawner';
import { showAction, showModal } from './forms';

function asNumber(value: boolean | number | string | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Open the tuning modal for one of our spawners. */
export async function openSpawnerSettings(player: Player, block: Block): Promise<void> {
  const config =
    getSpawnerConfig(block.dimension.id, block.location) ??
    defaultSpawnerConfig(block.dimension.id, block.location);

  const mobIndex = Math.max(0, SPAWNER_MOBS.findIndex((mob) => mob.id === config.mob));

  const form = new ModalFormData()
    .title('§5Apotheosis Spawner')
    .dropdown('§7Mob type', SPAWNER_MOBS.map((mob) => mob.name), mobIndex)
    .slider(`§7Delay between waves §8(${SPAWNER.minDelay}-${SPAWNER.maxDelay}s)`, SPAWNER.minDelay, SPAWNER.maxDelay, 1, config.delay)
    .slider('§7Mobs per wave', SPAWNER.minCount, SPAWNER.maxCount, 1, config.count)
    .slider('§7Max nearby mobs', SPAWNER.minMaxNearby, SPAWNER.maxMaxNearby, 1, config.maxNearby)
    .slider('§7Activation range §8(blocks)', SPAWNER.minRange, SPAWNER.maxRange, 1, config.range)
    .slider('§7Elite chance §8(%)', 0, 100, 5, Math.round(config.eliteChance * 100))
    .toggle('§7Particle effects', config.particles);

  const response = await showModal(player, form);
  if (!response || response.canceled || !response.formValues) return;

  const values = response.formValues;
  const mobChoice = asNumber(values[0], mobIndex);
  const selectedMob = SPAWNER_MOBS[Math.floor(mobChoice)] ?? SPAWNER_MOBS[0];

  const updated: SpawnerConfig = {
    ...config,
    mob: selectedMob?.id ?? 'minecraft:zombie',
    delay: Math.round(asNumber(values[1], config.delay)),
    count: Math.round(asNumber(values[2], config.count)),
    maxNearby: Math.round(asNumber(values[3], config.maxNearby)),
    range: Math.round(asNumber(values[4], config.range)),
    eliteChance: Math.min(1, Math.max(0, asNumber(values[5], config.eliteChance * 100) / 100)),
    particles: values[6] === undefined ? config.particles : Boolean(values[6]),
  };

  const saved = upsertSpawner(updated);

  burst(block.dimension, block.center(), PARTICLES.spawnerBurst, 12, 0.5, 0.8);
  playSoundAt(block.center(), SOUNDS.uiClick, 0.8, 1.2);
  tell(
    player,
    [
      '§8[§5Apotheosis§8] §aSpawner updated',
      `§7Mob: §f${SPAWNER_MOBS.find((mob) => mob.id === saved.mob)?.name ?? saved.mob}`,
      `§7Delay: §f${saved.delay}s §8| §7Wave: §f${saved.count} §8| §7Cap: §f${saved.maxNearby}`,
      `§7Range: §f${saved.range} §8| §7Elite: §f${Math.round(saved.eliteChance * 100)}%`,
    ].join('\n'),
  );
}

/** Confirm converting a vanilla spawner, then open the tuning modal. */
export async function openVanillaConversion(player: Player, block: Block): Promise<void> {
  const response = await showAction(
    player,
    new ActionFormData()
      .title('§5Bind Mob Spawner')
      .body(
        [
          '§7Bedrock does not expose spawner NBT to scripts,',
          '§7so this spawner cannot be tuned in place.',
          '',
          '§fBind it to Apotheosis?',
          '§8The block becomes an Apotheosis Spawner and',
          '§8its spawning is simulated by the add-on.',
        ].join('\n'),
      )
      .button('§aBind spawner')
      .button('§8Cancel'),
  );

  if (!response || response.canceled || response.selection !== 0) return;

  const config = convertVanillaSpawner(block, player);
  if (!config) return;

  tell(
    player,
    '§8[§5Apotheosis§8] §a✔ Spawner bound. §7Vanilla spawner NBT is unreadable, so the mob defaults to §fZombie§7 — set it below.',
  );
  await openSpawnerSettings(player, block);
}

/** Entry point used by the interaction router. */
export async function handleSpawnerUse(player: Player, block: Block): Promise<void> {
  try {
    if (block.permutation.matches(IDS.spawner)) {
      await openSpawnerSettings(player, block);
      return;
    }
    if (block.permutation.matches(IDS.vanillaSpawner)) {
      await openVanillaConversion(player, block);
      return;
    }
    tell(player, '§7Use the §fSpawner Tuning Fork§7 on a §8Mob Spawner§7.');
  } catch (error) {
    console.warn(`[Apotheosis] Spawner UI failed: ${String(error)}`);
    tell(player, '§cThe spawner UI failed to open.');
  }
}

/** Codex helper: a compact list of configured spawners. */
export function spawnerSummary(): string[] {
  const configs = listSpawnerConfigs();
  if (configs.length === 0) return ['§8No Apotheosis spawners configured yet.'];
  return configs.slice(0, 12).map((config) => {
    const mob = SPAWNER_MOBS.find((entry) => entry.id === config.mob)?.name ?? config.mob;
    return `§7${mob} §8@ §f${config.x}, ${config.y}, ${config.z} §8(${config.dimension.replace('minecraft:', '')})`;
  });
}

/** Kept for future UI work (e.g. a multi-spawner dashboard). */
export async function openSpawnerDashboard(player: Player): Promise<void> {
  const configs = listSpawnerConfigs();
  const form = new ActionFormData()
    .title('§5Configured Spawners')
    .body(configs.length === 0 ? '§8No spawners configured.' : '§7Use a tuning fork on a spawner to edit it.');

  for (const config of configs.slice(0, 20)) {
    const mob = SPAWNER_MOBS.find((entry) => entry.id === config.mob)?.name ?? config.mob;
    form.button(`§f${mob} §8@ ${config.x}, ${config.y}, ${config.z}`);
  }
  form.button('§8Close');

  await showAction(player, form);
}
