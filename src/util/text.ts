/** String helpers shared by the UI, lore formatter and chat feedback. */

import { COLORS } from '../config';

/** Clamp a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Convert `diamond_sword` / `apotheosis:boss_blade` into `Diamond Sword`. */
export function titleCase(identifier: string): string {
  const bare = identifier.includes(':') ? identifier.split(':').pop() ?? identifier : identifier;
  return bare
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Colour + optionally embolden a piece of text. */
export function colorize(text: string, color: string, bold = false): string {
  return `${color}${bold ? '§l' : ''}${text}${COLORS.reset}`;
}

/** Truncate text to a maximum length (Minecraft lore lines are capped at 50). */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** Format 0.123 as `12.3%`. */
export function percent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals).replace(/\.0$/, '')}%`;
}

/** Human friendly health / damage bar used by the elite boss bar. */
export function healthBar(current: number, max: number, length = 16): string {
  const ratio = max <= 0 ? 0 : clamp(current / max, 0, 1);
  const filled = Math.round(ratio * length);
  return `${'§c❤'.repeat(filled)}${'§8❤'.repeat(length - filled)}`;
}

/** Format a number for lore without trailing `.0` or float noise. */
export function formatNumber(value: number, decimals = 0): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** Remove Minecraft formatting codes (§a, §l, …). */
export function stripFormatting(text: string): string {
  return text.replace(/§./g, '');
}

/** `true`/`false` to a coloured Yes/No. */
export function yesNo(value: boolean): string {
  return value ? `${COLORS.value}Yes` : `${COLORS.bad}No`;
}
