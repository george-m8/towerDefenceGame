import { describe, expect, it } from "vitest";
import { createGame } from "../../src/sim/game";
import { createCamera, setViewport, tilePixels, viewCentre } from "../../src/ui/camera";
import { FOLLOW_AT, createKingFollow, followTarget, moveWithWorld } from "../../src/ui/lavaCamera";
import { toView, viewSize, type Rotation } from "../../src/render/rotation";

/** A No looking back game, its camera showing 30 by 20 tiles, turned `turns` quarter turns. */
function setup(turns: Rotation = 0) {
  const state = createGame(3, { mode: "flood", blankMap: true });
  const view = viewSize(state.width, state.height, turns);
  const cam = createCamera();
  setViewport(cam, 30 * 20, 20 * 20, view.width, view.height);
  return { state, cam };
}

const across = (cam: ReturnType<typeof createCamera>) => cam.viewWidth / tilePixels(cam);

describe("No looking back's camera", () => {
  it("moves with the world, so what's on screen stays put", () => {
    for (const turns of [0, 1, 2, 3] as Rotation[]) {
      const { state, cam } = setup(turns);
      const before = { x: 40, y: 30 };
      // Where map tile (50, 40) is on screen, before and after the world moves on 3 columns.
      cam.x = before.x;
      cam.y = before.y;
      const tile = toView({ x: 50, y: 40 }, turns, state.width, state.height);
      const onScreen = { x: tile.x - cam.x, y: tile.y - cam.y };
      moveWithWorld(cam, 3, state.width, state.height, turns);
      const moved = toView({ x: 47, y: 40 }, turns, state.width, state.height);
      expect({ x: moved.x - cam.x, y: moved.y - cam.y }).toEqual(onScreen);
    }
  });

  it("is left alone until the world moves on, then glides to put the king ahead of the lava", () => {
    const { state, cam } = setup();
    state.flood!.king = { x: 80, y: 30 };
    cam.x = 10;
    cam.y = 20;
    const follow = createKingFollow();
    follow.frame(cam, state.flood!, state.width, state.height, 0, 0.1);
    expect(cam.x).toBe(10); // nothing pushes it
    follow.worldMoved(cam);
    for (let i = 0; i < 300; i++)
      follow.frame(cam, state.flood!, state.width, state.height, 0, 1 / 60);
    const target = followTarget(cam, state.flood!, state.width, state.height, 0);
    expect(viewCentre(cam).x).toBeCloseTo(target.x, 1);
    expect(80.5 - cam.x).toBeCloseTo(FOLLOW_AT * across(cam), 1);
  });

  it("stops gliding when you pan", () => {
    const { state, cam } = setup();
    state.flood!.king = { x: 80, y: 30 };
    cam.x = 10;
    const follow = createKingFollow();
    follow.worldMoved(cam);
    follow.frame(cam, state.flood!, state.width, state.height, 0, 1 / 60);
    cam.x = 5; // panned
    follow.frame(cam, state.flood!, state.width, state.height, 0, 1 / 60);
    follow.frame(cam, state.flood!, state.width, state.height, 0, 1 / 60);
    expect(cam.x).toBe(5);
  });
});
