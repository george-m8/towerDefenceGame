import { SELL_REFUND, STRUCTURES, TICK_RATE, TREE_CLEAR_GOLD, type StructureStats } from "./config";
import { enemyOccupies, isKeepTile, removeStructure, setTerrain, terrainAt, topAt } from "./grid";
import type { CommandResult, GameState, Structure } from "./types";

/** Removes dead enemies and pays out their bounties. */
export function awardBounties(state: GameState): void {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) state.gold += enemy.bounty;
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

/** Each income structure pays out on its own cycle, starting when it was built. */
export function collectIncome(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const { income }: StructureStats = STRUCTURES[structure.kind];
    if (!income) continue;
    structure.cooldown--;
    if (structure.cooldown > 0) continue;
    state.gold += income.gold;
    structure.cooldown = income.intervalSeconds * TICK_RATE;
  }
}

export function incomePerMinute(state: GameState): number {
  let total = 0;
  for (const structure of Object.values(state.structures)) {
    const { income }: StructureStats = STRUCTURES[structure.kind];
    if (income) total += income.gold * (60 / income.intervalSeconds);
  }
  return total;
}

export function sellStructure(state: GameState, x: number, y: number): CommandResult {
  if (state.gameOver) return { ok: false, reason: "Game over" };
  if (isKeepTile(state, x, y)) return { ok: false, reason: "Can't sell the keep" };
  const structure = topAt(state, x, y);
  if (!structure) return clearTerrain(state, x, y);
  const stats: StructureStats = STRUCTURES[structure.kind];
  if (stats.spansWater && state.enemies.some((e) => enemyOccupies(e, x, y))) {
    return { ok: false, reason: "An enemy is on the bridge" };
  }
  state.gold += refundFor(structure);
  removeStructure(state, structure);
  return { ok: true };
}

export function refundFor(structure: Structure): number {
  const condition = structure.maxHp > 0 ? structure.hp / structure.maxHp : 1;
  const stats: StructureStats = STRUCTURES[structure.kind];
  const fullValue = stats.salvageGold ?? stats.cost * SELL_REFUND;
  return Math.floor(fullValue * condition);
}

/** The sell tool on bare terrain: trees are cleared for timber; rock stays. */
function clearTerrain(state: GameState, x: number, y: number): CommandResult {
  const terrain = terrainAt(state, x, y);
  if (terrain === "tree") {
    setTerrain(state, x, y, "ground");
    state.gold += TREE_CLEAR_GOLD;
    return { ok: true };
  }
  if (terrain === "rock") return { ok: false, reason: "Rock can't be cleared" };
  return { ok: false, reason: "Nothing to sell" };
}
