// Evens out how loud songs are: a dense arrangement shouldn't blast and a quiet one shouldn't
// be lost. A song's level is estimated from its notes (volume and envelope), and a gain
// brings it towards a common target. Pure.
import type { MidiNote } from "./midi";
import type { VoiceSettings } from "./synth";

/** The level songs are brought to (about that of the built-in songs). */
export const TARGET_LOUDNESS = 0.2;
export const MIN_GAIN = 0.25;
export const MAX_GAIN = 4;

/**
 * Root-mean-square level of the song's notes over its length, treating notes as adding up in
 * power. `voiceFor` gives the voice a note plays on (null: not played).
 */
export function loudness(
  notes: readonly MidiNote[],
  voiceFor: (note: MidiNote) => VoiceSettings | null,
  duration: number,
): number {
  if (duration <= 0) return 0;
  let energy = 0;
  for (const note of notes) {
    const voice = voiceFor(note);
    if (!voice) continue;
    const peak = (voice.volume * note.velocity) / 127;
    energy += peak * peak * ringingSeconds(voice, note.duration);
  }
  return Math.sqrt(energy / duration);
}

/**
 * Seconds at full power equivalent to one note through its envelope: linear ramps carry a
 * third of the power of their ends' average square.
 */
function ringingSeconds(voice: VoiceSettings, duration: number): number {
  const { attack, decay, sustain, release } = voice.envelope;
  const attacking = Math.min(duration, attack);
  const decaying = Math.min(Math.max(0, duration - attack), decay);
  const holding = Math.max(0, duration - attack - decay);
  const s2 = sustain * sustain;
  return (
    attacking / 3 + (decaying * (1 + sustain + s2)) / 3 + holding * s2 + (release * s2) / 3
  );
}

/** The gain that brings `level` to `target`, within limits. Silence is left alone. */
export function normalisingGain(level: number, target = TARGET_LOUDNESS): number {
  if (level <= 0) return 1;
  return Math.min(MAX_GAIN, Math.max(MIN_GAIN, target / level));
}
