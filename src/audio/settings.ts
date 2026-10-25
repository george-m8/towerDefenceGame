// Mute, volumes and the music pack, remembered per device. Storage can be missing or blocked; the game must
// still work, so every read and write is guarded and falls back to defaults.

export interface AudioSettings {
  muted: boolean;
  /** 0-1 */
  music: number;
  /** 0-1 */
  sfx: number;
  /** The chosen music pack, "built-in", or null (not chosen: the first pack). */
  pack: string | null;
}

/** What the engine needs: mute and the two volumes. */
export type Volumes = Omit<AudioSettings, "pack">;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  music: 0.6,
  sfx: 0.8,
  pack: null,
};

const KEY = "keep-audio";

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function loadAudioSettings(storage: Storage | null): AudioSettings {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (!saved || typeof saved !== "object") return { ...DEFAULT_AUDIO_SETTINGS };
    const s = saved as Record<string, unknown>;
    return {
      muted: typeof s.muted === "boolean" ? s.muted : DEFAULT_AUDIO_SETTINGS.muted,
      music: volume(s.music, DEFAULT_AUDIO_SETTINGS.music),
      sfx: volume(s.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
      pack: typeof s.pack === "string" ? s.pack : null,
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(storage: Storage | null, settings: AudioSettings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not remembered this time; harmless.
  }
}

function volume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}
