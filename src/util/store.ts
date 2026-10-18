/**
 * Persistence helpers.
 *
 * Bedrock's Script API only exposes dynamic properties (no file IO), so all
 * small pieces of state are stored as JSON strings on the world object.
 * Writes are debounced because dynamic properties are flushed to the save file
 * and frequent writes are unnecessary for UI-driven configuration.
 */

import { system, world } from '@minecraft/server';

import { DEFAULT_SETTINGS, DP, type AddonSettings } from '../config';

/** Read and parse a JSON dynamic property, returning `fallback` on any error. */
export function readWorldJson<T>(key: string, fallback: T): T {
  try {
    const raw = world.getDynamicProperty(key);
    if (typeof raw !== 'string' || raw.length === 0) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[Apotheosis] Failed to read dynamic property "${key}": ${String(error)}`);
    return fallback;
  }
}

/** Serialize a value into a world dynamic property. */
export function writeWorldJson(key: string, value: unknown): void {
  try {
    world.setDynamicProperty(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[Apotheosis] Failed to write dynamic property "${key}": ${String(error)}`);
  }
}

/**
 * A debounced JSON writer. Multiple mutations within a short window result in a
 * single world dynamic-property write.
 */
export class DebouncedJsonStore {
  private timer: number | undefined;

  constructor(
    private readonly key: string,
    private readonly delayTicks = 20,
  ) {}

  save(value: unknown): void {
    if (this.timer !== undefined) {
      system.clearRun(this.timer);
      this.timer = undefined;
    }
    this.timer = system.runTimeout(() => {
      this.timer = undefined;
      writeWorldJson(this.key, value);
    }, this.delayTicks);
  }

  /** Flush immediately (used on shutdown-sensitive paths / admin commands). */
  flush(value: unknown): void {
    if (this.timer !== undefined) {
      system.clearRun(this.timer);
      this.timer = undefined;
    }
    writeWorldJson(this.key, value);
  }
}

/** Load runtime settings, filling in defaults for missing or invalid fields. */
export function loadSettings(): AddonSettings {
  const raw = readWorldJson<Partial<AddonSettings>>(DP.settings, {});
  const merged: AddonSettings = { ...DEFAULT_SETTINGS, ...raw };

  // Validate every field — corrupted worlds must never crash the tick loop.
  const eliteChance = Number(merged.eliteChance);
  const spawnerEliteChance = Number(merged.spawnerEliteChance);
  const maxElites = Number(merged.maxElitesPerDimension);

  return {
    naturalElites: Boolean(merged.naturalElites),
    eliteChance: Number.isFinite(eliteChance) ? Math.min(1, Math.max(0, eliteChance)) : DEFAULT_SETTINGS.eliteChance,
    maxElitesPerDimension: Number.isFinite(maxElites) ? Math.min(20, Math.max(0, Math.floor(maxElites))) : DEFAULT_SETTINGS.maxElitesPerDimension,
    spawnerEliteChance: Number.isFinite(spawnerEliteChance)
      ? Math.min(1, Math.max(0, spawnerEliteChance))
      : DEFAULT_SETTINGS.spawnerEliteChance,
  };
}

/** Persist runtime settings. */
export function saveSettings(settings: AddonSettings): void {
  writeWorldJson(DP.settings, settings);
}
