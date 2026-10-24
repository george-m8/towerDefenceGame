// Every sound effect in the game, tuned here. Play them all on the dev page: ?soundtest
import { noteToHz } from "./envelopes";
import type { VoiceSettings } from "./synth";

export type CueKind =
  | "enemyHit"
  | "keepHit"
  | "treasure"
  | "splash"
  | "build"
  | "sell"
  | "denied"
  | "waveStart"
  | "gameOver";

export interface SoundNote {
  voice: VoiceSettings;
  hz: number;
  /** Seconds the note is held (the release comes after). */
  duration: number;
  /** Seconds after the sound starts (for little phrases). */
  at?: number;
}

export interface SoundEffect {
  notes: SoundNote[];
  /** At most this many plays of this sound... */
  maxPerWindow: number;
  /** ...within this many seconds, so big waves stay a rhythm, not a wall of noise. */
  windowSeconds: number;
}

const blip = (duty: number, volume: number): VoiceSettings => ({
  wave: "pulse",
  duty,
  volume,
  envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
});

/** A phrase of equal-length notes, one after another. */
const phrase = (voice: VoiceSettings, notes: [string, number][], step: number): SoundNote[] =>
  notes.map(([name, octave], i) => ({
    voice,
    hz: noteToHz(name, octave),
    duration: step,
    at: i * step,
  }));

export const SOUNDS: Record<CueKind, SoundEffect> = {
  enemyHit: {
    notes: [
      {
        voice: {
          wave: "noise",
          volume: 0.22,
          envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
          lowpass: 5000,
        },
        hz: 0,
        duration: 0.05,
      },
    ],
    maxPerWindow: 4,
    windowSeconds: 0.1,
  },
  keepHit: {
    notes: [
      {
        voice: {
          wave: "pulse",
          duty: 0.5,
          pwm: { rate: 6, depth: 0.2 },
          volume: 0.35,
          envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 0.15 },
          pitchEnvelope: { semitones: 16, time: 0.25 },
        },
        hz: noteToHz("G", 3),
        duration: 0.35,
      },
    ],
    maxPerWindow: 2,
    windowSeconds: 0.2,
  },
  treasure: {
    notes: [
      {
        voice: {
          wave: "pulse",
          duty: 0.5,
          pwm: { rate: 8, depth: 0.2 },
          volume: 0.3,
          envelope: { attack: 0.002, decay: 0.15, sustain: 0.4, release: 0.2 },
          pitchEnvelope: { semitones: -14, time: 0.15 },
        },
        hz: noteToHz("C", 4),
        duration: 0.3,
      },
    ],
    maxPerWindow: 3,
    windowSeconds: 0.1,
  },
  splash: {
    notes: [
      {
        voice: {
          wave: "noise",
          volume: 0.4,
          envelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.1 },
          lowpass: 400,
        },
        hz: 0,
        duration: 0.2,
      },
    ],
    maxPerWindow: 3,
    windowSeconds: 0.1,
  },
  build: {
    notes: [{ voice: blip(0.25, 0.18), hz: noteToHz("C", 5), duration: 0.04 }],
    maxPerWindow: 6,
    windowSeconds: 0.1,
  },
  sell: {
    notes: phrase(
      blip(0.25, 0.18),
      [
        ["G", 5],
        ["C", 5],
      ],
      0.05,
    ),
    maxPerWindow: 4,
    windowSeconds: 0.1,
  },
  denied: {
    notes: phrase(
      blip(0.5, 0.2),
      [
        ["A", 2],
        ["A", 2],
      ],
      0.07,
    ),
    maxPerWindow: 1,
    windowSeconds: 0.25,
  },
  waveStart: {
    notes: phrase(
      blip(0.125, 0.2),
      [
        ["C", 4],
        ["E", 4],
        ["G", 4],
        ["C", 5],
      ],
      0.07,
    ),
    maxPerWindow: 1,
    windowSeconds: 0.5,
  },
  gameOver: {
    notes: phrase(
      {
        wave: "pulse",
        duty: 0.5,
        volume: 0.3,
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.2 },
      },
      [
        ["G", 4],
        ["E", 4],
        ["C", 4],
        ["G", 3],
      ],
      0.2,
    ),
    maxPerWindow: 1,
    windowSeconds: 1,
  },
};
