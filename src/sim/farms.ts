// Farms: a farmhouse earns for each farmland tile joined to it, touching it or through other
// fields, up to its cap. Which fields count is worked out when needed, never stored, so selling
// or trampling a field needs no bookkeeping. See SPEC-town-economy.md.
import { STRUCTURES, TICK_RATE, type FarmStats, type StructureStats } from "./config";
import { baseAt, damageStructure, isBuilt } from "./grid";
import { DIRECTIONS } from "./pathfinding";
import { addGold } from "./players";
import type { GameState, PlayerId, Structure } from "./types";

/**
 * The fields each farmhouse counts, by farmhouse id. A breadth-first search from every built
 * farmhouse at once over built farmland of the same owner, so a field joined to two goes to the
 * one fewer fields away (the older on a tie). Each counts its nearest fields, up to maxFields.
 */
export function farmFields(state: GameState): Map<number, Structure[]> {
  const counted = new Map<number, Structure[]>();
  const claimed = new Set<number>();
  let frontier: { from: Structure; farmhouse: Structure }[] = [];
  const farmhouses = Object.values(state.structures)
    .filter((s) => farmOf(s) && isBuilt(s) && s.owner !== null)
    .sort((a, b) => a.id - b.id);
  for (const farmhouse of farmhouses) {
    counted.set(farmhouse.id, []);
    frontier.push({ from: farmhouse, farmhouse });
  }
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { from, farmhouse } of frontier) {
      for (const d of DIRECTIONS) {
        const field = baseAt(state, from.x + d.x, from.y + d.y);
        if (!field || claimed.has(field.id) || !isField(field, farmhouse.owner)) continue;
        claimed.add(field.id);
        const mine = counted.get(farmhouse.id)!;
        if (mine.length < farmOf(farmhouse)!.maxFields) mine.push(field);
        next.push({ from: field, farmhouse });
      }
    }
    frontier = next;
  }
  return counted;
}

function farmOf(structure: Structure): FarmStats | undefined {
  const stats: StructureStats = STRUCTURES[structure.kind];
  return stats.farm;
}

function isField(structure: Structure, owner: PlayerId | null): boolean {
  const stats: StructureStats = STRUCTURES[structure.kind];
  return stats.field === true && isBuilt(structure) && structure.owner === owner;
}

/** The farmhouse a field counts for, if any. */
export function farmhouseFor(state: GameState, field: Structure): Structure | undefined {
  for (const [id, fields] of farmFields(state)) {
    if (fields.includes(field)) return state.structures[id];
  }
  return undefined;
}

/** Each farmhouse pays its owner for its fields on its own cycle, starting when it was built. */
export function collectFarmIncome(state: GameState): void {
  let fields: Map<number, Structure[]> | null = null;
  for (const structure of Object.values(state.structures)) {
    const { farm }: StructureStats = STRUCTURES[structure.kind];
    if (!farm || !isBuilt(structure)) continue;
    structure.cooldown--;
    if (structure.cooldown > 0) continue;
    fields ??= farmFields(state); // only worked out on a tick when some farm pays
    addGold(state, structure.owner, farm.goldPerField * (fields.get(structure.id)?.length ?? 0));
    structure.cooldown = farm.intervalSeconds * TICK_RATE;
  }
}

/** What a player's farms earn a minute with the fields they have now. */
export function farmIncomePerMinute(state: GameState, player: PlayerId): number {
  let total = 0;
  for (const [id, fields] of farmFields(state)) {
    const farmhouse = state.structures[id];
    const farm = farmOf(farmhouse)!;
    if (farmhouse.owner === player)
      total += farm.goldPerField * fields.length * (60 / farm.intervalSeconds);
  }
  return total;
}

/** An enemy of `weight` steps onto (x, y): farmland there takes that much damage. */
export function trample(state: GameState, x: number, y: number, weight: number): void {
  const field = baseAt(state, x, y);
  if (!field || weight <= 0) return;
  const stats: StructureStats = STRUCTURES[field.kind];
  if (stats.field) damageStructure(state, field, weight);
}
