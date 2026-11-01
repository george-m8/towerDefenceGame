import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../../src/sim/game";
import { COLOURS, FOG, STRUCTURE_COLOURS, TERRAIN_STYLES } from "../../src/render/palette";
import { fogged, fullMapScale, minimapColour } from "../../src/ui/minimap";
import { IN_SIGHT, SEEN, UNEXPLORED } from "../../src/sim/fog";
import { paintTerrain } from "../sim/helpers";

describe("minimapColour", () => {
  it("shows the keep, structures, the spawn and terrain in their map colours", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    applyCommand(state, 1, { type: "build", kind: "wall", x: 30, y: 5 });
    paintTerrain(state, [{ x: 31, y: 5 }], "river");
    const spawn = state.spawnTiles[0];
    expect(minimapColour(state, state.keeps[0].x, state.keeps[0].y)).toBe(COLOURS.keep);
    expect(minimapColour(state, 30, 5)).toBe(STRUCTURE_COLOURS.wall.bg);
    expect(minimapColour(state, 31, 5)).toBe(TERRAIN_STYLES.river.bg);
    expect(minimapColour(state, spawn.x, spawn.y)).toBe(COLOURS.spawn);
    expect(minimapColour(state, 40, 40)).toBe(COLOURS.ground);
  });

  it("only uses #rrggbb colours, which the minimap image needs", () => {
    const state = createGame(5);
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        expect(minimapColour(state, x, y)).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe("fogged", () => {
  it("mists unexplored land heavily, seen land lightly, and leaves land in sight alone", () => {
    const mist = (opacity: number) => {
      const c = Math.round(0x80 * (1 - opacity) + 0xff * opacity).toString(16); // FOG.colour is white
      return `#${c}${c}${c}`;
    };
    expect(fogged("#808080", UNEXPLORED)).toBe(mist(FOG.unexplored.opacity));
    expect(fogged("#808080", SEEN)).toBe(mist(FOG.seen.opacity));
    expect(fogged("#808080", IN_SIGHT)).toBe("#808080");
  });
});

describe("fullMapScale", () => {
  it("is the largest whole number of pixels per tile that fits", () => {
    expect(fullMapScale(42, 28, 1280, 800)).toBe(28); // 1280 / 42 = 30.4, 800 / 28 = 28.6
    expect(fullMapScale(100, 50, 1000, 1000)).toBe(10);
  });

  it("is never below one pixel per tile", () => {
    expect(fullMapScale(400, 300, 200, 100)).toBe(1);
  });
});
