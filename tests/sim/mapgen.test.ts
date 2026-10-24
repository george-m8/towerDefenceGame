import { describe, expect, it } from "vitest";
import { GRID_HEIGHT, GRID_WIDTH, MAP_GEN, TERRAIN } from "../../src/sim/config";
import { createGame } from "../../src/sim/game";
import { baseAt } from "../../src/sim/grid";
import { generateTerrain, layoutFor, type MapLayout } from "../../src/sim/mapgen";
import type { Terrain } from "../../src/sim/types";

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);
const at = (layout: MapLayout, terrain: Terrain[], x: number, y: number) =>
  terrain[y * layout.width + x];

/** Independent flood fill over walkable terrain, starting from the keep. */
function reachableFromKeep(layout: MapLayout, terrain: Terrain[]): Set<number> {
  const { width, height, keep } = layout;
  const seen = new Set<number>();
  const queue: number[] = [];
  for (let y = keep.y; y < keep.y + keep.size; y++) {
    for (let x = keep.x; x < keep.x + keep.size; x++) queue.push(y * width + x);
  }
  for (const i of queue) seen.add(i);
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const ni = ny * width + nx;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen.has(ni)) continue;
      if (!TERRAIN[terrain[ni]].walkable) continue;
      seen.add(ni);
      queue.push(ni);
    }
  }
  return seen;
}

function expectGuarantees(layout: MapLayout, terrain: Terrain[]) {
  const { keep, width } = layout;
  const reach = reachableFromKeep(layout, terrain);
  const problems: string[] = [];
  for (const p of layout.spawnTiles) {
    if (!reach.has(p.y * width + p.x)) problems.push(`spawn ${p.x},${p.y} cut off`);
  }
  const r = MAP_GEN.keepClearRadius;
  for (let y = keep.y - r; y < keep.y + keep.size + r; y++) {
    for (let x = keep.x - r; x < keep.x + keep.size + r; x++) {
      if (at(layout, terrain, x, y) !== "ground") problems.push(`keep ring ${x},${y}`);
    }
  }
  for (const p of layout.spawnTiles) {
    for (let dx = 0; dx <= MAP_GEN.spawnClearColumns; dx++) {
      if (at(layout, terrain, p.x + dx, p.y) !== "ground")
        problems.push(`spawn area ${p.x + dx},${p.y}`);
    }
  }
  expect(problems).toEqual([]);
}

/** Edges that are at least half sea: a coast hugs exactly one. */
function coastEdges(layout: MapLayout, terrain: Terrain[]): string[] {
  const { width, height } = layout;
  const edges = {
    top: Array.from({ length: width }, (_, x) => at(layout, terrain, x, 0)),
    bottom: Array.from({ length: width }, (_, x) => at(layout, terrain, x, height - 1)),
    left: Array.from({ length: height }, (_, y) => at(layout, terrain, 0, y)),
    right: Array.from({ length: height }, (_, y) => at(layout, terrain, width - 1, y)),
  };
  return Object.entries(edges)
    .filter(([, tiles]) => tiles.filter((t) => t === "sea").length >= tiles.length / 2)
    .map(([edge]) => edge);
}

const count = (terrain: Terrain[], kind: Terrain) => terrain.filter((t) => t === kind).length;

