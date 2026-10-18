/**
 * Small, dependency-free random helpers. Kept separate from gameplay code so
 * the RNG policy (inclusive integers, weight handling) is obvious and testable.
 */

/** Inclusive random integer in `[min, max]`. */
export function randInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Random float in `[min, max)`. */
export function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** True with the given probability (0..1). */
export function chance(probability: number): boolean {
  return Math.random() < probability;
}

/** Uniform pick from a non-empty array. */
export function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] as T;
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(values: readonly T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * Pick an entry using integer weights. Returns `undefined` only when the input
 * is empty, which callers must handle explicitly.
 */
export function weightedPick<T>(entries: readonly { value: T; weight: number }[]): T | undefined {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return entries[0]?.value;

  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1]?.value;
}

/** Round to a fixed number of decimal places without floating point noise. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
