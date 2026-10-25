import { describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../../src/audio/engine";
import type { MidiSong } from "../../src/audio/midi";
import { createMusicPlayer, notesInWindow } from "../../src/audio/sequencer";
import type { MusicPlace } from "../../src/audio/places";
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
  const note = (channel: number, midi: number, program?: number) => ({ channel, midi, program });

  it("plays GM drums from channel 10 on a drum, tabor and tambourine", () => {
    expect(instrumentFor(plain, [9], note(9, 36))).toBe("drum"); // kick
    expect(instrumentFor(plain, [9], note(9, 45))).toBe("drum"); // tom
    expect(instrumentFor(plain, [9], note(9, 38))).toBe("tabor"); // snare
    expect(instrumentFor(plain, [9], note(9, 42))).toBe("tambourine"); // hi-hat
    expect(instrumentFor(plain, [9], note(9, 57))).toBe("tambourine"); // crash
    expect(instrumentFor(plain, [9], note(9, 81))).toBeNull(); // unmapped drum: skipped
  });

  it("plays each General MIDI family on a medieval instrument", () => {
    const on = (program: number) => instrumentFor(plain, [0], note(0, 60, program));
    expect(on(0)).toBe("harpsichord"); // acoustic grand
    expect(on(4)).toBe("harpsichord"); // electric piano
    expect(on(13)).toBe("bells"); // xylophone
    expect(on(19)).toBe("organ"); // church organ
    expect(on(25)).toBe("lute"); // steel guitar
    expect(on(30)).toBe("lute"); // distortion guitar
    expect(on(33)).toBe("bass"); // finger bass
    expect(on(40)).toBe("viol"); // violin
    expect(on(48)).toBe("viol"); // string ensemble
    expect(on(57)).toBe("sackbut"); // trombone
    expect(on(68)).toBe("shawm"); // oboe
    expect(on(73)).toBe("recorder"); // flute
    expect(on(80)).toBe("recorder"); // square lead
    expect(on(90)).toBe("organ"); // polysynth pad
    expect(on(105)).toBe("lute"); // banjo
    expect(on(109)).toBe("shawm"); // bagpipe
    expect(on(122)).toBeNull(); // seashore: sound effects are skipped
  });

  it("without any programs, gives channels recorder, lute, bass and harpsichord in order", () => {
    const channels = [2, 5, 7, 9, 11];
    expect(instrumentFor(plain, channels, note(2, 60))).toBe("recorder");
    expect(instrumentFor(plain, channels, note(5, 60))).toBe("lute");
    expect(instrumentFor(plain, channels, note(7, 60))).toBe("bass");
    expect(instrumentFor(plain, channels, note(11, 60))).toBe("harpsichord");
  });

  it("lets a song override the mapping", () => {
    const custom: SongEntry = { ...plain, channels: { 2: "bass" } };
    expect(instrumentFor(custom, [2, 5], note(2, 60, 73))).toBe("bass");
  });
});

