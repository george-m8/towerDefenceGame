// Plays songs: a short timer schedules the next slice of notes ahead against the audio
// clock (so timing never drifts with frame rate). Which notes fall in a slice is pure.
import { midiToHz } from "./envelopes";
import type { AudioEngine } from "./engine";
import { loudness, normalisingGain } from "./loudness";
import { parseMidi, type MidiNote, type MidiSong } from "./midi";
import type { MusicPlace } from "./places";
import { SHUFFLED_PLACES, pickSong } from "./playlist";
import { INSTRUMENTS, SONGS, instrumentFor, type SongEntry } from "./songs";

export interface ScheduledNote {
  /** Audio-clock time the note starts. */
  at: number;
  note: MidiNote;
}

/** How often the timer runs, and how far ahead each run schedules. */
const TICK_MS = 50;
const LOOKAHEAD = 0.2;
/** A little head start so the first notes aren't scheduled in the past. */
const START_DELAY = 0.1;

/**
 * Notes of `song` (started at audio time `songStart`) that begin in [from, to). Windows
 * are half-open, so back-to-back windows never repeat a note.
 */
export function notesInWindow(
  song: MidiSong,
  songStart: number,
  from: number,
  to: number,
  loop: boolean,
): ScheduledNote[] {
  if (song.duration <= 0) return [];
  const first = loop ? Math.max(0, Math.floor((from - songStart) / song.duration)) : 0;
  const last = loop ? Math.floor((to - songStart) / song.duration) : 0;
  const found: ScheduledNote[] = [];
  for (let pass = first; pass <= last; pass++) {
    const offset = songStart + pass * song.duration;
    for (const note of song.notes) {
      const at = offset + note.time;
      if (at >= from && at < to) found.push({ at, note });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

interface PlayerDeps {
  /** The songs that can play in a place right now (the music pack's, or the built-in ones). */
  songsFor: (place: MusicPlace) => readonly SongEntry[];
  random: () => number;
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

const defaultDeps: PlayerDeps = {
  songsFor: (place) => SONGS.filter((song) => song.plays.includes(place)),
  random: Math.random,
  fetchBytes: (url) =>
    fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.arrayBuffer();
    }),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number),
};

interface Playing {
  place: MusicPlace;
  entry: SongEntry;
  song: MidiSong;
  /** Channels in order of first appearance, for the default instrument mapping. */
  channels: number[];
  /** Evens out loudness between songs (see loudness.ts). */
  gain: number;
  start: number;
  scheduledUntil: number;
}

/**
 * Plays music for a place (intro, menu, in-play, game-over). A song that doesn't loop plays
 * once: in a shuffled place (menu, in-play) another song follows it; elsewhere `onEnded` is
 * called so the game can decide what comes next.
 */
export function createMusicPlayer(engine: AudioEngine, overrides: Partial<PlayerDeps> = {}) {
  const deps = { ...defaultDeps, ...overrides };
  const loaded = new Map<string, MidiSong>();
  /** Songs whose file wouldn't load or parse; skipped from then on. */
  const broken = new Set<string>();
  /** The place we want music for (also while audio is still locked, or a song is loading). */
  let place: MusicPlace | null = null;
  let playing: Playing | null = null;
  let lastId: string | null = null;
  let timer: unknown = null;
  /** Bumped by every start and stop, so a slow load that's been replaced never starts. */
  let generation = 0;
  /** Audio time a fade-out is over; nothing new starts before it. */
  let quietFrom = 0;

  const stop = () => {
    generation++;
    if (timer !== null) deps.clearInterval(timer);
    timer = null;
    if (playing) {
      playing = null;
      player.onSongChange?.(null);
    }
  };

  /** Fades out what's sounding; the next song waits until the fade is over. */
  const fade = (seconds: number) => {
    if (!playing) return;
    engine.fadeOutMusic(seconds);
    quietFrom = engine.now() + seconds;
  };

  const load = async (entry: SongEntry): Promise<MidiSong> => {
    let song = loaded.get(entry.id);
    if (!song) {
      song = entry.notes
        ? entry.notes()
        : parseMidi(new Uint8Array(await deps.fetchBytes(`/music/${entry.file}`)));
      loaded.set(entry.id, song);
    }
    return song;
  };

  /** Picks a song for `next` and starts it shortly (after any fade-out). */
  const begin = async (next: MusicPlace): Promise<void> => {
    stop();
    place = next;
    const mine = generation;
    const songs = deps.songsFor(next).filter((song) => !broken.has(song.id));
    const entry = pickSong(songs, lastId, deps.random);
    if (!entry) {
      if (!SHUFFLED_PLACES.includes(next)) ended(next);
      return;
    }
    let song: MidiSong;
    try {
      song = await load(entry);
    } catch {
      broken.add(entry.id); // a missing or broken file: try another song
      if (generation === mine) await begin(next);
      return;
    }
    if (generation !== mine) return;
    lastId = entry.id;
    const start = Math.max(engine.now(), quietFrom) + START_DELAY;
    const channels = [...new Set(song.notes.map((n) => n.channel))];
    const voiceOf = (note: MidiNote) => {
      const instrument = instrumentFor(entry, channels, note);
      return instrument && INSTRUMENTS[instrument].voice;
    };
    const gain = normalisingGain(loudness(song.notes, voiceOf, song.duration));
    playing = { place: next, entry, song, channels, gain, start, scheduledUntil: start };
    timer = deps.setInterval(tick, TICK_MS);
    player.onSongChange?.(entry);
  };

  const ended = (finished: MusicPlace) => {
    place = null;
    player.onEnded?.(finished);
  };

  const tick = () => {
    if (!playing) return;
    const { place: current, entry, song, channels, gain, start } = playing;
    const to = engine.now() + LOOKAHEAD;
    for (const { at, note } of notesInWindow(song, start, playing.scheduledUntil, to, entry.loop)) {
      const instrument = instrumentFor(entry, channels, note);
      if (!instrument) continue;
      const def = INSTRUMENTS[instrument];
      const voice = { ...def.voice, volume: (def.voice.volume * note.velocity * gain) / 127 };
      engine.playNote(
        voice,
        def.fixedHz ?? midiToHz(note.midi),
        Math.max(0.02, note.duration),
        "music",
        at,
      );
    }
    playing.scheduledUntil = to;
    if (!entry.loop && engine.now() >= start + song.duration) {
      if (SHUFFLED_PLACES.includes(current)) void begin(current);
      else {
        stop();
        ended(current);
      }
    }
  };

  const player = {
    /** Called when a play-once place (intro, game-over) has finished. */
    onEnded: null as ((place: MusicPlace) => void) | null,
    /** Called with each song as it starts, and null when music stops. */
    onSongChange: null as ((song: SongEntry | null) => void) | null,

    /** The song playing now, if any. */
    get nowPlaying(): SongEntry | null {
      return playing?.entry ?? null;
    },

    /** Starts music for `next`, unless it's already playing (or waiting to). */
    async play(next: MusicPlace) {
      if (place === next) return;
      place = next;
      if (engine.unlocked) await begin(next);
    },

    /** Fades out whatever is playing, then starts `next` once the fade is over. */
    async switchTo(next: MusicPlace, fadeSeconds: number) {
      player.fadeOut(fadeSeconds);
      place = next;
      if (engine.unlocked) await begin(next);
    },

    /**
     * Moves on from the current song: another song in a shuffled place, otherwise the place
     * ends (so skipping the intro hands over to menu music).
     */
    async skip(fadeSeconds: number) {
      if (!playing) return;
      const current = playing.place;
      fade(fadeSeconds);
      stop();
      if (SHUFFLED_PLACES.includes(current)) await begin(current);
      else ended(current);
    },

    /** Starts the current place again from the top, with a fresh pick (after a pack change). */
    async restart(fadeSeconds: number) {
      if (place) await player.switchTo(place, fadeSeconds);
    },

    /** Starts the wanted place if it was asked for before audio was unlocked. */
    async resume() {
      if (place && !playing && engine.unlocked) await begin(place);
    },

    /** Stops scheduling and fades out whatever is still sounding. */
    fadeOut(seconds: number) {
      fade(seconds);
      stop();
      place = null;
    },
  };
  return player;
}
