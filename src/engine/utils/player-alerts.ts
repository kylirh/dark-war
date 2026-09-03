/** Queues short, ephemeral screen alerts without coupling the engine to the UI. */

import { GameState, PlayerAlert } from "../types";

export const MAX_PENDING_PLAYER_ALERTS = 32;
const MAX_PLAYER_ALERT_CODEPOINTS = 160;

export interface EmitPlayerAlertOptions {
  durationMs?: number;
  audiencePlayerIds?: string[];
}

/** Queue a sanitized screen alert for local or per-player presentation. */
export function emitPlayerAlert(
  state: GameState,
  message: string,
  options: EmitPlayerAlertOptions = {},
): PlayerAlert | undefined {
  const normalizedMessage = message
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (normalizedMessage.length === 0) return undefined;

  const alert: PlayerAlert = {
    message: Array.from(normalizedMessage)
      .slice(0, MAX_PLAYER_ALERT_CODEPOINTS)
      .join(""),
    durationMs: options.durationMs,
    audiencePlayerIds: options.audiencePlayerIds
      ? [...options.audiencePlayerIds]
      : undefined,
  };
  state.pendingAlerts.push(alert);
  if (state.pendingAlerts.length > MAX_PENDING_PLAYER_ALERTS) {
    state.pendingAlerts.splice(
      0,
      state.pendingAlerts.length - MAX_PENDING_PLAYER_ALERTS,
    );
  }
  return alert;
}
