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

export function getMultiplayerConfigFromUrl(): MultiplayerConfig {
  if (typeof window === "undefined") {
    return {
      mode: "offline",
      serverUrl: DEFAULT_SERVER_URL,
      roomId: DEFAULT_ROOM_ID,
      playerName: DEFAULT_PLAYER_NAME,
    };
  }

  const params = new URLSearchParams(window.location.search);
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

export function getMultiplayerModeFromUrl(): MultiplayerMode {
  return getMultiplayerConfigFromUrl().mode;
}
