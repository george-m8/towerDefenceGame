// Sound cues: the simulation records *that* something audible happened, as data. The audio
// layer (outside the sim) decides how it sounds and plays each cue id once.
import { CUE_TICKS } from "./config";
import type { GameState, SimCueKind } from "./types";

export function addCue(state: GameState, kind: SimCueKind): void {
  state.cues.push({ id: state.nextCueId++, kind, ttl: CUE_TICKS });
}

/** Ages cues by one tick and drops expired ones. */
export function updateCues(state: GameState): void {
  for (const cue of state.cues) cue.ttl--;
  state.cues = state.cues.filter((cue) => cue.ttl > 0);
}
