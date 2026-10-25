import { SELL_REFUND, STRUCTURES, TICK_RATE, TREE_CLEAR_GOLD, type StructureStats } from "./config";
import { enemyOccupies, isKeepTile, removeStructure, setTerrain, terrainAt, topAt } from "./grid";
import { addCue } from "./cues";
import { isExplored } from "./fog";
import { addGold, playerName } from "./players";
import type { CommandResult, GameState, PlayerId, Structure } from "./types";

/** Removes dead enemies and pays each bounty to the player who struck the killing blow. */
export function awardBounties(state: GameState): void {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) addGold(state, enemy.killedBy, enemy.bounty);
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

/** Each income structure pays its owner on its own cycle, starting when it was built. */
export function collectIncome(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const { income }: StructureStats = STRUCTURES[structure.kind];
    if (!income) continue;
    structure.cooldown--;
    if (structure.cooldown > 0) continue;
    addGold(state, structure.owner, income.gold);
    structure.cooldown = income.intervalSeconds * TICK_RATE;
  }
}

export function incomePerMinute(state: GameState, player: PlayerId): number {
  let total = 0;
  for (const structure of Object.values(state.structures)) {
    if (structure.owner !== player) continue;
    const { income }: StructureStats = STRUCTURES[structure.kind];
    if (income) total += income.gold * (60 / income.intervalSeconds);
  }
  return total;
}

export function sellStructure(
  state: GameState,
  player: PlayerId,
  x: number,
  y: number,
): CommandResult {
  if (state.gameOver) return { ok: false, reason: "Game over" };
  if (isKeepTile(state, x, y)) return { ok: false, reason: "Can't sell the keep" };
  if (!isExplored(state, x, y)) return { ok: false, reason: "Can't sell on unexplored land" };
  const structure = topAt(state, x, y);
  if (!structure) return clearTerrain(state, player, x, y);
  if (structure.owner !== null && structure.owner !== player) {
    return { ok: false, reason: `That belongs to ${playerName(state, structure.owner)}` };
  }
  const stats: StructureStats = STRUCTURES[structure.kind];
  if (stats.spansWater && state.enemies.some((e) => enemyOccupies(e, x, y))) {
    return { ok: false, reason: "An enemy is on the bridge" };
  }
  addGold(state, player, refundFor(structure));
  removeStructure(state, structure);
  return { ok: true };
}

export function refundFor(structure: Structure): number {
  const condition = structure.maxHp > 0 ? structure.hp / structure.maxHp : 1;
  const stats: StructureStats = STRUCTURES[structure.kind];
  // Half of what was actually paid, so a discounted build can't be sold for more than it cost.
  const fullValue = stats.salvageGold ?? (structure.paid ?? stats.cost) * SELL_REFUND;
  return Math.floor(fullValue * condition);
}

/** The sell tool on bare terrain: trees are cleared for timber; rock stays. */
function clearTerrain(state: GameState, player: PlayerId, x: number, y: number): CommandResult {
  const terrain = terrainAt(state, x, y);
  if (terrain === "tree") {
    setTerrain(state, x, y, "ground");
    addGold(state, player, TREE_CLEAR_GOLD);
    return { ok: true };
  }
  if (terrain === "rock") return { ok: false, reason: "Rock can't be cleared" };
  return { ok: false, reason: "Nothing to sell" };
}

/** Building on a treasure chest's tile claims its gold. */
export function claimChest(state: GameState, player: PlayerId, x: number, y: number): void {
  const chest = state.features.find((f) => f.kind === "chest" && f.x === x && f.y === y);
  if (!chest) return;
  addGold(state, player, chest.gold);
  state.features = state.features.filter((f) => f !== chest);
  addCue(state, "treasure");
}
