// The music: which songs play where, how MIDI channels map onto our instruments, and the
// instruments themselves. Add your own songs here (see README: "Adding a song").
import { noteToMidi } from "./envelopes";
import type { MidiNote, MidiSong } from "./midi";
import type { MusicPlace } from "./places";
import type { VoiceSettings } from "./synth";

export type { MusicPlace };

/** Medieval-flavoured chiptune voices: General MIDI families map onto these (see PROGRAMS). */
export type Instrument =
  | "harpsichord"
  | "lute"
  | "bass"
  | "organ"
  | "viol"
  | "recorder"
  | "shawm"
  | "sackbut"
  | "bells"
  | "drum"
  | "tabor"
  | "tambourine";

export interface InstrumentDef {
  voice: VoiceSettings;
  /** Drums play at a fixed pitch whatever the MIDI note. */
  fixedHz?: number;
}

/** A plucked string: bright at first, dying away whether the note is held or not. */
const plucked = (decay: number) => ({ attack: 0.003, decay, sustain: 0, release: 0.15 });
/** A blown or bowed note: swells in and holds while the note lasts. */
const held = (attack: number, sustain = 0.85) => ({ attack, decay: 0.08, sustain, release: 0.1 });

export const INSTRUMENTS: Record<Instrument, InstrumentDef> = {
  harpsichord: {
    voice: { wave: "pulse", duty: 0.2, lowpass: 4500, volume: 0.13, envelope: plucked(0.7) },
  },
  lute: {
    voice: { wave: "pulse", duty: 0.35, lowpass: 2200, volume: 0.17, envelope: plucked(0.45) },
  },
  bass: {
    voice: {
      wave: "triangle",
      volume: 0.3,
      envelope: { attack: 0.005, decay: 0.5, sustain: 0.35, release: 0.08 },
    },
  },
  organ: {
    voice: { wave: "pulse", duty: 0.5, lowpass: 2500, volume: 0.06, envelope: held(0.03, 0.9) },
  },
  viol: {
    voice: {
      wave: "sawtooth",
      lowpass: 1800,
      volume: 0.09,
      envelope: held(0.08, 0.8),
      vibrato: { rate: 5.5, depth: 0.15 },
    },
  },
  recorder: {
    voice: {
      wave: "triangle",
      volume: 0.22,
      envelope: held(0.03),
      vibrato: { rate: 5, depth: 0.12 },
    },
  },
  shawm: {
    voice: {
      wave: "pulse",
      duty: 0.15,
      lowpass: 2800,
      volume: 0.09,
      envelope: held(0.02, 0.8),
      vibrato: { rate: 6, depth: 0.08 },
    },
  },
  sackbut: {
    voice: { wave: "sawtooth", lowpass: 1200, volume: 0.12, envelope: held(0.05, 0.8) },
  },
  bells: {
    voice: {
      wave: "sine",
      volume: 0.15,
      envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.3 },
    },
  },
  drum: {
    voice: {
      wave: "sine",
      volume: 0.45,
      envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.03 },
      pitchEnvelope: { semitones: 12, time: 0.08 },
    },
    fixedHz: 70,
  },
  tabor: {
    voice: {
      wave: "noise",
      volume: 0.2,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.03 },
      lowpass: 2500,
    },
    fixedHz: 0,
  },
  tambourine: {
    voice: {
      wave: "noise",
      volume: 0.06,
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
    },
    fixedHz: 0,
  },
};

export interface SongEntry {
  id: string;
  title: string;
  /** Where this song plays. A music pack's songs replace these for any place it has songs for. */
  plays: MusicPlace[];
  loop: boolean;
  /** Where it came from, and the licence you have it under. Required. */
  source: string;
  licence: string;
  /** A MIDI file in public/music/ ... */
  file?: string;
  /** ...or notes written in code (the built-in placeholder). */
  notes?: () => MidiSong;
  /** Override the instrument per channel (MIDI channels 0-15; 9 is drums). */
  channels?: Partial<Record<number, Instrument>>;
}

/** Channel 10 (index 9) drum notes we play; other GM drums are skipped. */
const DRUMS: [number[], Instrument][] = [
  [[35, 36, 41, 43, 45, 47, 48, 50], "drum"], // kicks and toms
  [[37, 38, 39, 40], "tabor"], // side stick, snares, clap
  [[42, 44, 46, 49, 51, 52, 53, 54, 55, 56, 57, 59], "tambourine"], // hi-hats and cymbals
];
const DRUM_CHANNEL = 9;

/**
 * General MIDI programs, eight to a family, onto our instruments: [first program, instrument].
 * Each entry holds until the next. null: not played (sound effects).
 */
const PROGRAMS: [number, Instrument | null][] = [
  [0, "harpsichord"], // pianos, harpsichord, clavinet
  [8, "bells"], // chromatic percussion
  [16, "organ"],
  [24, "lute"], // guitars
  [32, "bass"],
  [40, "viol"], // strings
  [45, "lute"], // pizzicato, harp
  [47, "drum"], // timpani
  [48, "viol"], // string ensembles
  [52, "organ"], // choirs
  [55, "sackbut"], // orchestra hit, then brass
  [64, "shawm"], // reeds
  [72, "recorder"], // pipes, then synth leads
  [88, "organ"], // synth pads
  [96, "bells"], // synth effects
  [104, "lute"], // sitar, banjo, shamisen, koto, kalimba
  [109, "shawm"], // bagpipe
  [110, "viol"], // fiddle
  [111, "shawm"], // shanai
  [112, "bells"], // tinkle bell, agogo, steel drums
  [115, "tabor"], // woodblock
  [116, "drum"], // taiko, melodic tom, synth drum
  [119, null], // reverse cymbal, then sound effects
];
/** For songs with no program changes at all, in order of channel appearance. */
const MELODIC_ORDER: Instrument[] = ["recorder", "lute", "bass", "harpsichord"];

