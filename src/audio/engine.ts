// The game's single door to sound. Silent until unlock() is called from a user gesture
// (browsers block audio before that), and it never lets an audio error reach the game.
import type { AudioSettings } from "./settings";
import { playVoice as webAudioVoice, type VoiceSettings } from "./synth";

export type Bus = "sfx" | "music";

export interface AudioEngine {
  /** Call from a click or key press. Safe to call again. */
  unlock(): void;
  readonly unlocked: boolean;
  /** Play one note now, or at audio time `when` (for music scheduling). */
  playNote(voice: VoiceSettings, hz: number, duration: number, bus: Bus, when?: number): void;
  /** The audio clock in seconds (0 before unlock). */
  now(): number;
  setVolumes(settings: AudioSettings): void;
  /** Fades the music bus to silence over `seconds`, then restores its volume for next time. */
  fadeOutMusic(seconds: number): void;
}

interface EngineDeps {
  createContext: () => AudioContext;
  playVoice: typeof webAudioVoice;
}

const defaultDeps: EngineDeps = {
  createContext: () => new AudioContext(),
  playVoice: webAudioVoice,
};

/** Pause after a fade before the music bus is turned back up. */
const FADE_RESTORE_GAP = 0.05;

export function createWebAudioEngine(deps: EngineDeps = defaultDeps): AudioEngine {
  let ctx: AudioContext | null = null;
  let buses: { master: GainNode; sfx: GainNode; music: GainNode } | null = null;
  let volumes: AudioSettings | null = null;

  const applyVolumes = () => {
    if (!buses || !volumes) return;
    buses.master.gain.value = volumes.muted ? 0 : 1;
    buses.sfx.gain.value = volumes.sfx;
    buses.music.gain.value = volumes.music;
  };

  return {
    get unlocked() {
      return ctx !== null;
    },

    unlock() {
      try {
        if (!ctx) {
          const context = deps.createContext();
          // A gentle limiter so stacked sounds don't clip.
          const limiter = context.createDynamicsCompressor();
          limiter.connect(context.destination);
          const master = context.createGain();
          master.connect(limiter);
          const sfx = context.createGain();
          sfx.connect(master);
          const music = context.createGain();
          music.connect(master);
          ctx = context;
          buses = { master, sfx, music };
          applyVolumes();
        }
        void ctx.resume().catch(() => {});
      } catch {
        // No audio available: stay silent.
      }
    },

    playNote(voice, hz, duration, bus, when) {
      if (!ctx || !buses) return;
      try {
        deps.playVoice(ctx, buses[bus], voice, hz, when ?? ctx.currentTime, duration);
      } catch {
        // A failed note is just a missing sound.
      }
    },

    now() {
      return ctx?.currentTime ?? 0;
    },

    setVolumes(settings) {
      volumes = { ...settings };
      applyVolumes();
    },

    fadeOutMusic(seconds) {
      if (!ctx || !buses) return;
      try {
        const gain = buses.music.gain;
        const now = ctx.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + seconds);
        // Notes already queued end within the fade; then the bus is ready for the next song.
        gain.setValueAtTime(volumes?.music ?? 1, now + seconds + FADE_RESTORE_GAP);
      } catch {
        // No fade: the music just stops.
      }
    },
  };
}

/** Unlocks audio on the first click, tap or key press anywhere on the page. */
export function unlockOnFirstGesture(engine: AudioEngine, target: Window = window): void {
  const options = { capture: true };
  const unlock = () => {
    engine.unlock();
    target.removeEventListener("pointerdown", unlock, options);
    target.removeEventListener("keydown", unlock, options);
  };
  target.addEventListener("pointerdown", unlock, options);
  target.addEventListener("keydown", unlock, options);
}
