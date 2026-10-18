/**
 * Player feedback helpers (sounds, particles, chat).
 * Every function is defensive: a missing particle/sound must never break a tick.
 */

import { world, type Dimension, type Player, type Vector3 } from '@minecraft/server';

import { randFloat } from './random';

/** Send a chat line to a player. */
export function tell(player: Player, message: string): void {
  try {
    player.sendMessage(message);
  } catch {
    // Player disconnected between the event and the message.
  }
}

/** Send an action-bar line. */
export function actionBar(player: Player, message: string): void {
  try {
    player.onScreenDisplay.setActionBar(message);
  } catch {
    // Ignore transient failures (e.g. during dimension changes).
  }
}

/** Play a sound to one player. */
export function playSound(player: Player, soundId: string, volume = 1, pitch = 1): void {
  try {
    player.playSound(soundId, { volume, pitch });
  } catch {
    // Unknown sound or disconnected player.
  }
}

/** Play a world sound at a position. */
export function playSoundAt(location: Vector3, soundId: string, volume = 1, pitch = 1): void {
  try {
    world.playSound(soundId, location, { volume, pitch });
  } catch {
    // Unknown sound id.
  }
}

/** Spawn a single particle safely. */
export function particle(dimension: Dimension, location: Vector3, particleId: string): void {
  try {
    dimension.spawnParticle(particleId, location);
  } catch {
    // Invalid particle id.
  }
}

/** Spawn a randomised burst of particles around a location. */
export function burst(
  dimension: Dimension,
  location: Vector3,
  particleId: string,
  count = 12,
  spread = 0.6,
  height = 1.0,
): void {
  for (let i = 0; i < count; i++) {
    particle(dimension, {
      x: location.x + randFloat(-spread, spread),
      y: location.y + randFloat(0, height),
      z: location.z + randFloat(-spread, spread),
    }, particleId);
  }
}

/** Play a sound and show a message for an error. */
export function fail(player: Player, message: string, soundId: string): void {
  tell(player, `§c✖ §7${message}`);
  playSound(player, soundId, 0.7, 0.8);
}