/**
 * The instrument for a note: the song's override for its channel, else a drum on channel 10,
 * else its General MIDI program's instrument. A note with no program takes from MELODIC_ORDER
 * by its channel's place among `channels` (the song's channels in order of first appearance).
 */
export function instrumentFor(
  song: SongEntry,
  channels: readonly number[],
  note: Pick<MidiNote, "channel" | "midi" | "program">,
): Instrument | null {
  const override = song.channels?.[note.channel];
  if (override) return override;
  if (note.channel === DRUM_CHANNEL) {
    return DRUMS.find(([notes]) => notes.includes(note.midi))?.[1] ?? null;
  }
  if (note.program !== undefined) {
    const program = note.program;
    return [...PROGRAMS].reverse().find(([first]) => program >= first)![1];
  }
  const melodic = channels.filter((c) => c !== DRUM_CHANNEL);
  const index = melodic.indexOf(note.channel);
  return MELODIC_ORDER[Math.max(0, index) % MELODIC_ORDER.length];
}

// --- The built-in placeholder theme --------------------------------------------------------
// An original 8-bar loop (written for this game, so there are no rights issues): Am F C G,
// twice, at 120 bpm. Replace it by listing your own MIDI files above it in SONGS.

const BEAT = 0.5; // seconds at 120 bpm
const BAR = 4 * BEAT;

/** "E5" -> MIDI number. */
const m = (name: string) => noteToMidi(name.slice(0, -1), Number(name.slice(-1)));

function placeholderTheme(): MidiSong {
  const notes: MidiNote[] = [];
  const add = (time: number, length: number, name: string, channel: number, velocity = 100) =>
    notes.push({ time, duration: length, midi: m(name), velocity, channel });

  const chords = ["A", "F", "C", "G"]; // bass roots, one per bar
  const bassOctave: Record<string, number> = { A: 2, F: 2, C: 3, G: 2 };
  const arps: Record<string, string[]> = {
    A: ["A4", "C5", "E5", "C5"],
    F: ["F4", "A4", "C5", "A4"],
    C: ["C5", "E5", "G5", "E5"],
    G: ["G4", "B4", "D5", "B4"],
  };
  // Melody: [note, beats] per bar.
  const melody: [string, number][][] = [
    [
      ["E5", 1],
      ["C5", 1],
      ["A4", 1],
      ["C5", 1],
    ],
    [
      ["F5", 1],
      ["E5", 1],
      ["C5", 2],
    ],
    [
      ["G5", 1],
      ["E5", 1],
      ["C5", 1],
      ["E5", 1],
    ],
    [
      ["D5", 3],
      ["B4", 1],
    ],
    [
      ["A5", 1],
      ["G5", 1],
      ["E5", 1],
      ["C5", 1],
    ],
    [
      ["F5", 1],
      ["A5", 1],
      ["G5", 2],
    ],
    [
      ["E5", 1],
      ["G5", 1],
      ["C6", 1],
      ["G5", 1],
    ],
    [
      ["B5", 1],
      ["A5", 1],
      ["G5", 1],
      ["D5", 1],
    ],
  ];

  for (let bar = 0; bar < 8; bar++) {
    const start = bar * BAR;
    const chord = chords[bar % 4];
    // Bass: driving eighths on the root.
    for (let i = 0; i < 8; i++)
      add(start + i * (BEAT / 2), BEAT / 2 - 0.05, `${chord}${bassOctave[chord]}`, 2, 90);
    // Arp: eighth-note chord tones, quietly.
    for (let i = 0; i < 8; i++) add(start + i * (BEAT / 2), BEAT / 4, arps[chord][i % 4], 3, 70);
    // Lead melody.
    let beat = 0;
    for (const [note, beats] of melody[bar]) {
      add(start + beat * BEAT, beats * BEAT - 0.04, note, 0);
      beat += beats;
    }
    // Drums: kick on 1 and 3, snare on 2 and 4, hats on every eighth.
    for (let b = 0; b < 4; b++)
      add(start + b * BEAT, 0.1, b % 2 === 0 ? "C2" : "D2", DRUM_CHANNEL, 110);
    for (let i = 0; i < 8; i++) add(start + i * (BEAT / 2), 0.05, "F#2", DRUM_CHANNEL, 60);
  }
  notes.sort((a, b) => a.time - b.time || a.channel - b.channel);
  return { notes, duration: 8 * BAR };
}

export const SONGS: SongEntry[] = [
  {
    id: "concertino-in-d-john-baston",
    title: "Concertino in D by John Baston",
    plays: ["intro"],
    loop: false,
    source: "https://www.midiworld.com/",
    licence: "PD",
    file: "baston.mid",
    channels: { 0: "recorder", 1: "harpsichord", 2: "bass" },
  },
  {
    id: "placeholder-theme",
    title: "Keep Theme (placeholder)",
    plays: ["menu"],
    loop: true,
    source: "Written for this game",
    licence: "Same as this project",
    notes: placeholderTheme,
    channels: { 0: "recorder", 2: "bass", 3: "lute" },
  },
];
