import { MultiplayerMode } from "../types";

const VALID_MODES: MultiplayerMode[] = ["offline", "online"];
const DEFAULT_SERVER_URL = "ws://localhost:7777";
const DEFAULT_ROOM_ID = "default";
const DEFAULT_PLAYER_NAME = "Player";

export interface MultiplayerConfig {
  mode: MultiplayerMode;
  serverUrl: string;
  roomId: string;
  playerName: string;
}

function getParam(
  params: URLSearchParams,
  key: string,
  fallback: string,
): string {
  const value = params.get(key)?.trim();
  return value && value.length > 0 ? value : fallback;
}

/** Parse a `?mode=&server=&room=&name=` query string into a config (pure). */
export function parseMultiplayerConfig(search: string): MultiplayerConfig {
  const params = new URLSearchParams(search);
  const modeParam = params.get("mode") as MultiplayerMode | null;
  const mode =
    modeParam && VALID_MODES.includes(modeParam) ? modeParam : "offline";

  return {
    mode,
    serverUrl: getParam(params, "server", DEFAULT_SERVER_URL),
    roomId: getParam(params, "room", DEFAULT_ROOM_ID),
    playerName: getParam(params, "name", DEFAULT_PLAYER_NAME),
  };
}

export function getMultiplayerConfigFromUrl(): MultiplayerConfig {
  return parseMultiplayerConfig(
    typeof window === "undefined" ? "" : window.location.search,
  );
}

export function getMultiplayerModeFromUrl(): MultiplayerMode {
  return getMultiplayerConfigFromUrl().mode;
}
