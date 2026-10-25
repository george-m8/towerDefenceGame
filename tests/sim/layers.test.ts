import { describe, expect, it } from "vitest";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import {
  attackTargetAt,
  baseAt,
  blocksAt,
  canBuild,
  isElevated,
  isKeepTile,
  mountAt,
  placeStructure,
  topAt,
} from "../../src/sim/grid";
import { buildAt, createGameWithoutWaves, ring, goldOf } from "./helpers";

describe("layer data model", () => {
  it("starts with ground terrain, the keep in the base layer and no mounts", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(state).not.toHaveProperty("tiles");
    expect(state.terrain.every((t) => t === "ground")).toBe(true);
    expect(state.mount.every((id) => id === 0)).toBe(true);
    expect(isKeepTile(state, state.keeps[0].x, state.keeps[0].y)).toBe(true);
  });

  it("puts walls, spikes and houses in the base layer", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    for (const [i, kind] of (["wall", "wallSpikes", "floorSpikes", "house"] as const).entries()) {
      const s = placeStructure(state, kind, 5 + i, 5);
      expect(baseAt(state, 5 + i, 5)).toBe(s);
      expect(mountAt(state, 5 + i, 5)).toBeUndefined();
      expect(topAt(state, 5 + i, 5)).toBe(s);
    }
  });

  it("puts towers on open ground in the mount layer", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    for (const [i, kind] of (["archer", "cannon", "catapult"] as const).entries()) {
      const tower = placeStructure(state, kind, 5 + i, 5);
      expect(mountAt(state, 5 + i, 5)).toBe(tower);
      expect(baseAt(state, 5 + i, 5)).toBeUndefined();
      expect(isElevated(state, tower)).toBe(false);
    }
  });
});

describe("blocksAt and attackTargetAt", () => {
  it("open ground, floor spikes and the keep don't block", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    placeStructure(state, "floorSpikes", 5, 5);
    expect(blocksAt(state, 4, 4)).toBe(false);
    expect(blocksAt(state, 5, 5)).toBe(false);
    expect(blocksAt(state, state.keeps[0].x, state.keeps[0].y)).toBe(false);
    expect(attackTargetAt(state, 5, 5)).toBeUndefined();
  });

  it("a wall blocks and is the attack target", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const wall = placeStructure(state, "wall", 5, 5);
    expect(blocksAt(state, 5, 5)).toBe(true);
    expect(attackTargetAt(state, 5, 5)).toBe(wall);
  });

  it("a ground tower blocks and is the attack target", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const archer = placeStructure(state, "archer", 5, 5);
    expect(blocksAt(state, 5, 5)).toBe(true);
    expect(attackTargetAt(state, 5, 5)).toBe(archer);
  });

  it("a wall-mounted tower is elevated, and its wall is the attack target", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const wall = placeStructure(state, "wall", 5, 5);
    const archer = placeStructure(state, "archer", 5, 5);
    expect(baseAt(state, 5, 5)).toBe(wall);
    expect(mountAt(state, 5, 5)).toBe(archer);
    expect(topAt(state, 5, 5)).toBe(archer);
    expect(isElevated(state, archer)).toBe(true);
    expect(attackTargetAt(state, 5, 5)).toBe(wall);
  });

  it("out of bounds tiles have no layers", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(topAt(state, -1, 0)).toBeUndefined();
    expect(blocksAt(state, -1, 0)).toBe(false);
  });
});

