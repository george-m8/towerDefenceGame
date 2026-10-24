import type { GameState, Player, PlayerId } from "../sim/types";

type Vote = keyof Player["votes"];

/** How many connected players voted, out of how many are connected. */
export function voteCount(state: GameState, vote: Vote): { votes: number; of: number } {
  const connected = Object.values(state.players).filter((p) => p.connected);
  return { votes: connected.filter((p) => p.votes[vote]).length, of: connected.length };
}

/** "Pause", or "Pause 1/2" when more than one player is connected. */
export function voteLabel(state: GameState, vote: Vote, label: string): string {
  const { votes, of } = voteCount(state, vote);
  return of > 1 ? `${label} ${votes}/${of}` : label;
}

export function hasVoted(state: GameState, playerId: PlayerId, vote: Vote): boolean {
  return state.players[playerId]?.votes[vote] ?? false;
}
