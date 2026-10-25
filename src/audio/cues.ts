// Turns cues (from the simulation, or from command results) into sounds: each cue id plays
// once, and each sound is capped per time window. The selection logic is pure.
import type { CommandResult } from "../sim/types";
import type { AudioEngine } from "./engine";
import { SOUNDS, type CueKind, type SoundEffect } from "./sounds";

export interface Cue {
  id: number;
  kind: CueKind;
}

export interface CuePlayerState {
  /** Highest cue id already handled. */
  lastId: number;
  /** When each sound last played (audio-clock seconds), for the caps. */
  recent: Partial<Record<CueKind, number[]>>;
}

export function newCuePlayerState(): CuePlayerState {
  return { lastId: 0, recent: {} };
}

/** Which sounds to play for these cues now, and the updated state. */
export function selectCues(
  cues: readonly Cue[],
  state: CuePlayerState,
  now: number,
  sounds: Record<CueKind, SoundEffect> = SOUNDS,
): { play: CueKind[]; state: CuePlayerState } {
  const newest = cues.reduce((max, cue) => Math.max(max, cue.id), 0);
  // Ids only ever go up within a game; going backwards means a new game started.
  let lastId = newest > 0 && newest < state.lastId ? 0 : state.lastId;
  const recent = { ...state.recent };
  const play: CueKind[] = [];
  for (const cue of [...cues].sort((a, b) => a.id - b.id)) {
    if (cue.id <= lastId) continue;
    lastId = cue.id;
    if (allow(recent, cue.kind, now, sounds)) play.push(cue.kind);
  }
  return { play, state: { lastId, recent } };
}

/** Records the play and returns true if `kind` is still under its cap. */
function allow(
  recent: CuePlayerState["recent"],
  kind: CueKind,
  now: number,
  sounds: Record<CueKind, SoundEffect>,
): boolean {
  const { maxPerWindow, windowSeconds } = sounds[kind];
  const times = (recent[kind] ?? []).filter((t) => now - t < windowSeconds);
  if (times.length >= maxPerWindow) {
    recent[kind] = times;
    return false;
  }
  recent[kind] = [...times, now];
  return true;
}

/** The sound for the result of the player's own command, if any. */
export function soundForResult(commandType: string, result: CommandResult): CueKind | null {
  if (!result.ok) return "denied";
  if (commandType === "build") return "build";
  if (commandType === "sell") return "sell";
  return null;
}

/** Plays one sound effect now through the engine's effects bus. */
export function playSoundEffect(engine: AudioEngine, kind: CueKind): void {
  const start = engine.now();
  for (const note of SOUNDS[kind].notes) {
    engine.playNote(note.voice, note.hz, note.duration, "sfx", start + (note.at ?? 0));
  }
}

/** Keeps the cue state between frames and plays whatever is new. */
export function createCuePlayer(engine: AudioEngine) {
  let state = newCuePlayerState();
  const playAll = (kinds: CueKind[]) => {
    for (const kind of kinds) playSoundEffect(engine, kind);
  };
  return {
    /** Cues from the game state, every frame. */
    update(cues: readonly Cue[]) {
      if (!engine.unlocked) return;
      const result = selectCues(cues, state, engine.now());
      state = result.state;
      playAll(result.play);
    },
    /** A one-off sound from the UI (still capped). */
    play(kind: CueKind) {
      if (!engine.unlocked) return;
      const result = selectCues([{ id: state.lastId + 1, kind }], state, engine.now());
      // UI sounds don't consume a cue id: keep the game's own counter.
      state = { ...result.state, lastId: state.lastId };
      playAll(result.play);
    },
  };
}
