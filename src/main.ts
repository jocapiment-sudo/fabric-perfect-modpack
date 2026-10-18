/**
 * ============================================================================
 *  Apotheosis: Bedrock Edition — script entry point
 * ============================================================================
 *  This file wires the systems together. Everything is registered once, in the
 *  first game tick, so world APIs are guaranteed to be available.
 *
 *  System order matters only for readability:
 *    equipment -> reads gear and mirrors stats
 *    combat    -> uses gear stats for on-hit hooks
 *    bosses    -> spawns/promotes elites and drops loot
 *    spawner   -> simulates bound spawners
 *    interact  -> routes block/item interactions to UIs
 *    commands  -> admin script events
 * ============================================================================
 */

import { system } from '@minecraft/server';

import { AFFIXES } from './core/affixes';
import { ELITES } from './core/elites';
import { RARITIES } from './core/rarity';
import { startBossSystem } from './systems/bosses';
import { startCombatSystem } from './systems/combat';
import { startCommands } from './systems/commands';
import { startEquipmentSystem } from './systems/equipment';
import { startInteractions } from './systems/interactions';
import { startSpawnerSystem } from './systems/spawner';

const VERSION = '1.0.0';
const LOG = '§5[Apotheosis]§r';

let booted = false;

function boot(): void {
  if (booted) return;
  booted = true;

  console.warn(`${LOG} v${VERSION} booting — ${RARITIES.length} rarities, ${AFFIXES.length} affixes, ${ELITES.length} elites.`);

  startEquipmentSystem();
  startCombatSystem();
  startBossSystem();
  startSpawnerSystem();
  startInteractions();
  startCommands();

  console.warn(`${LOG} Ready. Run /scriptevent apoth:help for admin item commands.`);
}

// Defer one tick so the world and all dimensions are ready.
system.run(() => {
  try {
    boot();
  } catch (error) {
    console.error(`${LOG} Fatal boot error: ${String(error)}`);
  }
});
