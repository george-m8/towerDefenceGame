import { describe, expect, it } from "vitest";
import {
  fromView,
  toView,
  turnFacing,
  turnView,
  viewOf,
  type Rotation,
} from "../../src/render/rotation";
import { spawnEnemy } from "../../src/sim/enemies";
import { baseAt, isKeepTile, placeStructure, terrainAt } from "../../src/sim/grid";
import { setViewport, tilePixels } from "../../src/ui/camera";
import { createUiState } from "../../src/ui/state";
import { createGameWithoutWaves, paintTerrain } from "../sim/helpers";

const TURNS: Rotation[] = [0, 1, 2, 3];

describe("turning the view", () => {
  it.each(TURNS)("turn %i: fromView undoes toView on every corner of a 5 x 3 map", (turns) => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 2 },
      { x: 4, y: 2 },
      { x: 2.5, y: 1.25 },
    ]) {
      expect(fromView(toView(p, turns, 5, 3), turns, 5, 3)).toEqual(p);
    }
  });

  it("a quarter turn clockwise puts the top-left in the top-right, and north faces east", () => {
    expect(toView({ x: 0, y: 0 }, 1, 5, 3)).toEqual({ x: 2, y: 0 });
    expect(turnFacing("N", 1)).toBe("E");
    expect(turnFacing("W", 2)).toBe("E");
  });

  it.each(TURNS)("turn %i: the copy has everything where the turn puts it", (turns) => {
    const state = createGameWithoutWaves();
    paintTerrain(state, [{ x: 3, y: 4 }], "rock");
    const wall = placeStructure(state, "archer", 6, 2, "N");
    spawnEnemy(state, 8.5, 9);
    const view = viewOf(state, turns);
    const at = (x: number, y: number) => toView({ x, y }, turns, state.width, state.height);
    expect(terrainAt(view, at(3, 4).x, at(3, 4).y)).toBe("rock");
    const archer = Object.values(view.structures).find((s) => s.id === wall.id)!;
    expect({ x: archer.x, y: archer.y }).toEqual(at(6, 2));
    expect(archer.facing).toBe(turnFacing("N", turns));
    expect({ x: view.enemies[0].x, y: view.enemies[0].y }).toEqual(at(8.5, 9));
    expect(baseAt(view, at(6, 2).x, at(6, 2).y)).toBeUndefined(); // a tower, on the mount layer
    // Every keep tile is still a keep tile, and the keep is still a square in the view.
    const keep = state.keeps[0];
    for (let y = keep.y; y < keep.y + keep.size; y++) {
      for (let x = keep.x; x < keep.x + keep.size; x++) {
        expect(isKeepTile(view, at(x, y).x, at(x, y).y)).toBe(true);
      }
    }
    const vk = view.keeps[0];
    expect(isKeepTile(view, vk.x, vk.y)).toBe(true);
    expect(isKeepTile(view, vk.x + vk.size - 1, vk.y + vk.size - 1)).toBe(true);
    expect(state.structures[wall.id].x).toBe(6); // the game itself never turns
  });

  it("keeps the same map spot in the middle of the screen when flipped (or turned)", () => {
    const state = createGameWithoutWaves();
    const ui = createUiState();
    setViewport(ui.camera, 640, 320, state.width, state.height);
    const middle = () => ({
      x: ui.camera.x + ui.camera.viewWidth / tilePixels(ui.camera) / 2,
      y: ui.camera.y + ui.camera.viewHeight / tilePixels(ui.camera) / 2,
    });
    ui.camera.x = 20;
    ui.camera.y = 15;
    const before = middle();
    turnView(ui, state, 2);
    // The middle of the screen is still the same map spot, now seen flipped.
    const turned = toView({ x: before.x - 0.5, y: before.y - 0.5 }, 2, state.width, state.height);
    expect(middle().x).toBeCloseTo(turned.x + 0.5);
    expect(middle().y).toBeCloseTo(turned.y + 0.5);
    turnView(ui, state, 2);
    expect(ui.rotation).toBe(0);
    for (const by of [1, 3, 1, 1, 1, 1] as const) turnView(ui, state, by);
    expect(ui.rotation).toBe(0);
    expect(middle().x).toBeCloseTo(before.x);
    expect(middle().y).toBeCloseTo(before.y);
  });
});
