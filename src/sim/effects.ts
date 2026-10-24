import type { GameState } from "./types";

/** Ages effects by one tick and drops expired ones. */
export function updateEffects(state: GameState): void {
  for (const effect of state.effects) effect.ttl--;
  state.effects = state.effects.filter((effect) => effect.ttl > 0);
}