describe("placement rules", () => {
  // Every tile used below is open ground before setup.
  function withBase(kind?: "wall" | "wallSpikes" | "floorSpikes" | "house") {
    const state = createGameWithoutWaves();
    if (kind) placeStructure(state, kind, 5, 5);
    return state;
  }

  it.each([
    ["open ground", undefined, { ok: true }],
    ["a wall", "wall", { ok: true }],
    ["wall spikes", "wallSpikes", { ok: false, reason: "Can't put a tower on wall spikes" }],
    ["floor spikes", "floorSpikes", { ok: false, reason: "Can't put a tower on floor spikes" }],
    ["a house", "house", { ok: false, reason: "Can't put a tower on house" }],
  ] as const)("a tower on %s", (_, base, expected) => {
    const state = withBase(base);
    expect(canBuild(state, 1, "archer", 5, 5)).toEqual(expected);
  });

  it("rejects a second tower on the same tile, on ground or on a wall", () => {
    const ground = withBase();
    placeStructure(ground, "archer", 5, 5);
    expect(canBuild(ground, 1, "cannon", 5, 5)).toEqual({
      ok: false,
      reason: "A tower is already here",
    });
    const wall = withBase("wall");
    placeStructure(wall, "archer", 5, 5);
    expect(canBuild(wall, 1, "cannon", 5, 5)).toEqual({
      ok: false,
      reason: "A tower is already here",
    });
  });

  it("rejects towers on the keep and in the spawn zone", () => {
    const state = withBase();
    expect(canBuild(state, 1, "archer", state.keeps[0].x, state.keeps[0].y).ok).toBe(false);
    const spawn = state.spawnTiles[0];
    expect(canBuild(state, 1, "archer", spawn.x, spawn.y).ok).toBe(false);
  });

  it("rejects a base on any occupied tile, including under a ground tower", () => {
    const state = withBase("wall");
    expect(canBuild(state, 1, "wall", 5, 5)).toEqual({ ok: false, reason: "Tile is occupied" });
    placeStructure(state, "archer", 7, 7);
    expect(canBuild(state, 1, "wall", 7, 7)).toEqual({ ok: false, reason: "Tile is occupied" });
  });

  it("ignores enemies when mounting on a wall, but not on open ground", () => {
    const state = withBase("wall");
    spawnEnemy(state, 5, 5); // pretend an enemy overlaps the wall tile
    spawnEnemy(state, 7, 7);
    expect(canBuild(state, 1, "archer", 5, 5).ok).toBe(true);
    expect(canBuild(state, 1, "archer", 7, 7)).toEqual({
      ok: false,
      reason: "An enemy is in the way",
    });
  });

  it("building a tower on a wall keeps the wall blocking and makes the tower elevated", () => {
    const state = withBase("wall");
    expect(applyCommand(state, 1, { type: "build", kind: "archer", x: 5, y: 5 })).toEqual({
      ok: true,
    });
    const archer = mountAt(state, 5, 5)!;
    expect(archer.kind).toBe("archer");
    expect(baseAt(state, 5, 5)?.kind).toBe("wall");
    expect(blocksAt(state, 5, 5)).toBe(true);
    expect(isElevated(state, archer)).toBe(true);
  });
});

describe("combat across layers", () => {
  const TOUGH = 1_000_000;
  const run = (state: ReturnType<typeof createGame>, ticks: number) => {
    for (let i = 0; i < ticks; i++) tick(state);
  };

  function sealedKeep() {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const y = keep.y + 1;
    const target = { x: keep.x - 1, y }; // the ring tile an enemy from the left attacks
    buildAt(state, ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size));
    return { state, y, target };
  }

  it("a wall shields the tower on it, and the tower falls with the wall", () => {
    const { state, y, target } = sealedKeep();
    const archer = placeStructure(state, "archer", target.x, target.y);
    spawnEnemy(state, target.x - 2, y, { hp: TOUGH });
    const gold = goldOf(state);

    run(state, 100);
    const wall = baseAt(state, target.x, target.y)!;
    expect(wall.hp).toBeLessThan(wall.maxHp);
    expect(archer.hp).toBe(archer.maxHp);

    // Step until the wall breaks: the archer must go in that same tick, not get attacked after.
    for (let i = 0; i < 400 && baseAt(state, target.x, target.y); i++) tick(state);
    expect(baseAt(state, target.x, target.y)).toBeUndefined();
    expect(mountAt(state, target.x, target.y)).toBeUndefined();
    expect(state.structures[archer.id]).toBeUndefined();
    expect(goldOf(state)).toBe(gold); // no refund for a fallen tower
  });

  it("a ground tower sealing the route is attacked directly", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const y = keep.y + 1;
    const gap = { x: keep.x - 1, y };
    buildAt(
      state,
      ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size).filter(
        (p) => p.x !== gap.x || p.y !== gap.y,
      ),
    );
    const cannon = placeStructure(state, "cannon", gap.x, gap.y);
    spawnEnemy(state, gap.x - 2, y, { hp: TOUGH });
    run(state, 100);
    expect(cannon.hp).toBeLessThan(cannon.maxHp);
  });

  it("ground towers with an open route around them take no damage", () => {
    const state = createGameWithoutWaves();
    const y = state.keeps[0].y + 1;
    const towers = [8, 9, 11, 12].map((x) => placeStructure(state, "archer", 15, y - 10 + x));
    spawnEnemy(state, 0, y, { hp: TOUGH });
    run(state, 1000);
    for (const t of towers) expect(t.hp).toBe(t.maxHp);
  });
});

describe("ruins", () => {
  it("block like walls and can hold a tower", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "ruin", 5, 5);
    expect(blocksAt(state, 5, 5)).toBe(true);
    expect(canBuild(state, 1, "archer", 5, 5)).toEqual({ ok: true });
  });

  it("can't be built by the player", () => {
    const state = createGameWithoutWaves();
    expect(canBuild(state, 1, "ruin", 5, 5)).toEqual({ ok: false, reason: "Ruins can't be built" });
  });
});
