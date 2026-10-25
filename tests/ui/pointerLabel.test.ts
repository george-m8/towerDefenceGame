import { describe, expect, it } from "vitest";
import { BUILD_TIME, STRUCTURES } from "../../src/sim/config";
import { createGame } from "../../src/sim/game";
import { labelAnchor, pointerTags } from "../../src/ui/pointerLabel";
import { placeStructure } from "../../src/sim/grid";
import { TILE_SIZE } from "../../src/render/palette";
import { createUiState } from "../../src/ui/state";
import { buildAt, ring } from "../sim/helpers";

function setup() {
  const state = createGame(1, { blankMap: true, fog: false });
  const ui = createUiState();
  return { state, ui, keep: state.keeps[0] };
}

describe("pointerTags", () => {
  it("shows nothing unless a build tool is over the map", () => {
    const { state, ui, keep } = setup();
    ui.hover = { x: keep.x - 1, y: keep.y };
    expect(pointerTags(state, ui)).toBeNull();
    ui.tool = "sell";
    expect(pointerTags(state, ui)).toBeNull();
    ui.tool = "wall";
    ui.hover = null;
    expect(pointerTags(state, ui)).toBeNull();
  });

  it("shows the cost and the build time on the tile under the pointer", () => {
    const { state, ui, keep } = setup();
    ui.tool = "cannon";
    ui.hover = { x: keep.x - BUILD_TIME.fullDistance, y: keep.y };
    expect(pointerTags(state, ui)).toEqual({
      cost: `${STRUCTURES.cannon.cost}g`,
      short: false,
      time: `${BUILD_TIME.maxSeconds.toFixed(1)}s`,
    });
  });

  it("shows the discounted price, without the discount spelled out", () => {
    const { state, ui, keep } = setup();
    buildAt(state, ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1));
    ui.tool = "wall";
    ui.hover = { x: keep.x - 1, y: keep.y - 1 };
    expect(pointerTags(state, ui)?.cost).toBe("3g");
  });

  it("marks a cost you can't afford", () => {
    const { state, ui, keep } = setup();
    ui.tool = "catapult";
    ui.hover = { x: keep.x - 5, y: keep.y };
    state.players[1].gold = STRUCTURES.catapult.cost - 1;
    expect(pointerTags(state, ui)?.short).toBe(true);
  });
});

describe("labelAnchor", () => {
  it("is the middle of the hovered tile's top edge, through the camera", () => {
    const { state, ui } = setup();
    ui.camera.x = 10;
    ui.camera.y = 20;
    ui.camera.zoom = 2;
    ui.hover = { x: 13, y: 25 };
    expect(labelAnchor(state, ui)).toEqual({ x: 3.5 * TILE_SIZE * 2, y: 5 * TILE_SIZE * 2 });
  });

  it("rises with a raised block, as the ghost on it does", () => {
    const { state, ui } = setup();
    ui.hover = { x: 13, y: 25 };
    const flat = labelAnchor(state, ui)!;
    placeStructure(state, "wall", 13, 25);
    expect(labelAnchor(state, ui)!.y).toBeLessThan(flat.y);
  });

  it("is nowhere off the map", () => {
    const { state, ui } = setup();
    expect(labelAnchor(state, ui)).toBeNull();
  });
});
