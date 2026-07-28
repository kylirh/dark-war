/**
 * Verifies that every runtime sound ID has an OGG asset and WAV sources do not
 * accidentally return to the packaged sound directory.
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SoundEffect } from "../../engine/content/sound-effects";

const SOUND_DIR = resolve(process.cwd(), "app", "assets", "sounds");

describe("sound assets", () => {
  it("provides an OGG file for every runtime sound effect", () => {
    for (const effect of Object.values(SoundEffect)) {
      expect(existsSync(resolve(SOUND_DIR, `${effect}.ogg`))).toBe(true);
    }
  });

  it("contains no unconverted source-audio formats", () => {
    const sourceAudioFiles = readdirSync(SOUND_DIR).filter((fileName: string) =>
      /\.(wav|mp3|m4a)$/i.test(fileName),
    );
    expect(sourceAudioFiles).toEqual([]);
  });
});
