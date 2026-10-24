import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  saveAudioSettings,
} from "../../src/audio/settings";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("audio settings", () => {
  it("round-trips mute and volumes through storage", () => {
    const storage = memoryStorage();
    saveAudioSettings(storage, { muted: true, music: 0.25, sfx: 0.5 });
    expect(loadAudioSettings(storage)).toEqual({ muted: true, music: 0.25, sfx: 0.5 });
  });

  it("uses defaults when nothing is saved, or the saved value is junk", () => {
    const storage = memoryStorage();
    expect(loadAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    storage.setItem("keep-audio", "{not json");
    expect(loadAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it("clamps out-of-range volumes and ignores wrong types", () => {
    const storage = memoryStorage();
    storage.setItem("keep-audio", JSON.stringify({ muted: "yes", music: 7, sfx: -1 }));
    expect(loadAudioSettings(storage)).toEqual({
      muted: DEFAULT_AUDIO_SETTINGS.muted,
      music: 1,
      sfx: 0,
    });
  });

  it("falls back to defaults, without throwing, when storage is blocked", () => {
    expect(loadAudioSettings(blocked)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(() => saveAudioSettings(blocked, DEFAULT_AUDIO_SETTINGS)).not.toThrow();
    expect(loadAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });
});
