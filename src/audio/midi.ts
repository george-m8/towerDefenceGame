// A small Standard MIDI File reader: bytes in, timed notes out (in seconds). Handles format 0
// and 1, running status, tempo changes, program changes and note-on with velocity 0 as
// note-off. Everything else (meta, sysex, controllers) is read past and ignored. A track that
// doesn't read cleanly is read again as an "overflowed channel" track (see readTrack), and
// failing that is cut short at the bad byte instead of failing the whole file. Pure: no Web
// Audio here.

export interface MidiNote {
  /** Start time in seconds. */
  time: number;
  /** Length in seconds. */
  duration: number;
  /** MIDI note number (60 = C4). */
  midi: number;
  /** 1-127. */
  velocity: number;
  /**
   * 0-15 (9 is the GM drum channel, "channel 10"). 16 and up: a track whose writer overflowed
   * the channel number, given a channel of its own.
   */
  channel: number;
  /** General MIDI program (0-127) the channel had when the note started; unset if none. */
  program?: number;
}

export interface MidiSong {
  notes: MidiNote[];
  /** Length of the song in seconds (to the end of the last track with notes). */
  duration: number;
}

export class MidiError extends Error {}

const DEFAULT_TEMPO = 500_000; // microseconds per quarter note (120 bpm)

interface TempoChange {
  tick: number;
  microsPerQuarter: number;
}

interface RawNote {
  startTick: number;
  endTick: number;
  midi: number;
  velocity: number;
  channel: number;
  program?: number;
}

/** What one track adds to the song. */
interface TrackResult {
  tempos: TempoChange[];
  notes: RawNote[];
  /** Last tick read. */
  end: number;
  /** False if the track stopped at a bad byte, or (overflow read) ran off its end. */
  clean: boolean;
}

/** First channel number given to an overflowed-channel track. */
const OVERFLOW_CHANNEL = 16;

export function parseMidi(bytes: Uint8Array): MidiSong {
  const reader = new Reader(bytes);
  if (reader.ascii(4) !== "MThd") throw new MidiError("Not a MIDI file");
  const headerLength = reader.u32();
  const format = reader.u16();
  const trackCount = reader.u16();
  const division = reader.u16();
  reader.skip(headerLength - 6);
  if (format > 1) throw new MidiError(`MIDI format ${format} isn't supported (only 0 and 1)`);
  if (division & 0x8000) throw new MidiError("SMPTE-timed MIDI files aren't supported");

  const tempos: TempoChange[] = [];
  const notes: RawNote[] = [];
  /** Program per channel, across tracks (a conductor track may set them for the others). */
  const programs = new Map<number, number>();
  let lastTick = 0;
  for (let t = 0; t < trackCount; t++) {
    if (reader.ascii(4) !== "MTrk") throw new MidiError("Corrupt MIDI file: expected a track");
    const length = reader.u32(); // read first: it moves the position past the length bytes
    const start = reader.position;
    const end = start + length;
    if (end > reader.length) throw new MidiError("MIDI file is truncated");

    const strictPrograms = new Map(programs);
    let track = readTrack(reader, start, end, strictPrograms, null);
    if (track.clean) {
      for (const [channel, program] of strictPrograms) programs.set(channel, program);
    } else {
      const retry = readTrack(reader, start, end, new Map(), OVERFLOW_CHANNEL + t);
      if (retry.clean && retry.notes.length >= track.notes.length) track = retry;
    }
    reader.position = end;
    tempos.push(...track.tempos);
    notes.push(...track.notes);
    // Only tracks with notes set the length: a misread track can end at a junk time.
    if (track.notes.length) lastTick = Math.max(lastTick, track.end);
  }

  const toSeconds = secondsAt(tempos, division);
  return {
    notes: notes
      .map((n) => {
        const time = toSeconds(n.startTick);
        return {
          time,
          duration: toSeconds(n.endTick) - time,
          midi: n.midi,
          velocity: n.velocity,
          channel: n.channel,
          ...(n.program !== undefined && { program: n.program }),
        };
      })
      .sort((a, b) => a.time - b.time || a.channel - b.channel || a.midi - b.midi),
    duration: toSeconds(lastTick),
  };
}

/**
 * Reads one track's events, from `start` to `end`. Strict (`overflow` null) is the standard.
 *
 * With `overflow` set, the track is read as Online Sequencer writes it: that site ORs channel
 * numbers past 15 into the status byte, so its high nibble can't be trusted. The first channel
 * event is the program change (if it could be one); every later channel event is a note, on if
 * its velocity is above 0 and off if it's 0. Its notes all go on channel `overflow`.
 */
