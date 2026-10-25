import { describe, expect, it } from "vitest";
import { MAX_GAIN, MIN_GAIN, loudness, normalisingGain } from "../../src/audio/loudness";
import type { MidiNote } from "../../src/audio/midi";
import type { VoiceSettings } from "../../src/audio/synth";

const organ: VoiceSettings = {
  wave: "pulse",
  volume: 0.1,
  envelope: { attack: 0, decay: 0, sustain: 1, release: 0 },
};
const note = (time: number, velocity = 127, midi = 60): MidiNote => ({
  time,
  duration: 1,
  midi,
  velocity,
  channel: 0,
});
const level = (notes: MidiNote[], duration = 4) => loudness(notes, () => organ, duration);

describe("loudness", () => {
  it("is the RMS level of the song's notes over its length", () => {
    // One full-volume note sounding for 1 s of a 4 s song: sqrt(0.1² * 1 / 4).
    expect(level([note(0)])).toBeCloseTo(0.05);
  });

  it("grows with velocity and with notes sounding together", () => {
    const one = level([note(0)]);
    expect(level([note(0, 64)])).toBeCloseTo((one * 64) / 127);
    expect(level([note(0), note(0, 127, 64)])).toBeCloseTo(one * Math.SQRT2);
  });

  it("counts a plucked note only while it rings", () => {
    const pluck: VoiceSettings = {
      ...organ,
      envelope: { attack: 0, decay: 0.3, sustain: 0, release: 0 },
    };
    // A linear fade from full to nothing over 0.3 s has a third of its power.
    expect(loudness([note(0)], () => pluck, 4)).toBeCloseTo(Math.sqrt((0.01 * 0.1) / 4));
  });

  it("skips notes with no instrument, and is 0 for silence", () => {
    expect(loudness([note(0)], () => null, 4)).toBe(0);
    expect(level([], 4)).toBe(0);
    expect(level([note(0)], 0)).toBe(0);
  });
});

describe("normalisingGain", () => {
  it("brings a song's level to the target", () => {
    expect(normalisingGain(0.05, 0.1)).toBeCloseTo(2);
    expect(normalisingGain(0.2, 0.1)).toBeCloseTo(0.5);
  });

  it("is limited, and leaves silence alone", () => {
    expect(normalisingGain(0.0001, 0.1)).toBe(MAX_GAIN);
    expect(normalisingGain(100, 0.1)).toBe(MIN_GAIN);
    expect(normalisingGain(0, 0.1)).toBe(1);
  });
});
