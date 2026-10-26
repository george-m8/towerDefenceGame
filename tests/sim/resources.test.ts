import { describe, expect, it } from "vitest";
import {
  RESOURCES,
  STRUCTURES,
  TICK_RATE,
  TREE_CLEAR_GOLD,
  type ResourceTerrain,
} from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, placeStructure, terrainAt } from "../../src/sim/grid";
import { distanceAt } from "../../src/sim/pathfinding";
import { harvest, placeResource, resourceAt } from "../../src/sim/resources";
import { TOOLS } from "../../src/ui/state";
import type { GameState } from "../../src/sim/types";
import { column, createGameWithoutWaves, goldOf, paintTerrain } from "./helpers";

describe("harvest", () => {
  it("takes the units and pays units x value to the owner", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 5, 5, "tree", 3);
    const gold = goldOf(state);

    expect(harvest(state, 5, 5, 2, 1)).toBe(2 * RESOURCES.tree.value);
    expect(goldOf(state)).toBe(gold + 2 * RESOURCES.tree.value);
    expect(resourceAt(state, 5, 5)).toEqual({ terrain: "tree", left: 1, start: 3 });
  });

  it("gold-veined rock pays its own value per unit", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 5, 5, "goldRock", 10);
    expect(harvest(state, 5, 5, 1, 1)).toBe(RESOURCES.goldRock.value);
  });

  it("the last hit pays only what's left, and an empty tile pays nothing", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 5, 5, "rock", 1);
    expect(harvest(state, 5, 5, 5, 1)).toBe(RESOURCES.rock.value);
    const gold = goldOf(state);
    expect(harvest(state, 5, 5, 5, 1)).toBe(0);
    expect(harvest(state, 9, 9, 5, 1)).toBe(0);
    expect(goldOf(state)).toBe(gold);
  });

  it("a used-up tile becomes ground and changes the grid", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 5, 5, "berries", 2);
    const version = state.gridVersion;
    harvest(state, 5, 5, 2, 1);
    expect(terrainAt(state, 5, 5)).toBe("ground");
    expect(resourceAt(state, 5, 5)).toBeNull();
    expect(state.gridVersion).toBeGreaterThan(version);
  });

  it("a used-up rock opens a route that enemies then take", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const x = keep.x - 5;
    const y = keep.y + 1;
    paintTerrain(state, column(state, x, [0, y]), "rock"); // open only at the top...
    placeResource(state, x, y, "rock", 1); // ...and through this rock, once it's mined
    const before = distanceAt(state, x - 1, y);

    harvest(state, x, y, 1, 1);

    expect(distanceAt(state, x - 1, y)).toBeLessThan(before);
    expect(distanceAt(state, x - 1, y)).toBe(distanceAt(state, x, y) + 1);
  });
});

describe("amounts on a new map", () => {
  it("every resource tile starts within its kind's range, the same for the same seed", () => {
    const state = createGame(5);
    const again = createGame(5);
    let tiles = 0;
    for (let i = 0; i < state.terrain.length; i++) {
      const terrain = state.terrain[i];
      if (!(terrain in RESOURCES)) {
        expect(state.resources[i]).toBe(0);
        continue;
      }
      const [lo, hi] = RESOURCES[terrain as ResourceTerrain].amount;
      expect(state.resources[i]).toBeGreaterThanOrEqual(lo);
      expect(state.resources[i]).toBeLessThanOrEqual(hi);
      expect(state.resourceStart[i]).toBe(state.resources[i]);
      tiles++;
    }
    expect(tiles).toBeGreaterThan(0);
    expect(again.resources).toEqual(state.resources);
  });

  it("blank maps have none", () => {
    const state = createGameWithoutWaves();
    expect(state.resources.every((n) => n === 0)).toBe(true);
  });
});

describe("the sell tool on a tree", () => {
  it("still pays its clearing gold and leaves no timber behind", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 5, 5, "tree", 30);
    const gold = goldOf(state);
    expect(applyCommand(state, 1, { type: "sell", x: 5, y: 5 })).toEqual({ ok: true });
    expect(goldOf(state)).toBe(gold + TREE_CLEAR_GOLD);
    expect(resourceAt(state, 5, 5)).toBeNull();
    expect(terrainAt(state, 5, 5)).toBe("ground");
  });
});

describe("gatherer buildings", () => {
  const gatherers = [
    ["timberYard", "lumberjack", "KeyT"],
    ["mine", "miner", "KeyG"],
    ["foragerHut", "forager", "KeyB"],
  ] as const;

  it("each spawns its own workers, one per interval, up to its quota", () => {
    for (const [kind, worker] of gatherers) {
      const spawner = STRUCTURES[kind].spawner;
      expect(spawner.unit).toBe(worker);
      const state = createGameWithoutWaves();
      placeStructure(state, kind, 10, 10, "N", 1);
      tick(state);
      expect(state.units.map((u) => u.kind)).toEqual([worker]);
      run(state, spawner.quota * spawner.intervalSeconds * TICK_RATE);
      expect(state.units).toHaveLength(spawner.quota);
    }
  });

  it("selling one leaves its workers working, with none replaced", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "timberYard", 10, 10, "N", 1);
    placeResource(state, 10, 13, "tree", 100);
    tick(state);
    expect(applyCommand(state, 1, { type: "sell", x: 10, y: 10 })).toEqual({ ok: true });
    run(state, 2 * STRUCTURES.timberYard.spawner.intervalSeconds * TICK_RATE);
    expect(state.units).toHaveLength(1);
    expect(resourceAt(state, 10, 13)!.left).toBeLessThan(100);
  });

  it("checkpoint A: a yard fills up, its lumberjacks clear trees for gold, and a death is replaced", () => {
    const state = createGameWithoutWaves();
    const yard = STRUCTURES.timberYard.spawner;
    placeStructure(state, "timberYard", 10, 10, "N", 1);
    for (let x = 6; x <= 14; x++) placeResource(state, x, 14, "tree", 2);
    const gold = goldOf(state);

    run(state, yard.quota * yard.intervalSeconds * TICK_RATE);

    expect(state.units.filter((u) => u.kind === "lumberjack")).toHaveLength(yard.quota);
    expect(goldOf(state)).toBeGreaterThan(gold);
    expect(state.terrain.filter((t) => t === "tree").length).toBeLessThan(9);

    const victim = state.units[0];
    const before = new Set(state.units.map((u) => u.id));
    spawnEnemy(state, victim.x, victim.y, { hp: 1000 });
    for (let i = 0; i < 30 * TICK_RATE && state.units.includes(victim); i++) tick(state);
    expect(state.units).not.toContain(victim);
    tick(state);
    expect(state.units.some((u) => !before.has(u.id))).toBe(true);
  });

  it("are built like a house, from their own keys", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 12, 10, "berries", 10);
    for (const [kind, , key] of gatherers) {
      expect(TOOLS.find((t) => t.key === key)?.tool).toBe(kind);
      expect(canBuild(state, 1, kind, 10, 10)).toEqual(canBuild(state, 1, "house", 10, 10));
      expect(canBuild(state, 1, kind, 12, 10).ok).toBe(false); // not on a bush
    }
  });
});

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}
