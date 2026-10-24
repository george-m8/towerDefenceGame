import { STARTING_GOLD } from "./config";
import type { GameState, PlayerId } from "./types";

/** Adds a player with the starting gold and returns their id. Ids are never reused. */
export function addPlayer(state: GameState, name: string): PlayerId {
  const id = state.nextPlayerId++;
  state.players[id] = { id, name, gold: STARTING_GOLD };
  return id;
}

export function playerName(state: GameState, id: PlayerId): string {
  return state.players[id]?.name ?? "Unknown";
}

/** Pays a player. Gold earned by no one (neutral structures) goes nowhere. */
export function addGold(state: GameState, id: PlayerId | null, amount: number): void {
  if (id === null) return;
  const player = state.players[id];
  if (player) player.gold += amount;
}
