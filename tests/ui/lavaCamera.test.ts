import { describe, expect, it } from "vitest";
import { createGame } from "../../src/sim/game";
import { centerOn, createCamera, setViewport, tilePixels } from "../../src/ui/camera";
import { LAVA_SHOWN, MARGIN, followActiveArea } from "../../src/ui/lavaCamera";
import { fromView, toView, viewSize, type Rotation } from "../../src/render/rotation";
import type { GameState } from "../../src/sim/types";

/** A No looking back game, its camera showing 30 by 20 tiles, turned `turns` quarter turns. */
function setup(turns: Rotation = 0) {
  const state = createGame(3, { mode: "flood", blankMap: true });
  const view = viewSize(state.width, state.height, turns);
  const cam = createCamera();
  setViewport(cam, 30 * 20, 20 * 20, view.width, view.height);
  return { state, cam };
}

const span = (cam: ReturnType<typeof createCamera>) => ({
  x: cam.viewWidth / tilePixels(cam),
  y: cam.viewHeight / tilePixels(cam),
});

function follow(state: GameState, cam: ReturnType<typeof createCamera>, turns: Rotation = 0) {
  followActiveArea(cam, state.flood!, state.width, state.height, turns);
}

describe("No looking back's camera", () => {
  it("is pushed on by the lava, showing only a little of it", () => {
    const { state, cam } = setup();
    state.flood!.king = { x: 60, y: 30 };
    state.flood!.front = 40;
    cam.x = 0;
    cam.y = 20;
    follow(state, cam);
    expect(cam.x).toBe(40 - LAVA_SHOWN);
  });

  it("leaves looking ahead alone", () => {
    const { state, cam } = setup();
    state.flood!.king = { x: 60, y: 30 };
    state.flood!.front = 40;
    cam.x = 50;
    cam.y = 20;
    follow(state, cam);
    expect(cam.x).toBe(50);
  });

  it("keeps the king in view, a few tiles in from its edge", () => {
    const { state, cam } = setup();
    state.flood!.king = { x: 100, y: 60 };
    cam.x = 10;
    cam.y = 5;
    follow(state, cam);
    expect(cam.x + span(cam).x).toBe(101 + MARGIN);
    expect(cam.y + span(cam).y).toBe(61 + MARGIN);
  });

  it("holds the lava back, and keeps the king in view, whichever way the view is turned", () => {
    for (const turns of [0, 1, 2, 3] as Rotation[]) {
      const { state, cam } = setup(turns);
      state.flood!.king = { x: 58, y: 50 };
      state.flood!.front = 50;
      // Looking at the lava, back at the map's left edge.
      const lava = toView({ x: 0, y: 50 }, turns, state.width, state.height);
      centerOn(cam, lava.x, lava.y);
      follow(state, cam, turns);
      // The map columns of the tiles at the view's corners: none deeper into the lava than shown.
      const { x, y } = span(cam);
      const corners = [
        { x: cam.x, y: cam.y },
        { x: cam.x + x - 1e-6, y: cam.y },
        { x: cam.x, y: cam.y + y - 1e-6 },
        { x: cam.x + x - 1e-6, y: cam.y + y - 1e-6 },
      ].map((p) =>
        fromView({ x: Math.floor(p.x), y: Math.floor(p.y) }, turns, state.width, state.height),
      );
      expect(Math.min(...corners.map((p) => p.x))).toBe(50 - LAVA_SHOWN);
      const king = toView(state.flood!.king, turns, state.width, state.height);
      expect(king.x).toBeGreaterThanOrEqual(cam.x);
      expect(king.x + 1).toBeLessThanOrEqual(cam.x + x);
      expect(king.y).toBeGreaterThanOrEqual(cam.y);
      expect(king.y + 1).toBeLessThanOrEqual(cam.y + y);
    }
  });
});
