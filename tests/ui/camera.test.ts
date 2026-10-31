import { describe, expect, it } from "vitest";
import { TILE_SIZE } from "../../src/render/palette";
import {
  MAX_ZOOM,
  centerOn,
  createCamera,
  fitZoom,
  panBy,
  screenToTile,
  setViewport,
  visibleTiles,
  zoomAt,
  zoomBy,
} from "../../src/ui/camera";

/** A 100x50-tile map seen through an 800x400 px view. */
function camera() {
  const cam = createCamera();
  setViewport(cam, 800, 400, 100, 50);
  return cam;
}

describe("camera", () => {
  it("zooms out only until the map spans the view from side to side", () => {
    const cam = camera();
    expect(fitZoom(cam)).toBe(800 / (100 * TILE_SIZE));
    zoomBy(cam, 0.0001);
    expect(cam.zoom).toBe(fitZoom(cam));
    // A view much wider than the map is high: still edge to edge, scrolling up and down.
    setViewport(cam, 1600, 300, 100, 50);
    expect(cam.zoom).toBe(1600 / (100 * TILE_SIZE));
    expect(visibleTiles(cam)).toMatchObject({ x0: 0, x1: 99 });
    // Asking for a zoom too far out (a new game's 1) is held to the limit, centred as asked.
    cam.zoom = 0.1;
    centerOn(cam, 50, 25);
    expect(cam.zoom).toBe(fitZoom(cam));
    expect(screenToTile(cam, 800, 150).y).toBeCloseTo(25);
    zoomBy(cam, 1000);
    expect(cam.zoom).toBe(MAX_ZOOM);
  });

  it("converts screen points to tiles through the view", () => {
    const cam = camera();
    cam.zoom = 1;
    centerOn(cam, 50, 25);
    // The middle of the screen is the middle of tile (50, 25)'s neighbourhood.
    const mid = screenToTile(cam, 400, 200);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(25);
    const right = screenToTile(cam, 400 + TILE_SIZE, 200);
    expect(right.x).toBeCloseTo(51);
  });

  it("keeps the tile under the cursor fixed while zooming", () => {
    const cam = camera();
    cam.zoom = 1;
    centerOn(cam, 50, 25);
    const before = screenToTile(cam, 600, 100);
    zoomAt(cam, 1.5, 600, 100);
    const after = screenToTile(cam, 600, 100);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("never shows past the map's edges", () => {
    const cam = camera();
    cam.zoom = 1;
    panBy(cam, -1000, -1000);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
    panBy(cam, 1000, 1000);
    expect(cam.x).toBe(100 - 800 / TILE_SIZE);
    expect(cam.y).toBe(50 - 400 / TILE_SIZE);
  });

  it("centres a map that's smaller than the view", () => {
    const cam = createCamera();
    setViewport(cam, 800, 800, 100, 50);
    zoomBy(cam, 0.0001); // fit: the map's width fills the view, its height doesn't
    expect(cam.x).toBeCloseTo(0);
    expect(cam.y).toBeLessThan(0); // centred vertically
  });

  it("lists only the tiles on screen, clamped to the map", () => {
    const cam = camera();
    cam.zoom = 1;
    centerOn(cam, 50, 25);
    const v = visibleTiles(cam);
    expect(v.x1 - v.x0).toBeLessThanOrEqual(800 / TILE_SIZE + 1);
    expect(v.y1 - v.y0).toBeLessThanOrEqual(400 / TILE_SIZE + 1);
    expect(v.x0).toBeGreaterThanOrEqual(0);
    expect(v.x1).toBeLessThanOrEqual(99);
  });
});