/** Connected groups of ford tiles: each group is one crossing. */
function fordCrossings(layout: MapLayout, terrain: Terrain[]): number {
  const { width } = layout;
  const seen = new Set<number>();
  let groups = 0;
  terrain.forEach((t, start) => {
    if (t !== "ford" || seen.has(start)) return;
    groups++;
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const i = queue.pop()!;
      for (const n of [
        i - width,
        i + width,
        i % width > 0 ? i - 1 : -1,
        i % width < width - 1 ? i + 1 : -1,
      ]) {
        if (terrain[n] === "ford" && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
  });
  return groups;
}

describe("generateTerrain", () => {
  // The 500-seed checks run on a fixed mid-size map so the suite stays fast as the default
  // map grows; the default size gets its own check below.
  const layout = layoutFor(108, 72);

  it("is deterministic per seed, and different seeds give different maps", () => {
    expect(generateTerrain(layout, 7).terrain).toEqual(generateTerrain(layout, 7).terrain);
    expect(generateTerrain(layout, 7).terrain).not.toEqual(generateTerrain(layout, 8).terrain);
  });

  it("meets every guarantee for 500 seeds", () => {
    for (const seed of SEEDS) {
      const { terrain, fallback } = generateTerrain(layout, seed);
      expect(fallback).toBe(false);
      expectGuarantees(layout, terrain);
      expect(coastEdges(layout, terrain)).toHaveLength(1);
      expect(coastEdges(layout, terrain)).not.toContain("left");
      expect(count(terrain, "river")).toBeGreaterThan(0);
      expect(fordCrossings(layout, terrain)).toBeGreaterThanOrEqual(1);
      expect(fordCrossings(layout, terrain)).toBeLessThanOrEqual(2);
    }
  });

  it("meets every guarantee at the default map size too", () => {
    const full = layoutFor(GRID_WIDTH, GRID_HEIGHT);
    for (const seed of SEEDS.slice(0, 25)) {
      const { terrain, fallback } = generateTerrain(full, seed);
      expect(fallback, `seed ${seed}`).toBe(false);
      expectGuarantees(full, terrain);
      const reach = reachableFromKeep(full, terrain);
      const cutOff = terrain.flatMap((t, i) => (TERRAIN[t].walkable && !reach.has(i) ? [i] : []));
      expect(cutOff, `seed ${seed}`).toEqual([]);
    }
  });

  it("leaves no walkable tile cut off from the keep, so every ford really crosses", () => {
    for (const seed of SEEDS) {
      const { terrain } = generateTerrain(layout, seed);
      const reach = reachableFromKeep(layout, terrain);
      const cutOff = terrain.flatMap((t, i) => (TERRAIN[t].walkable && !reach.has(i) ? [i] : []));
      expect(cutOff, `seed ${seed}`).toEqual([]);
    }
  });

  it("scatters rock clusters and forests, more of them on bigger maps", () => {
    for (const seed of SEEDS) {
      const { terrain } = generateTerrain(layout, seed);
      expect(count(terrain, "rock"), `seed ${seed}`).toBeGreaterThan(0);
      expect(count(terrain, "tree"), `seed ${seed}`).toBeGreaterThan(0);
    }
    const big = layoutFor(layout.width * 2, layout.height * 2);
    const features = (l: MapLayout) =>
      SEEDS.slice(0, 20).reduce((sum, seed) => {
        const { terrain } = generateTerrain(l, seed);
        return sum + count(terrain, "rock") + count(terrain, "tree");
      }, 0);
    // 4x the area should give well over twice the rocks and trees.
    expect(features(big)).toBeGreaterThan(2.5 * features(layout));
  });

  it("places damaged ruin fragments on reachable open ground", () => {
    for (const seed of SEEDS) {
      const { terrain, ruins } = generateTerrain(layout, seed);
      expect(ruins.length, `seed ${seed}`).toBeGreaterThan(0);
      const reach = reachableFromKeep(layout, terrain);
      const problems = ruins.flatMap((r) => {
        const i = r.y * layout.width + r.x;
        if (terrain[i] !== "ground") return [`ruin on ${terrain[i]}`];
        if (!reach.has(i)) return ["ruin cut off"];
        if (r.hpFraction < 0.4 || r.hpFraction > 0.8) return [`hp ${r.hpFraction}`];
        return [];
      });
      expect(problems, `seed ${seed}`).toEqual([]);
      expect(new Set(ruins.map((r) => `${r.x},${r.y}`)).size).toBe(ruins.length);
    }
  });

  it("places treasure chests on reachable open ground, worth more further from the keep", () => {
    const { keep } = layout;
    const centre = { x: keep.x + 1, y: keep.y + 1 };
    for (const seed of SEEDS) {
      const { terrain, ruins, chests } = generateTerrain(layout, seed);
      expect(chests.length, `seed ${seed}`).toBeGreaterThan(0);
      const reach = reachableFromKeep(layout, terrain);
      const ruinTiles = new Set(ruins.map((r) => `${r.x},${r.y}`));
      const problems = chests.flatMap((c) => {
        const i = c.y * layout.width + c.x;
        if (terrain[i] !== "ground") return [`chest on ${terrain[i]}`];
        if (!reach.has(i)) return ["chest cut off"];
        if (ruinTiles.has(`${c.x},${c.y}`)) return ["chest under a ruin"];
        if (c.gold < MAP_GEN.chestGold[0] || c.gold > MAP_GEN.chestGold[1])
          return [`gold ${c.gold}`];
        return [];
      });
      expect(problems, `seed ${seed}`).toEqual([]);
      const byDistance = [...chests].sort(
        (p, q) =>
          Math.abs(p.x - centre.x) +
          Math.abs(p.y - centre.y) -
          (Math.abs(q.x - centre.x) + Math.abs(q.y - centre.y)),
      );
      for (let i = 1; i < byDistance.length; i++) {
        expect(byDistance[i].gold).toBeGreaterThanOrEqual(byDistance[i - 1].gold);
      }
    }
  });

  it("works on a much larger map", () => {
    const big = layoutFor(96, 64);
    for (const seed of SEEDS.slice(0, 50)) {
      const { terrain, fallback } = generateTerrain(big, seed);
      expect(fallback).toBe(false);
      expectGuarantees(big, terrain);
      expect(coastEdges(big, terrain)).toHaveLength(1);
    }
  });

  it("retries with derived seeds when a map fails, and stays valid", () => {
    // With no fords, any river between the spawn and the keep cuts it off, forcing retries.
    const strict = { ...MAP_GEN, riverFords: [0, 0] as [number, number] };
    const results = SEEDS.slice(0, 100).map((seed) => generateTerrain(layout, seed, strict));
    expect(results.some((r) => r.attempts > 1)).toBe(true);
    for (const r of results) {
      if (!r.fallback) expectGuarantees(layout, r.terrain);
    }
  });

  it("falls back to open ground when it runs out of attempts", () => {
    const result = generateTerrain(layout, 1, { ...MAP_GEN, maxAttempts: 0 });
    expect(result.fallback).toBe(true);
    expect(result.terrain.every((t) => t === "ground")).toBe(true);
  });
});

describe("createGame map generation", () => {
  it("generates terrain by default and records the seed", () => {
    const state = createGame(42);
    expect(state.seed).toBe(42);
    expect(state.terrain.some((t) => t !== "ground")).toBe(true);
  });

  it("builds the generated ruins as damaged structures", () => {
    const state = createGame(42);
    const ruins = Object.values(state.structures).filter((s) => s.kind === "ruin");
    expect(ruins.length).toBeGreaterThan(0);
    for (const ruin of ruins) {
      expect(baseAt(state, ruin.x, ruin.y)).toBe(ruin);
      expect(ruin.hp).toBeLessThan(ruin.maxHp);
      expect(ruin.hp).toBeGreaterThanOrEqual(ruin.maxHp * 0.4);
    }
  });

  it("puts the generated chests in the features list", () => {
    const state = createGame(42);
    expect(state.features.length).toBeGreaterThan(0);
    expect(state.features.every((f) => f.kind === "chest")).toBe(true);
  });

  it("gives an open field with blankMap", () => {
    const state = createGame(42, { blankMap: true });
    expect(state.terrain.every((t) => t === "ground")).toBe(true);
  });
});
