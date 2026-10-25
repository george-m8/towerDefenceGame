// A small Standard MIDI File reader: bytes in, timed notes out (in seconds). Handles format 0
// and 1, running status, tempo changes and note-on with velocity 0 as note-off. Everything
// else (meta, sysex, controllers) is read past and ignored. A track with a bad byte is cut
// short there instead of failing the whole file. Pure: no Web Audio here.

export interface MidiNote {
  /** Start time in seconds. */
  time: number;
  /** Length in seconds. */
  duration: number;
  /** MIDI note number (60 = C4). */
  midi: number;
  /** 1-127. */
  velocity: number;
  /** 0-15 (9 is the GM drum channel, "channel 10"). */
  channel: number;
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
}

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
  let lastTick = 0;
  for (let t = 0; t < trackCount; t++) {
    const before = notes.length;
    const end = readTrack(reader, tempos, notes);
    // Only tracks with notes set the length: a misread track can end at a junk time.
    if (notes.length > before) lastTick = Math.max(lastTick, end);
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
        };
      })
      .sort((a, b) => a.time - b.time || a.channel - b.channel || a.midi - b.midi),
    duration: toSeconds(lastTick),
  };
}

/** Reads one MTrk chunk, adding its tempo changes and notes. Returns its last tick. */
function readTrack(reader: Reader, tempos: TempoChange[], notes: RawNote[]): number {
  if (reader.ascii(4) !== "MTrk") throw new MidiError("Corrupt MIDI file: expected a track");
  const length = reader.u32(); // read first: it moves the position past the length bytes
  const end = reader.position + length;
  if (end > reader.length) throw new MidiError("MIDI file is truncated");
  /** Notes sounding, per channel and note number (a stack, for overlapping repeats). */
  const sounding = new Map<number, RawNote[]>();
  let tick = 0;
  let status = 0;

  const noteOff = (channel: number, midi: number) => {
    const note = sounding.get(channel * 128 + midi)?.shift();
    if (note) note.endTick = tick;
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
          tempos.push({
            tick,
            microsPerQuarter: (reader.u8() << 16) | (reader.u8() << 8) | reader.u8(),
          });
        } else {
          reader.skip(length);
        }
        if (type === 0x2f) break; // end of track
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

      status = byte;
      const kind = byte & 0xf0;
      const channel = byte & 0x0f;
      if (kind === 0x80 || kind === 0x90) {
        const midi = reader.u8();
        const velocity = reader.u8();
        if (kind === 0x90 && velocity > 0) {
          const note: RawNote = { startTick: tick, endTick: -1, midi, velocity, channel };
          const key = channel * 128 + midi;
          sounding.set(key, [...(sounding.get(key) ?? []), note]);
          notes.push(note);
        } else {
          noteOff(channel, midi);
        }
      } else if (kind === 0xc0 || kind === 0xd0) {
        reader.skip(1); // program change, channel pressure
      } else {
        reader.skip(2); // poly pressure, controller, pitch bend
      }
    }
  } catch (error) {
    if (!(error instanceof MidiError)) throw error;
    // A bad byte mid-track (some writers produce them): keep this track's notes so far and
    // carry on with the next track, rather than losing the whole song.
  }
  reader.position = end;
  // Notes never released end with their track.
  for (const stack of sounding.values()) for (const note of stack) note.endTick = tick;
  return tick;
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
