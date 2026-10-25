import { describe, expect, it } from "vitest";
import { ENEMY_KINDS } from "../../src/sim/config";
import { damageEnemy, spawnEnemy } from "../../src/sim/enemies";
import { tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import type { Enemy, GameState, Structure, StructureKind } from "../../src/sim/types";
import { createGameWithoutWaves, goldOf } from "./helpers";

const blast = ENEMY_KINDS.dwarfBomber.ability.amount;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

/** A structure built by player 1, so it counts as player-built. */
function owned(state: GameState, kind: StructureKind, x: number, y: number): Structure {
  return placeStructure(state, kind, x, y, "N", 1);
}

/** Enough HP to survive a blast, so the damage can be measured. */
function sturdy(structure: Structure): Structure {
  structure.hp = structure.maxHp = 1000;
  return structure;
}

/** A tile in the keep's row, well to its left: enemies there walk straight east. */
function lane(state: GameState, dx: number) {
  return { x: state.keeps[0].x - dx, y: state.keeps[0].y + 1 };
}

describe("bomber", () => {
  it("walks normally while no target is within 3 tiles", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    owned(state, "wall", p.x, p.y - 4);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });

    tick(state);

    expect(bomber.mode).toBe("walking");
    expect(bomber.targetId).toBeNull();
  });

  it("sprints once a player-built wall is within 3 tiles", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const wall = owned(state, "wall", p.x, p.y + 3);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });

    tick(state);

    expect(bomber.mode).toBe("sprinting");
    expect(bomber.targetId).toBe(wall.id);
  });

  it("goes for towers and houses too", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const house = owned(state, "house", p.x, p.y + 2);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    tick(state);
    expect(bomber.targetId).toBe(house.id);

    const q = lane(state, 40);
    const tower = owned(state, "archer", q.x, q.y - 2);
    const other = spawnEnemy(state, q.x, q.y, { kind: "dwarfBomber" });
    tick(state);
    expect(other.targetId).toBe(tower.id);
  });

  it("ignores ruins, bridges, floor spikes and the keep", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    placeStructure(state, "ruin", p.x, p.y + 2);
    owned(state, "bridge", p.x + 1, p.y - 2);
    owned(state, "floorSpikes", p.x + 2, p.y + 2);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    const atKeep = spawnEnemy(state, state.keeps[0].x - 1, state.keeps[0].y, {
      kind: "dwarfBomber",
    });

    run(state, 10);

    expect(bomber.mode).toBe("walking");
    expect(atKeep.mode).toBe("walking");
    expect(state.enemies).toContain(atKeep);
  });

  it("sprints faster than it walks", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    owned(state, "wall", p.x, p.y - 3);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    const walker = spawnEnemy(state, p.x, p.y + 10, { kind: "dwarfBomber" });

    run(state, 8);

    const moved = (e: Enemy, y: number) => Math.abs(e.x - p.x) + Math.abs(e.y - y);
    expect(bomber.mode).toBe("sprinting");
    expect(moved(bomber, p.y)).toBeCloseTo(2.5 * moved(walker, p.y + 10));
  });

  it("explodes next to its target, damaging the 3x3 around it and nothing else", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const target = sturdy(owned(state, "wall", p.x + 2, p.y));
    const inside = sturdy(owned(state, "wall", p.x + 1, p.y + 1));
    const outside = sturdy(owned(state, "wall", p.x + 3, p.y + 1));
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    const goblin = spawnEnemy(state, p.x, p.y - 1);
    const gold = goldOf(state);

    for (let i = 0; i < 40 && state.enemies.includes(bomber); i++) tick(state);

    expect(state.enemies).not.toContain(bomber);
    expect(target.hp).toBe(1000 - blast);
    expect(inside.hp).toBe(1000 - blast);
    expect(outside.hp).toBe(1000);
    expect(goblin.hp).toBe(goblin.maxHp);
    expect(goldOf(state)).toBe(gold);
    expect(state.cues.some((c) => c.kind === "explosion")).toBe(true);
    expect(state.effects.some((e) => e.kind === "splash")).toBe(true);
  });

  it("damages the keep once when it's inside the blast", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    sturdy(owned(state, "wall", keep.x - 1, keep.y + 1));
    spawnEnemy(state, keep.x - 1, keep.y, { kind: "dwarfBomber" });

    tick(state);

    expect(keep.hp).toBe(keep.maxHp - blast);
  });

  it("doesn't explode if killed on the way", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const wall = sturdy(owned(state, "wall", p.x, p.y + 3));
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    tick(state);
    expect(bomber.mode).toBe("sprinting");

    damageEnemy(bomber, bomber.hp, 1);
    run(state, 20);

    expect(wall.hp).toBe(1000);
    expect(state.cues.some((c) => c.kind === "explosion")).toBe(false);
  });

  it("ignores a target it can't reach within 6 tiles", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    for (let dx = -8; dx <= 8; dx++) placeStructure(state, "ruin", p.x + dx, p.y + 1);
    owned(state, "wall", p.x, p.y + 3);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });

    tick(state);

    expect(bomber.mode).toBe("walking");
  });
});
