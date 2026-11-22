/** Versioned, atomic checkpoints for named multiplayer room worlds. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SerializedState } from "../src/engine/types";
import { PROTOCOL_VERSION } from "../src/net/protocol";

export interface RoomCheckpoint {
  seed: number;
  worlds: SerializedState[];
}

export function loadRoomCheckpoint(
  directory: string,
  roomId: string,
): RoomCheckpoint | undefined {
  let json: string;
  try {
    json = readFileSync(join(directory, `${roomId}.json`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const checkpoint = JSON.parse(json) as RoomCheckpoint & { version: number };
  if (
    checkpoint.version !== PROTOCOL_VERSION ||
    !Number.isSafeInteger(checkpoint.seed) ||
    !Array.isArray(checkpoint.worlds)
  ) {
    throw new Error(`Unsupported Dark War room checkpoint for ${roomId}`);
  }
  return checkpoint;
}

export function saveRoomCheckpoint(
  directory: string,
  roomId: string,
  checkpoint: RoomCheckpoint,
): void {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${roomId}.json`);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(
    temporaryPath,
    JSON.stringify({ version: PROTOCOL_VERSION, ...checkpoint }),
  );
  renameSync(temporaryPath, path);
}
