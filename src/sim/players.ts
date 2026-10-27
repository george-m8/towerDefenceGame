import { FAST_FORWARD_SPEED, STARTING_GOLD } from "./config";
import { skipToNight } from "./clock";
import type { GameState, Player, PlayerId } from "./types";

/** Nobody voting for anything. */
export const NO_VOTES: Player["votes"] = { pause: false, fastForward: false, skipToNight: false };

/** Adds a player with the starting gold and returns their id. Ids are never reused. */
export function addPlayer(state: GameState, name: string): PlayerId {
  const id = state.nextPlayerId++;
  state.players[id] = {
    id,
    name,
    gold: STARTING_GOLD,
    connected: true,
    votes: { ...NO_VOTES },
  };
  updateVotes(state);
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

/** Marks a player as dropped out or back. A dropped player's votes are cleared. */
export function setConnected(state: GameState, id: PlayerId, connected: boolean): void {
  const player = state.players[id];
  if (!player) return;
  player.connected = connected;
  if (!connected) player.votes = { ...NO_VOTES };
  updateVotes(state);
}

/**
 * Pause and fast-forward happen only while every connected player votes for them.
 * With nobody connected the game pauses. The only place `paused` and `speed` are set.
 * Skip to night happens once every connected player votes for it, and clears the votes.
 */
export function updateVotes(state: GameState): void {
  const connected = Object.values(state.players).filter((p) => p.connected);
  const unanimous = (vote: keyof Player["votes"]) =>
    connected.length > 0 && connected.every((p) => p.votes[vote]);
  state.paused = connected.length === 0 || unanimous("pause");
  state.speed = unanimous("fastForward") ? FAST_FORWARD_SPEED : 1;
  if (unanimous("skipToNight")) {
    skipToNight(state);
    for (const player of Object.values(state.players)) player.votes.skipToNight = false;
  }
}
