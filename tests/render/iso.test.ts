import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createCamera,
  panBy,
  screenToTile,
  setViewport,
  tileToScreen,
  viewCentre,
  zoomAt,
} from "../../src/ui/camera";
import { placeCamera } from "../../src/render/three";
import { createUiState } from "../../src/ui/state";

function isoCamera() {
  const cam = createCamera();
  cam.iso = true;
  setViewport(cam, 1200, 800, 60, 40);
  cam.zoom = 1.5;
  panBy(cam, 0, 0);
  return cam;
}

describe("the iso camera", () => {
  it("screenToTile undoes tileToScreen", () => {
    const cam = isoCamera();
    for (const p of [
      { x: 10, y: 5 },
      { x: 33.5, y: 21.25 },
    ]) {
      const s = tileToScreen(cam, p.x, p.y);
      const back = screenToTile(cam, s.x, s.y);
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
  });

  it("draws a tile as a diamond: east goes right and down, south goes left and down", () => {
    const cam = isoCamera();
    const c = viewCentre(cam);
    const at = tileToScreen(cam, c.x, c.y);
    const east = tileToScreen(cam, c.x + 1, c.y);
    const south = tileToScreen(cam, c.x, c.y + 1);
    expect(east.x).toBeGreaterThan(at.x);
    expect(east.y).toBeGreaterThan(at.y);
    expect(south.x).toBeLessThan(at.x);
    expect(south.y).toBeGreaterThan(at.y);
  });

  it("zooming keeps the point under the pointer", () => {
    const cam = isoCamera();
    const before = screenToTile(cam, 300, 200);
    zoomAt(cam, 1.3, 300, 200);
    const after = screenToTile(cam, 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("pans in screen directions: right moves the view right", () => {
    const cam = isoCamera();
    const tile = { x: viewCentre(cam).x, y: viewCentre(cam).y };
    const before = tileToScreen(cam, tile.x, tile.y);
    panBy(cam, 2, 0);
    const after = tileToScreen(cam, tile.x, tile.y);
    expect(after.x).toBeLessThan(before.x); // the map moves left under a view moving right
    expect(after.y).toBeCloseTo(before.y);
  });

  it("the 3D camera puts map points where tileToScreen says, raised ones too", () => {
    const ui = createUiState();
    ui.camera = isoCamera();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    placeCamera(camera, ui);
    camera.updateMatrixWorld();
    const { viewWidth, viewHeight } = ui.camera;
    for (const [x, y, h] of [
      [12, 9, 0],
      [40, 30, 0],
      [25, 18, 1.5],
    ]) {
      const ndc = new THREE.Vector3(x, h, y).project(camera);
      const want = tileToScreen(ui.camera, x, y, h);
      expect(((ndc.x + 1) / 2) * viewWidth).toBeCloseTo(want.x, 3);
      expect(((1 - ndc.y) / 2) * viewHeight).toBeCloseTo(want.y, 3);
    }
  });
});
