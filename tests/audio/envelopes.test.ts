import { describe, expect, it } from "vitest";
import {
  MAX_DUTY,
  MIN_DUTY,
  envelopePoints,
  midiToHz,
  noteToHz,
  noteToMidi,
  pulseDelay,
  shiftSemitones,
} from "../../src/audio/envelopes";

describe("note maths", () => {
  it("converts MIDI notes and names to frequencies", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 9);
    expect(noteToMidi("A", 4)).toBe(69);
    expect(noteToMidi("C", 4)).toBe(60);
    expect(noteToMidi("C#", 4)).toBe(61);
    expect(noteToHz("G", 3)).toBeCloseTo(196.0, 1);
    expect(noteToHz("C", 4)).toBeCloseTo(261.63, 2);
  });

  it("shifts by semitones (the pitch envelope's start point)", () => {
    expect(shiftSemitones(440, 12)).toBeCloseTo(880, 9);
    expect(shiftSemitones(440, -12)).toBeCloseTo(220, 9);
    // Keep damage: starts 16 semitones above G3 and falls onto it.
    expect(shiftSemitones(noteToHz("G", 3), 16)).toBeCloseTo(493.88, 1);
    // Treasure: starts 14 semitones below C4 and rises onto it.
    expect(shiftSemitones(noteToHz("C", 4), -14)).toBeCloseTo(116.54, 1);
  });
});

describe("pulseDelay", () => {
  it("gives the delay between two saws that makes a pulse of the given duty", () => {
    expect(pulseDelay(100, 0.5)).toBeCloseTo(0.005, 12);
    expect(pulseDelay(100, 0.25)).toBeCloseTo(0.0025, 12);
    expect(pulseDelay(100, 0.125)).toBeCloseTo(0.00125, 12);
  });

  it("clamps the duty to a safe range so the pulse never vanishes", () => {
    expect(pulseDelay(100, 0)).toBeCloseTo(MIN_DUTY / 100, 12);
    expect(pulseDelay(100, 1)).toBeCloseTo(MAX_DUTY / 100, 12);
  });
});

describe("envelopePoints", () => {
  const env = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 };

  it("rises, decays to sustain, holds, then releases to silence", () => {
    expect(envelopePoints(1, 1, env, 0.8)).toEqual([
      { time: 1, value: 0 },
      { time: 1.01, value: 0.8 },
      { time: 1.11, value: 0.4 },
      { time: 2, value: 0.4 },
      { time: 2.2, value: 0 },
    ]);
  });

  it("cuts the envelope short when the note is shorter than attack + decay", () => {
    const points = envelopePoints(0, 0.05, env, 1);
    expect(points.at(-1)).toEqual({ time: 0.25, value: 0 });
    expect(points.every((p, i) => i === 0 || p.time >= points[i - 1].time)).toBe(true);
    expect(points.filter((p) => p.time <= 0.05).at(-1)!.time).toBeLessThanOrEqual(0.05);
  });

  it("never schedules a value above the voice's volume", () => {
    for (const p of envelopePoints(0, 2, env, 0.3)) expect(p.value).toBeLessThanOrEqual(0.3);
  });
});