describe("the song manifest", () => {
  it("has an intro song, and every song records its source and licence", () => {
    expect(SONGS.some((s) => s.plays.includes("intro"))).toBe(true);
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

// --- The player ---------------------------------------------------------------------------

type FakeEngine = AudioEngine & {
  notes: { hz: number; at: number; bus: string }[];
  fades: number[];
  advance(seconds: number): void;
  unlocked: boolean;
};

function fakeEngine(): FakeEngine {
  let clock = 5;
  const engine = {
    notes: [] as FakeEngine["notes"],
    fades: [] as number[],
    unlocked: true,
    unlock: () => {},
    now: () => clock,
    setVolumes: () => {},
    playNote: (_voice: unknown, hz: number, _duration: number, bus: string, at = clock) =>
      void engine.notes.push({ hz, at, bus }),
    fadeOutMusic: (seconds: number) => void engine.fades.push(seconds),
    advance: (seconds: number) => void (clock += seconds),
  };
  return engine as FakeEngine;
}

/** A song of one note (MIDI `midi`, at 0.5 s), `length` seconds long. */
function oneNote(id: string, midi: number, plays: MusicPlace[], loop = false, length = 2) {
  const notes: MidiSong = {
    duration: length,
    notes: [{ time: 0.5, duration: 0.25, midi, velocity: 100, channel: 0 }],
  };
  return { id, title: id, plays, loop, source: "test", licence: "test", notes: () => notes };
}

const intro = oneNote("intro", 60, ["intro"]);
const menuA = oneNote("menu-a", 62, ["menu"]);
const menuB = oneNote("menu-b", 64, ["menu"]);
const looping = oneNote("looping", 65, ["game-over"], true);
const hzOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function setup(songs: SongEntry[] = [intro, menuA, menuB, looping], extra = {}) {
  const engine = fakeEngine();
  let tick: (() => void) | null = null;
  const timers = {
    setInterval: vi.fn((fn: () => void) => ((tick = fn), 1)),
    clearInterval: vi.fn(() => (tick = null)),
  };
  const player = createMusicPlayer(engine, {
    ...timers,
    fetchBytes: vi.fn(),
    songsFor: (place) => songs.filter((s) => s.plays.includes(place)),
    random: () => 0,
    ...extra,
  });
  const ended: MusicPlace[] = [];
  player.onEnded = (place) => ended.push(place);
  /** Moves the clock on in timer-sized steps, running the timer each time. */
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) {
      engine.advance(0.05);
      tick?.();
    }
  };
  /** Which songs' notes were scheduled, by MIDI number, in order. */
  const played = () => engine.notes.map((n) => Math.round(12 * Math.log2(n.hz / 440) + 69));
  return { engine, player, timers, ended, run, played };
}

describe("music player", () => {
  it("schedules a place's song on the music bus, ahead of the clock", async () => {
    const { engine, player, run, played } = setup();
    await player.play("intro");
    run(1);
    expect(played()).toEqual([60]);
    expect(engine.notes[0].bus).toBe("music");
    expect(engine.notes[0].at).toBeCloseTo(5 + 0.1 + 0.5); // start delay + note time
    expect(engine.notes[0].hz).toBeCloseTo(hzOf(60));
  });

  it("playing the same place again doesn't restart it", async () => {
    const { player, timers } = setup();
    await player.play("intro");
    await player.play("intro");
    expect(timers.setInterval).toHaveBeenCalledTimes(1);
  });

  it("a play-once place reports that it ended, after its last moment", async () => {
    const { player, run, ended } = setup();
    await player.play("intro");
    run(1.9);
    expect(ended).toEqual([]);
    run(0.4);
    expect(ended).toEqual(["intro"]);
  });

  it("a shuffled place moves on to another song instead of ending", async () => {
    const { player, run, ended, played } = setup();
    await player.play("menu");
    run(2.3);
    await Promise.resolve(); // the next song loads
    run(1);
    expect(played()).toEqual([62, 64]); // menu-a, then menu-b (never the same twice running)
    expect(ended).toEqual([]);
  });

  it("a looping song never ends", async () => {
    const { player, run, ended, played } = setup();
    await player.play("game-over");
    run(6.2);
    expect(played()).toEqual([65, 65, 65]);
    expect(ended).toEqual([]);
  });

  it("fading out stops scheduling and fades the bus, without reporting an end", async () => {
    const { engine, player, timers, run, ended } = setup();
    await player.play("intro");
    player.fadeOut(1);
    expect(engine.fades).toEqual([1]);
    expect(timers.clearInterval).toHaveBeenCalled();
    run(3);
    expect(engine.notes).toEqual([]);
    expect(ended).toEqual([]);
  });

  it("switching fades out, then starts the new place once the fade is over", async () => {
    const { engine, player, run, played } = setup();
    await player.play("intro");
    await player.switchTo("menu", 1);
    run(2);
    expect(engine.fades).toEqual([1]);
    expect(played()).toEqual([62]);
    expect(engine.notes[0].at).toBeGreaterThanOrEqual(5 + 1 + 0.5);
  });

  it("restarting plays the current place again from the top (a new pack)", async () => {
    const { engine, player, run, played } = setup();
    await player.play("intro");
    await player.restart(1);
    run(2);
    expect(engine.fades).toEqual([1]);
    expect(played()).toEqual([60]);
  });

  it("a slow load that's been replaced never starts", async () => {
    let finishLoad = () => {};
    const slow: SongEntry = { ...intro, notes: undefined, file: "slow.mid" };
    const fetchBytes = vi.fn(
      () => new Promise<ArrayBuffer>((done) => (finishLoad = () => done(ONE_NOTE_FILE.buffer))),
    );
    const { player, run, played } = setup([slow, menuA], { fetchBytes });
    const loading = player.play("intro");
    await player.switchTo("menu", 1);
    finishLoad();
    await loading;
    run(3);
    expect(played()).toEqual([62]);
  });

  it("waits for audio to unlock, then resume() starts the wanted place", async () => {
    const { engine, player, timers, run, played } = setup();
    engine.unlocked = false;
    await player.play("menu");
    await player.switchTo("intro", 1);
    expect(timers.setInterval).not.toHaveBeenCalled();
    engine.unlocked = true;
    await player.resume();
    run(1);
    expect(played()).toEqual([60]);
  });

  it("a play-once place with nothing to play ends straight away", async () => {
    const { player, ended, timers } = setup([menuA]);
    await player.play("intro");
    expect(ended).toEqual(["intro"]);
    expect(timers.setInterval).not.toHaveBeenCalled();
  });

  it("skips a song file that won't load and plays another", async () => {
    const broken: SongEntry = { ...menuA, notes: undefined, file: "broken.mid" };
    const fetchBytes = vi.fn(async () => {
      throw new Error("404");
    });
    const { player, run, played } = setup([broken, menuB], { fetchBytes });
    await player.play("menu");
    run(1);
    expect(played()).toEqual([64]);
  });
});

describe("now playing and skip", () => {
  it("reports each song as it starts, and nothing once music stops", async () => {
    const { player } = setup();
    const titles: (string | null)[] = [];
    player.onSongChange = (song) => titles.push(song?.title ?? null);
    await player.play("intro");
    expect(player.nowPlaying?.title).toBe("intro");
    player.fadeOut(1);
    expect(player.nowPlaying).toBeNull();
    expect(titles).toEqual(["intro", null]);
  });

  it("a song that plays out to the end clears now playing", async () => {
    const { player, run } = setup();
    await player.play("intro");
    run(2.5);
    expect(player.nowPlaying).toBeNull();
  });

  it("skipping in a shuffled place fades out and starts a different song after the fade", async () => {
    const { engine, player, run, played } = setup();
    await player.play("menu");
    await player.skip(0.5);
    run(2);
    expect(engine.fades).toEqual([0.5]);
    expect(player.nowPlaying?.title).toBe("menu-b");
    expect(played()).toEqual([64]);
    expect(engine.notes[0].at).toBeGreaterThanOrEqual(5 + 0.5 + 0.5);
  });

  it("skipping a play-once place ends it, and what follows waits for the fade", async () => {
    const { engine, player, run, ended, played } = setup();
    player.onEnded = (place) => {
      ended.push(place);
      void player.play("menu"); // as the game does: the intro hands over to menu music
    };
    await player.play("intro");
    await player.skip(0.5);
    await Promise.resolve();
    run(2);
    expect(ended).toEqual(["intro"]);
    expect(played()).toEqual([62]);
    expect(engine.notes[0].at).toBeGreaterThanOrEqual(5 + 0.5 + 0.5);
  });

  it("skipping with nothing playing does nothing", async () => {
    const { engine, player, ended } = setup();
    await player.skip(0.5);
    expect(engine.fades).toEqual([]);
    expect(ended).toEqual([]);
  });
});

/** One C4 quarter note at 120 bpm, format 0. */
const ONE_NOTE_FILE = new Uint8Array([
  ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0],
  ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12],
  ...[0, 0x90, 60, 100, 0x83, 0x60, 0x80, 60, 0, 0, 0xff, 0x2f, 0],
]);

describe("music player with a MIDI file", () => {
  it("fetches the file from public/music once, parses it and plays its notes", async () => {
    const fetchBytes = vi.fn(async () => ONE_NOTE_FILE.buffer);
    const song: SongEntry = { ...intro, notes: undefined, file: "music-packs/p/intro/a%20b.mid" };
    const { engine, player, run } = setup([song], { fetchBytes });
    await player.play("intro");
    run(0.5);
    expect(fetchBytes).toHaveBeenCalledWith("/music/music-packs/p/intro/a%20b.mid");
    expect(engine.notes).toHaveLength(1);
    expect(engine.notes[0].hz).toBeCloseTo(261.63, 1); // C4, played on the lead
  });
});
