import { describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../../src/audio/engine";
import type { MidiSong } from "../../src/audio/midi";
import { createMusicPlayer, notesInWindow } from "../../src/audio/sequencer";
import { SONGS, instrumentFor, type SongEntry } from "../../src/audio/songs";

const song: MidiSong = {
  duration: 2,
  notes: [
    { time: 0.5, duration: 0.25, midi: 60, velocity: 100, channel: 0 },
    { time: 1.5, duration: 0.25, midi: 64, velocity: 100, channel: 0 },
  ],
};

describe("notesInWindow", () => {
  it("returns the notes starting inside the window, at their audio-clock times", () => {
    const found = notesInWindow(song, 10, 10.4, 10.6, false);
    expect(found.map((n) => [n.at, n.note.midi])).toEqual([[10.5, 60]]);
    expect(notesInWindow(song, 10, 10.6, 11.4, false)).toEqual([]);
  });

  it("repeats the song when looping, across the loop boundary", () => {
    const found = notesInWindow(song, 10, 11.9, 12.6, true);
    expect(found.map((n) => [n.at, n.note.midi])).toEqual([[12.5, 60]]);
    expect(notesInWindow(song, 10, 12.4, 12.6, false)).toEqual([]); // not looping: over
  });

  it("never schedules a note twice across back-to-back windows", () => {
    const windows = [10, 10.2, 10.4, 10.6, 10.8, 11, 11.2, 11.4, 11.6, 11.8, 12, 12.2, 12.6];
    const all = windows
      .slice(0, -1)
      .flatMap((from, i) => notesInWindow(song, 10, from, windows[i + 1], true));
    expect(all.map((n) => n.at)).toEqual([10.5, 11.5, 12.5]);
  });
});

describe("instrumentFor", () => {
  const plain: SongEntry = { ...SONGS[0], channels: undefined };

  it("plays GM drums from channel 10 on kick, snare and hi-hat", () => {
    expect(instrumentFor(plain, [9], 9, 36)).toBe("kick");
    expect(instrumentFor(plain, [9], 9, 38)).toBe("snare");
    expect(instrumentFor(plain, [9], 9, 42)).toBe("hihat");
    expect(instrumentFor(plain, [9], 9, 81)).toBeNull(); // unmapped drum: skipped
  });

  it("gives other channels lead, harmony, bass and arp in order of appearance", () => {
    const channels = [2, 5, 7, 9, 11];
    expect(instrumentFor(plain, channels, 2, 60)).toBe("lead");
    expect(instrumentFor(plain, channels, 5, 60)).toBe("harmony");
    expect(instrumentFor(plain, channels, 7, 60)).toBe("bass");
    expect(instrumentFor(plain, channels, 11, 60)).toBe("arp");
  });

  it("lets a song override the mapping", () => {
    const custom: SongEntry = { ...plain, channels: { 2: "bass" } };
    expect(instrumentFor(custom, [2, 5], 2, 60)).toBe("bass");
  });
});

describe("the song manifest", () => {
  it("has a title song, and every song records its source and licence", () => {
    expect(SONGS.some((s) => s.plays.includes("title"))).toBe(true);
    for (const s of SONGS) {
      expect(s.source.length).toBeGreaterThan(0);
      expect(s.licence.length).toBeGreaterThan(0);
      expect(Boolean(s.file) !== Boolean(s.notes)).toBe(true); // a file or built-in notes
    }
  });

  it("the built-in placeholder theme has notes and a length", () => {
    const builtIn = SONGS.find((s) => s.notes)!;
    const theme = builtIn.notes!();
    expect(theme.notes.length).toBeGreaterThan(16);
    expect(theme.duration).toBeGreaterThan(4);
  });
});

describe("music player", () => {
  function fakeEngine(): AudioEngine & { notes: unknown[][]; fades: number[] } {
    let clock = 5;
    const notes: unknown[][] = [];
    const fades: number[] = [];
    return {
      notes,
      fades,
      unlocked: true,
      unlock: () => {},
      now: () => clock,
      setVolumes: () => {},
      playNote: (...args) => void notes.push(args),
      fadeOutMusic: (seconds) => void fades.push(seconds),
      // test helper
      ...{ advance: (s: number) => (clock += s) },
    } as AudioEngine & { notes: unknown[][]; fades: number[] };
  }

  function setup() {
    const engine = fakeEngine();
    let tick: (() => void) | null = null;
    const timers = {
      setInterval: vi.fn((fn: () => void) => ((tick = fn), 1)),
      clearInterval: vi.fn(() => (tick = null)),
    };
    const player = createMusicPlayer(engine, { ...timers, fetchBytes: vi.fn() });
    return { engine, player, timers, runTick: () => tick?.() };
  }

  it("schedules the title song's first notes on the music bus", async () => {
    const { engine, player, runTick } = setup();
    await player.play("title");
    runTick();
    expect(engine.notes.length).toBeGreaterThan(0);
    expect(engine.notes.every((args) => args[3] === "music")).toBe(true);
    expect(engine.notes.every((args) => (args[4] as number) >= 5)).toBe(true);
  });

  it("playing the same place again doesn't restart it", async () => {
    const { player, timers } = setup();
    await player.play("title");
    await player.play("title");
    expect(timers.setInterval).toHaveBeenCalledTimes(1);
  });

  it("fading out stops scheduling and fades the music bus", async () => {
    const { engine, player, timers, runTick } = setup();
    await player.play("title");
    player.fadeOut(1);
    expect(engine.fades).toEqual([1]);
    expect(timers.clearInterval).toHaveBeenCalled();
    const before = engine.notes.length;
    runTick();
    expect(engine.notes.length).toBe(before);
  });

  it("does nothing until audio is unlocked", async () => {
    const { engine, player, timers } = setup();
    (engine as { unlocked: boolean }).unlocked = false;
    await player.play("title");
    expect(timers.setInterval).not.toHaveBeenCalled();
  });
});

describe("music player with a MIDI file", () => {
  it("fetches the file from public/music once, parses it and plays its notes", async () => {
    // One C4 quarter note at 120 bpm, format 0.
    const bytes = new Uint8Array([
      ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0],
      ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12],
      ...[0, 0x90, 60, 100, 0x83, 0x60, 0x80, 60, 0, 0, 0xff, 0x2f, 0],
    ]);
    const fetchBytes = vi.fn(async () => bytes.buffer);
    const notes: unknown[][] = [];
    const engine = {
      unlocked: true,
      unlock: () => {},
      now: () => 0,
      setVolumes: () => {},
      fadeOutMusic: () => {},
      playNote: (...args: unknown[]) => void notes.push(args),
    } as unknown as AudioEngine;
    let tick = () => {};
    const song: SongEntry = {
      id: "file-song",
      title: "File song",
      plays: ["title"],
      loop: false,
      source: "test",
      licence: "test",
      file: "file-song.mid",
    };
    const player = createMusicPlayer(engine, {
      songs: [song],
      fetchBytes,
      setInterval: (fn: () => void) => ((tick = fn), 1),
      clearInterval: () => {},
    });
    await player.play("title");
    tick();
    expect(fetchBytes).toHaveBeenCalledWith("/music/file-song.mid");
    expect(notes).toHaveLength(1);
    expect(notes[0][1]).toBeCloseTo(261.63, 1); // C4, played on the lead
    expect(notes[0][3]).toBe("music");
  });
});
