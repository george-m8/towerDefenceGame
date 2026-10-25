// Pure maths for the synth: note frequencies, semitone shifts, pulse-width delays and the
// breakpoints of an ADSR envelope. synth.ts applies these to Web Audio; tests check them here.

const NOTE_OFFSETS: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

/** A pulse narrower or wider than this disappears, so duty cycles are clamped to it. */
export const MIN_DUTY = 0.05;
export const MAX_DUTY = 0.95;

export interface Envelope {
  attack: number; // seconds to full volume
  decay: number; // seconds to the sustain level
  sustain: number; // 0-1, fraction of full volume held while the note lasts
  release: number; // seconds to silence after the note ends
}

export interface EnvelopePoint {
  time: number;
  value: number;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Scientific pitch: C4 = 60, A4 = 69. */
export function noteToMidi(name: string, octave: number): number {
  const offset = NOTE_OFFSETS[name];
  if (offset === undefined) throw new Error(`Unknown note name: ${name}`);
  return (octave + 1) * 12 + offset;
}

export function noteToHz(name: string, octave: number): number {
  return midiToHz(noteToMidi(name, octave));
}

export function shiftSemitones(hz: number, semitones: number): number {
  return hz * 2 ** (semitones / 12);
}

/**
 * A pulse wave is a sawtooth minus a delayed copy of itself; delaying by duty/frequency
 * gives that duty cycle.
 */
export function pulseDelay(hz: number, duty: number): number {
  return Math.min(MAX_DUTY, Math.max(MIN_DUTY, duty)) / hz;
}

/** Gain breakpoints for a note of `duration` seconds starting at `start`, peaking at `volume`. */
export function envelopePoints(
  start: number,
  duration: number,
  env: Envelope,
  volume: number,
): EnvelopePoint[] {
  const sustainLevel = volume * env.sustain;
  const end = start + duration;
  const points: EnvelopePoint[] = [{ time: start, value: 0 }];
  if (duration < env.attack) {
    // Released mid-attack: stop rising where the note ends.
    points.push({ time: end, value: volume * (duration / env.attack) });
  } else if (duration < env.attack + env.decay) {
    // Released mid-decay.
    const decayed = env.decay > 0 ? (duration - env.attack) / env.decay : 1;
    points.push({ time: start + env.attack, value: volume });
    points.push({ time: end, value: volume - (volume - sustainLevel) * decayed });
  } else {
    points.push({ time: start + env.attack, value: volume });
    points.push({ time: start + (env.attack + env.decay), value: sustainLevel });
    points.push({ time: end, value: sustainLevel });
  }
  points.push({ time: end + env.release, value: 0 });
  return points;
}
