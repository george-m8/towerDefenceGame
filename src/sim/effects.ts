import { BURST_DELAY_TICKS, BURST_TICKS, type EnemyKindId, type UnitKindId } from "./config";
import type { GameState, PlayerId, StructureKind } from "./types";

/** Ages effects by one tick and drops expired ones. */
export function updateEffects(state: GameState): void {
  for (const effect of state.effects) effect.ttl--;
  state.effects = state.effects.filter((effect) => effect.ttl > 0);
}

/** Records something destroyed at (x, y), for the renderer to burst apart. */
export function addBurst(
  state: GameState,
  x: number,
  y: number,
  what:
    { enemy: EnemyKindId } | { structure: StructureKind } | { unit: UnitKindId; owner: PlayerId },
): void {
  state.effects.push({ kind: "burst", x, y, ttl: BURST_DELAY_TICKS + BURST_TICKS, ...what });
}
