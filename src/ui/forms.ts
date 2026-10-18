/**
 * `@minecraft/server-ui` helpers.
 *
 * Bedrock forms fail with `UserBusy` when another form is still closing (very
 * common when a button re-opens a menu immediately). Every form in this pack
 * goes through these wrappers, which retry after a short delay.
 */

import { system, type Player } from '@minecraft/server';
import {
  FormCancelationReason,
  type ActionFormData,
  type ActionFormResponse,
  type FormResponse,
  type ModalFormData,
  type ModalFormResponse,
} from '@minecraft/server-ui';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_TICKS = 10;

/** Promise-based sleep on the game tick clock (not real time). */
export function waitTicks(ticks: number): Promise<void> {
  return new Promise((resolve) => {
    system.runTimeout(() => resolve(), Math.max(1, Math.floor(ticks)));
  });
}

async function withRetry<T extends FormResponse>(show: () => Promise<T>): Promise<T | undefined> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await show();
      if (!response.canceled || response.cancelationReason !== FormCancelationReason.UserBusy) {
        return response;
      }
    } catch (error) {
      console.warn(`[Apotheosis] Form failed to open: ${String(error)}`);
      return undefined;
    }
    await waitTicks(RETRY_DELAY_TICKS);
  }
  return undefined;
}

export function showAction(player: Player, form: ActionFormData): Promise<ActionFormResponse | undefined> {
  return withRetry(() => form.show(player));
}

export function showModal(player: Player, form: ModalFormData): Promise<ModalFormResponse | undefined> {
  return withRetry(() => form.show(player));
}
