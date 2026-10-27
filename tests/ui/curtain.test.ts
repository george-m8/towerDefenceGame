import { describe, expect, it } from "vitest";
import { CLOSE_MS, OPEN_MS, curtainAt, curtainTier, openRadius } from "../../src/ui/curtain";
import { createCamera, setViewport } from "../../src/ui/camera";
import { IN_SIGHT, SEEN, UNEXPLORED } from "../../src/sim/fog";

/** A camera 800x600 px onto a 100x100 map, at zoom 1 (20 px tiles: 40x30 tiles in view). */
function camera() {
  const cam = createCamera();
  setViewport(cam, 800, 600, 100, 100);
  cam.x = 10;
  cam.y = 20;
  return cam;
}

describe("curtainAt", () => {
  const then = () => {};

  it("closes from past the screen's corners to nothing, centred on the view", () => {
    const cam = camera();
    const start = curtainAt({ phase: "closing", started: 0, then }, 0, cam);
    expect(start.curtain).toEqual({ x: 30, y: 35, radius: openRadius(cam) });
    expect(openRadius(cam)).toBeGreaterThan(25); // half the view's diagonal
    expect(start.done).toBe(false);
    const middle = curtainAt({ phase: "closing", started: 0, then }, CLOSE_MS / 2, cam);
    expect(middle.curtain.radius).toBeCloseTo(openRadius(cam) / 2);
    const end = curtainAt({ phase: "closing", started: 0, then }, CLOSE_MS, cam);
    expect(end).toEqual({ curtain: { x: 30, y: 35, radius: 0 }, done: true });
  });

  it("stays shut while covered, then opens all the way", () => {
    const cam = camera();
    expect(curtainAt({ phase: "covered" }, 5000, cam)).toEqual({
      curtain: { x: 30, y: 35, radius: 0 },
      done: false,
    });
    expect(curtainAt({ phase: "opening", started: 100 }, 100, cam).curtain.radius).toBe(0);
    const end = curtainAt({ phase: "opening", started: 100 }, 100 + OPEN_MS, cam);
    expect(end).toEqual({ curtain: { x: 30, y: 35, radius: openRadius(cam) }, done: true });
  });
});

describe("curtainTier", () => {
  it("fogs everything outside the circle and keeps the game's sight inside", () => {
    // 5x1: seen, in sight, in sight, unexplored, in sight; a circle round the middle tile.
    const tier = Uint8Array.from([SEEN, IN_SIGHT, IN_SIGHT, UNEXPLORED, IN_SIGHT]);
    const drawn = curtainTier(tier, 5, 1, { x: 2.5, y: 0.5, radius: 1 });
    expect([...drawn]).toEqual([UNEXPLORED, IN_SIGHT, IN_SIGHT, UNEXPLORED, UNEXPLORED]);
    expect([...tier]).toEqual([SEEN, IN_SIGHT, IN_SIGHT, UNEXPLORED, IN_SIGHT]); // untouched
  });
});
