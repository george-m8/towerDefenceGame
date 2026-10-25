// Plays songs: a short timer schedules the next slice of notes ahead against the audio
// clock (so timing never drifts with frame rate). Which notes fall in a slice is pure.
import { midiToHz } from "./envelopes";
import type { AudioEngine } from "./engine";
import { parseMidi, type MidiNote, type MidiSong } from "./midi";
import { INSTRUMENTS, SONGS, instrumentFor, type MusicPlace, type SongEntry } from "./songs";

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
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

const defaultDeps: PlayerDeps = {
  fetchBytes: (url) => fetch(url).then((response) => response.arrayBuffer()),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number),
};

interface Playing {
  entry: SongEntry;
  song: MidiSong;
  /** Channels in order of first appearance, for the default instrument mapping. */
  channels: number[];
  start: number;
  scheduledUntil: number;
}

export function createMusicPlayer(engine: AudioEngine, deps: PlayerDeps = defaultDeps) {
  const loaded = new Map<string, MidiSong>();
  let playing: Playing | null = null;
  let timer: unknown = null;

  const stopTimer = () => {
    if (timer !== null) deps.clearInterval(timer);
    timer = null;
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

  const tick = () => {
    if (!playing) return;
    const { entry, song, channels, start } = playing;
    const to = engine.now() + LOOKAHEAD;
    for (const { at, note } of notesInWindow(song, start, playing.scheduledUntil, to, entry.loop)) {
      const instrument = instrumentFor(entry, channels, note.channel, note.midi);
      if (!instrument) continue;
      const def = INSTRUMENTS[instrument];
      const voice = { ...def.voice, volume: (def.voice.volume * note.velocity) / 127 };
      engine.playNote(
        voice,
        def.fixedHz ?? midiToHz(note.midi),
        Math.max(0.02, note.duration),
        "music",
        at,
      );
    }
    playing.scheduledUntil = to;
    if (!entry.loop && to >= start + song.duration) {
      stopTimer();
      playing = null;
    }
  };

  return {
    /** Starts the song for `place` (if audio is unlocked and it isn't already playing). */
    async play(place: MusicPlace) {
      if (!engine.unlocked) return;
      const entry = SONGS.find((s) => s.plays.includes(place));
      if (!entry || playing?.entry === entry) return;
      let song: MidiSong;
      try {
        song = await load(entry);
      } catch {
        return; // a missing or broken song file just means no music
      }
      stopTimer();
      const start = engine.now() + START_DELAY;
      const channels = [...new Set(song.notes.map((n) => n.channel))];
      playing = { entry, song, channels, start, scheduledUntil: start };
      timer = deps.setInterval(tick, TICK_MS);
    },

    /** Stops scheduling and fades out whatever is still sounding. */
    fadeOut(seconds: number) {
      if (!playing) return;
      stopTimer();
      playing = null;
      engine.fadeOutMusic(seconds);
    },
  };
}
