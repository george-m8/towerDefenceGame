// The music: which songs play where, how MIDI channels map onto our instruments, and the
// instruments themselves. Add your own songs here (see README: "Adding a song").
import { noteToMidi } from "./envelopes";
import type { MidiNote, MidiSong } from "./midi";
import type { MusicPlace } from "./places";
import type { VoiceSettings } from "./synth";

export type { MusicPlace };

export type Instrument = "lead" | "harmony" | "bass" | "arp" | "kick" | "snare" | "hihat";

export interface InstrumentDef {
  voice: VoiceSettings;
  /** Drums play at a fixed pitch whatever the MIDI note. */
  fixedHz?: number;
}

export const INSTRUMENTS: Record<Instrument, InstrumentDef> = {
  lead: {
    voice: {
      wave: "pulse",
      duty: 0.25,
      pwm: { rate: 5, depth: 0.1 },
      volume: 0.16,
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.08 },
    },
  },
  harmony: {
    voice: {
      wave: "pulse",
      duty: 0.5,
      volume: 0.1,
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 },
    },
  },
  bass: {
    voice: {
      wave: "triangle",
      volume: 0.3,
      envelope: { attack: 0.005, decay: 0.05, sustain: 0.8, release: 0.05 },
    },
  },
  arp: {
    voice: {
      wave: "pulse",
      duty: 0.125,
      volume: 0.07,
      envelope: { attack: 0.001, decay: 0.05, sustain: 0.2, release: 0.03 },
    },
  },
  kick: {
    voice: {
      wave: "sine",
      volume: 0.5,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.02 },
      pitchEnvelope: { semitones: 24, time: 0.06 },
    },
    fixedHz: 55,
  },
  snare: {
    voice: {
      wave: "noise",
      volume: 0.22,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.03 },
      lowpass: 6000,
    },
    fixedHz: 0,
  },
  hihat: {
    voice: {
      wave: "noise",
      volume: 0.07,
      envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
    },
    fixedHz: 0,
  },
};

export interface SongEntry {
  id: string;
  title: string;
  /** Where this song plays. The first song listed for a place is used. */
  plays: MusicPlace[];
  loop: boolean;
  /** Where it came from, and the licence you have it under. Required. */
  source: string;
  licence: string;
  /** A MIDI file in public/music/ ... */
  file?: string;
  /** ...or notes written in code (the built-in placeholder). */
  notes?: () => MidiSong;
  /** Override the default channel mapping (MIDI channels 0-15; 9 is drums). */
  channels?: Partial<Record<number, Instrument>>;
}

/** Channel 10 (index 9) drum notes we play; other GM drums are skipped. */
const DRUMS: [number, number, Instrument][] = [
  [35, 36, "kick"],
  [37, 40, "snare"],
  [42, 46, "hihat"],
];
const DRUM_CHANNEL = 9;
const MELODIC_ORDER: Instrument[] = ["lead", "harmony", "bass", "arp"];

/**
 * The instrument for a note. `channels` lists the song's channels in order of first
 * appearance; melodic channels take lead, harmony, bass and arp in that order.
 */
export function instrumentFor(
  song: SongEntry,
  channels: readonly number[],
  channel: number,
  midi: number,
): Instrument | null {
  const override = song.channels?.[channel];
  if (override) return override;
  if (channel === DRUM_CHANNEL) {
    return DRUMS.find(([lo, hi]) => midi >= lo && midi <= hi)?.[2] ?? null;
  }
  const melodic = channels.filter((c) => c !== DRUM_CHANNEL);
  const index = melodic.indexOf(channel);
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
    plays: ["intro", "menu"],
    loop: true,
    source: "https://www.midiworld.com/",
    licence: "PD",
    file: "baston.mid",
    channels: { 0: "lead", 1: "harmony", 2: "bass" },
  },
  {
    id: "placeholder-theme",
    title: "Keep Theme (placeholder)",
    plays: ["intro", "menu"],
    loop: true,
    source: "Written for this game",
    licence: "Same as this project",
    notes: placeholderTheme,
    channels: { 0: "lead", 2: "bass", 3: "arp" },
  },
];
