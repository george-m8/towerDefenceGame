import { describe, expect, it } from "vitest";
import { spawnEnemy } from "../../src/sim/enemies";
import { createGame } from "../../src/sim/game";
import type { Enemy } from "../../src/sim/types";
import { describeTile, hoverText, priceLine } from "../../src/ui/tileInfo";
import { createUiState } from "../../src/ui/state";
import { buildAt, ring } from "../sim/helpers";

function walledGame() {
  const state = createGame(1, { blankMap: true, fog: false });
  const keep = state.keeps[0];
  buildAt(state, ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1));
  buildAt(state, ring(10, 5, 14, 9));
  return state;
}

describe("enclosure hover info", () => {
  it("names the enclosure and its discount, inside and on the walls", () => {
    const state = walledGame();
    const keep = state.keeps[0];
    expect(describeTile(state, { x: keep.x - 1, y: keep.y - 1 })).toContain(
      "Inside the keep's walls: builds 50% off",
    );
    expect(describeTile(state, { x: 12, y: 7 })).toContain("Enclosed: builds 25% off");
    expect(describeTile(state, { x: 10, y: 5 })).toContain("Enclosed: builds 25% off"); // a wall
    expect(describeTile(state, { x: 30, y: 30 }).join("\n")).not.toContain("off");
  });
});

describe("priceLine", () => {
  it("shows the discounted price, or the full price outside", () => {
    const state = walledGame();
    const keep = state.keeps[0];
    expect(priceLine(state, "wall", { x: keep.x - 1, y: keep.y - 1 })).toBe(
      "Wall here: 3g (50% off)",
    );
    expect(priceLine(state, "archer", { x: 12, y: 7 })).toBe("Archer here: 19g (25% off)");
    expect(priceLine(state, "wall", { x: 30, y: 30 })).toBe("Wall here: 5g");
  });
});

describe("fog hover info", () => {
  it("says Unexplored, and hides enemies on land out of sight", () => {
    const state = createGame(1, { blankMap: true });
    const keep = state.keeps[0];
    expect(describeTile(state, { x: 0, y: 0 })).toEqual(["Unexplored"]);
    const seen = { x: keep.x + keep.size + 15, y: keep.y };
    state.enemies.push({ ...enemyAt(seen.x, seen.y) });
    const lines = describeTile(state, seen);
    expect(lines).toContain("Out of sight: enemies here aren't shown");
    expect(lines.join("\n")).not.toContain("Goblin");
    const near = { x: keep.x + keep.size + 1, y: keep.y };
    state.enemies.push({ ...enemyAt(near.x, near.y) });
    expect(describeTile(state, near).join("\n")).toContain("Goblin grunt, HP 20 / 20");
  });

  it("names an enemy's kind and variant, or just the kind when it has one variant", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const brute = spawnEnemy(state, 5, 5, { kind: "goblin", variant: 2 });
    brute.hp = 17.2;
    spawnEnemy(state, 6, 5, { kind: "zerg" });
    expect(describeTile(state, { x: 5, y: 5 })).toContain(`Goblin brute, HP 18 / ${brute.maxHp}`);
    expect(describeTile(state, { x: 6, y: 5 })).toContain("Zerg, HP 6 / 6");
  });

  it("the price line says why you can't build on unexplored land", () => {
    const state = createGame(1, { blankMap: true });
    expect(priceLine(state, "wall", { x: 0, y: 0 })).toBe("Wall: can't build on unexplored land");
  });
});

function enemyAt(x: number, y: number): Enemy {
  return {
    id: 1,
    x,
    y,
    tx: x,
    ty: y,
    px: x,
    py: y,
    hp: 20,
    maxHp: 20,
    bounty: 1,
    killedBy: null,
    kind: "goblin",
    variant: 0,
    speed: 1.5,
    damage: 5,
    attackInterval: 20,
    attackCooldown: 0,
  };
}

describe("hoverText", () => {
  it("is empty off the map, the tile's details on it, with the selected tool's price first", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const ui = createUiState();
    expect(hoverText(state, ui)).toBe("");
    ui.hover = { x: 30, y: 30 };
    expect(hoverText(state, ui)).toBe("Open ground");
    ui.tool = "wall";
    expect(hoverText(state, ui)).toBe("Wall here: 5g\nOpen ground");
  });
});