function readTrack(
  reader: Reader,
  start: number,
  end: number,
  programs: Map<number, number>,
  overflow: number | null,
): TrackResult {
  reader.position = start;
  const result: TrackResult = { tempos: [], notes: [], end: 0, clean: true };
  /** Notes sounding, per channel and note number (a stack, for overlapping repeats). */
  const sounding = new Map<number, RawNote[]>();
  let tick = 0;
  let status = 0;
  let firstEvent = true;
  let endOfTrack = false;

  const noteOn = (channel: number, midi: number, velocity: number) => {
    const note: RawNote = {
      startTick: tick,
      endTick: -1,
      midi,
      velocity,
      channel,
      program: programs.get(channel),
    };
    const key = channel * 128 + midi;
    sounding.set(key, [...(sounding.get(key) ?? []), note]);
    result.notes.push(note);
  };
  const noteOff = (channel: number, midi: number) => {
    const note = sounding.get(channel * 128 + midi)?.shift();
    if (note) note.endTick = tick;
  };
  /** Some writers put 0xFF in a program change; take what fits. */
  const program = () => reader.u8() & 0x7f;
  const data = () => {
    const byte = reader.u8();
    if (byte >= 0x80) throw new MidiError("Corrupt MIDI file: status byte where data belongs");
    return byte;
  };

  try {
    while (reader.position < end) {
      tick += reader.vlq();
      let byte = reader.u8();
      if (byte < 0x80) {
        // Running status: reuse the last status byte; this byte is the first data byte.
        if (!status) throw new MidiError("Corrupt MIDI file: data without a status byte");
        reader.position--;
        byte = status;
      }

      if (byte === 0xff) {
        const type = reader.u8();
        const length = reader.vlq();
        if (type === 0x51 && length === 3) {
          result.tempos.push({
            tick,
            microsPerQuarter: (reader.u8() << 16) | (reader.u8() << 8) | reader.u8(),
          });
        } else {
          reader.skip(length);
        }
        if (type === 0x2f) {
          endOfTrack = true;
          break;
        }
        continue;
      }

      if (overflow !== null) {
        status = byte;
        if (firstEvent && byte >= 0xc0) {
          programs.set(overflow, program()); // only a program change ORs up to 0xC0 or above
        } else {
          const midi = data();
          const velocity = data();
          if (velocity > 0) noteOn(overflow, midi, velocity);
          else noteOff(overflow, midi);
        }
        firstEvent = false;
        continue;
      }

      if (byte === 0xf0 || byte === 0xf7) {
        reader.skip(reader.vlq()); // sysex
        // A real sysex message ends with 0xF7; anything else is a bad byte we've misread.
        if (byte === 0xf0 && reader.previous() !== 0xf7) {
          throw new MidiError("Corrupt MIDI file: unterminated sysex");
        }
        continue;
      }
      if (byte > 0xf0) throw new MidiError("Corrupt MIDI file: unexpected status byte");

      status = byte;
      const kind = byte & 0xf0;
      const channel = byte & 0x0f;
      if (kind === 0x80 || kind === 0x90) {
        const midi = data();
        const velocity = data();
        if (kind === 0x90 && velocity > 0) noteOn(channel, midi, velocity);
        else noteOff(channel, midi);
      } else if (kind === 0xc0) {
        programs.set(channel, program());
      } else if (kind === 0xd0) {
        data(); // channel pressure
      } else {
        data(); // poly pressure, controller, pitch bend
        data();
      }
    }
  } catch (error) {
    if (!(error instanceof MidiError)) throw error;
    // A bad byte mid-track (some writers produce them): keep this track's notes so far.
    result.clean = false;
  }
  // Reading past the end means we've misread; an overflow read is a guess, so it must also
  // land exactly on its end-of-track.
  if (reader.position > end) result.clean = false;
  if (overflow !== null && !(endOfTrack && reader.position === end)) result.clean = false;
  // Notes never released end with their track.
  for (const stack of sounding.values()) for (const note of stack) note.endTick = tick;
  result.end = tick;
  return result;
}

/** Tick -> seconds through the tempo map (tempo changes from every track apply). */
function secondsAt(tempos: TempoChange[], division: number): (tick: number) => number {
  const changes = [...tempos].sort((a, b) => a.tick - b.tick);
  return (tick) => {
    let seconds = 0;
    let fromTick = 0;
    let micros = DEFAULT_TEMPO;
    for (const change of changes) {
      if (change.tick >= tick) break;
      seconds += ((change.tick - fromTick) * micros) / division / 1e6;
      fromTick = change.tick;
      micros = change.microsPerQuarter;
    }
    return seconds + ((tick - fromTick) * micros) / division / 1e6;
  };
}

/** Big-endian byte reading that fails with a clear error instead of reading past the end. */
class Reader {
  position = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get length() {
    return this.bytes.length;
  }

  u8(): number {
    if (this.position >= this.bytes.length) throw new MidiError("MIDI file is truncated");
    return this.bytes[this.position++];
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0;
  }

  ascii(length: number): string {
    let text = "";
    for (let i = 0; i < length; i++) text += String.fromCharCode(this.u8());
    return text;
  }

  /** Variable-length quantity: 7 bits per byte, high bit means "more follows". */
  vlq(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new MidiError("Corrupt MIDI file: number too long");
  }

  /** The byte just read (or skipped). */
  previous(): number {
    return this.bytes[this.position - 1];
  }

  skip(count: number): void {
    if (this.position + count > this.bytes.length) throw new MidiError("MIDI file is truncated");
    this.position += count;
  }
}
