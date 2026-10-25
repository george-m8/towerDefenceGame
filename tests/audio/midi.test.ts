import { describe, expect, it } from "vitest";
import { MidiError, parseMidi } from "../../src/audio/midi";

// --- A tiny MIDI writer for fixtures ----------------------------------------------------

/** Variable-length quantity, as MIDI writes delta times and lengths. */
function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7) > 0) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function header(format: number, tracks: number, division = 480) {
  return [...ascii("MThd"), ...u32(6), ...u16(format), ...u16(tracks), ...u16(division)];
}

/** A track from [delta, ...event bytes] rows; end-of-track is added. */
function track(rows: number[][]): number[] {
  const body = rows.flatMap(([delta, ...event]) => [...vlq(delta), ...event]);
  body.push(0, 0xff, 0x2f, 0);
  return [...ascii("MTrk"), ...u32(body.length), ...body];
}

const tempo = (microsPerQuarter: number) => [0xff, 0x51, 3, ...u32(microsPerQuarter).slice(1)];
const midi = (...parts: number[][]) => new Uint8Array(parts.flat());
const near = (n: number) => Math.round(n * 1e6) / 1e6;

// --- Tests --------------------------------------------------------------------------------

describe("parseMidi", () => {
  it("reads a format 0 file at the default tempo (120 bpm)", () => {
    const song = parseMidi(
      midi(
        header(0, 1),
        track([
          [0, 0x90, 60, 100], // C4 on
          [480, 0x80, 60, 0], // off after one beat (0.5 s)
          [0, 0x90, 64, 90], // E4 on
          [240, 0x80, 64, 0], // off after half a beat
        ]),
      ),
    );
    expect(
      song.notes.map((n) => [near(n.time), near(n.duration), n.midi, n.velocity, n.channel]),
    ).toEqual([
      [0, 0.5, 60, 100, 0],
      [0.5, 0.25, 64, 90, 0],
    ]);
    expect(near(song.duration)).toBe(0.75);
  });

  it("handles running status and note-on with velocity 0 as note-off", () => {
    const song = parseMidi(
      midi(
        header(0, 1),
        track([
          [0, 0x90, 60, 100],
          [0, 64, 100], // running status: another note-on
          [480, 60, 0], // running status, velocity 0 = off
          [0, 64, 0],
        ]),
      ),
    );
    expect(song.notes.map((n) => [n.midi, near(n.duration)])).toEqual([
      [60, 0.5],
      [64, 0.5],
    ]);
  });

  it("follows a tempo change in the middle of the song", () => {
    const song = parseMidi(
      midi(
        header(0, 1),
        track([
          [0, ...tempo(500_000)], // 120 bpm
          [960, ...tempo(250_000)], // after 2 beats (1 s), double speed
          [480, 0x90, 67, 100], // one beat later at 240 bpm: 1.25 s
          [480, 0x80, 67, 0], // one beat long: 0.25 s
        ]),
      ),
    );
    expect(song.notes).toHaveLength(1);
    expect(near(song.notes[0].time)).toBe(1.25);
    expect(near(song.notes[0].duration)).toBe(0.25);
  });

  it("reads a format 1 file with a tempo track and channels kept apart", () => {
    const song = parseMidi(
      midi(
        header(1, 3),
        track([[0, ...tempo(600_000)]]), // 100 bpm: a beat is 0.6 s
        track([
          [0, 0x90, 72, 100],
          [480, 0x80, 72, 0],
        ]),
        track([
          [240, 0x99, 36, 120], // channel 10 (index 9): kick, half a beat in
          [120, 0x89, 36, 0],
        ]),
      ),
    );
    const byChannel = Object.fromEntries(song.notes.map((n) => [n.channel, n]));
    expect(near(byChannel[0].time)).toBe(0);
    expect(near(byChannel[0].duration)).toBe(0.6);
    expect(near(byChannel[9].time)).toBe(0.3);
    expect(byChannel[9].midi).toBe(36);
  });

  it("skips meta, sysex and other channel messages", () => {
    const song = parseMidi(
      midi(
        header(0, 1),
        track([
          [0, 0xff, 0x03, 4, ...ascii("Song")], // track name
          [0, 0xf0, 3, 1, 2, 0xf7], // sysex
          [0, 0xc0, 5], // program change (1 data byte)
          [0, 0xb0, 7, 100], // controller (2 data bytes)
          [0, 0xe0, 0, 64], // pitch bend
          [0, 0x90, 60, 100],
          [480, 0x80, 60, 0],
        ]),
      ),
    );
    expect(song.notes.map((n) => n.midi)).toEqual([60]);
  });

  it("ends notes that are never released at the end of their track", () => {
    const song = parseMidi(
      midi(
        header(0, 1),
        track([
          [0, 0x90, 60, 100],
          [960, 0xb0, 7, 100],
        ]),
      ),
    );
    expect(near(song.notes[0].duration)).toBe(1);
  });

  it("keeps the good tracks, and a broken track's notes up to the bad byte", () => {
    // Some writers put a bad status byte in a track: 0xF0 where a program change belongs,
    // which reads as a sysex and swallows the start of the next events.
    const sysexIntoEvents = [
      [0, 0x91, 64, 100],
      [480, 0x81, 64, 0],
      [0, 0xf0, 2], // a "sysex" of 2 bytes that don't end in 0xF7
      [0, 0x91, 65, 100],
      [96000, 0x81, 65, 0],
    ];
    const sysexPastTheEnd = [
      [0, 0x93, 64, 100],
      [480, 0x83, 64, 0],
      [0, 0xf0, 0x50], // runs past the end of the file
    ];
    // Misread without any error (a writer's bad byte that still parses), ending far away.
    const junk = [[0x7f7f7f, 0xb0, 7, 100]];
    const song = parseMidi(
      midi(
        header(1, 5),
        track([
          [0, 0x90, 60, 100],
          [480, 0x80, 60, 0],
        ]),
        track(sysexIntoEvents),
        track(sysexPastTheEnd),
        track(junk),
        track([
          [0, 0x92, 67, 100],
          [480, 0x82, 67, 0],
        ]),
      ),
    );
    expect(song.notes.map((n) => [n.channel, n.midi])).toEqual([
      [0, 60],
      [1, 64],
      [2, 67],
      [3, 64],
    ]);
    expect(near(song.duration)).toBe(0.5); // no junk timings from the misread bytes
  });

  it("rejects files that aren't MIDI, or are cut short, with a clear error", () => {
    expect(() => parseMidi(new Uint8Array(ascii("RIFF0000WAVE")))).toThrow(MidiError);
    expect(() => parseMidi(new Uint8Array(ascii("RIFF0000WAVE")))).toThrow(/not a MIDI file/i);
    const whole = midi(
      header(0, 1),
      track([
        [0, 0x90, 60, 100],
        [480, 0x80, 60, 0],
      ]),
    );
    expect(() => parseMidi(whole.slice(0, whole.length - 6))).toThrow(MidiError);
    expect(() => parseMidi(midi(header(0, 1, 0xe250)))).toThrow(/SMPTE/i);
  });
});
