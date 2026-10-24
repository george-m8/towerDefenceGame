import type { GameState } from "./types";

/** Removes dead enemies and pays out their bounties. */
export function awardBounties(state: GameState): void {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) state.gold += enemy.bounty;
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}
