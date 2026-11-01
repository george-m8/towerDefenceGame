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
import { placeCamera, blockTiles } from "../../src/render/three";
import { pickIsoTile } from "../../src/render/canvas";
import { createGame } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { createUiState } from "../../src/ui/state";

/** An iso camera at the isometric angles: from the south-east, asin(tan 30°) up. */
function isoCamera() {
  const cam = createCamera();
  cam.iso = true;
  cam.yaw = Math.PI / 4;
  cam.pitch = Math.asin(Math.tan(Math.PI / 6));
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

describe("picking over the 3D view", () => {
  function wallGame() {
    const state = createGame(1, { blankMap: true, fog: false });
    const keep = state.keeps[0];
    const wall = { x: keep.x - 6, y: keep.y + 1 };
    placeStructure(state, "wall", wall.x, wall.y, "N", 1);
    return { state, wall };
  }

  /** The tile picked for what's drawn at (x, y) raised h, as the pointer would find it. */
  function pickAt(state: ReturnType<typeof createGame>, x: number, y: number, h: number) {
    const cam = isoCamera();
    setViewport(cam, 1200, 800, state.width, state.height);
    const s = tileToScreen(cam, x, y, h);
    const ground = screenToTile(cam, s.x, s.y);
    return pickIsoTile(state, cam, ground.x, ground.y);
  }

  it("a block's top picks the block, not the ground behind it", () => {
    const { state, wall } = wallGame();
    const top = blockTiles(state, wall.x, wall.y);
    expect(top).toBeGreaterThan(0);
    expect(pickAt(state, wall.x + 0.5, wall.y + 0.5, top)).toEqual(wall);
  });

  it("a block's front face picks the block", () => {
    const { state, wall } = wallGame();
    const half = blockTiles(state, wall.x, wall.y) / 2;
    expect(pickAt(state, wall.x + 0.5, wall.y + 0.99, half)).toEqual(wall);
    expect(pickAt(state, wall.x + 0.99, wall.y + 0.5, half)).toEqual(wall);
  });

  it("open ground picks the tile under the pointer", () => {
    const { state, wall } = wallGame();
    const open = { x: wall.x - 3, y: wall.y - 3 };
    expect(pickAt(state, open.x + 0.5, open.y + 0.5, 0)).toEqual(open);
  });
});

describe("any camera angle", () => {
  const ANGLES: [number, number][] = [
    [0, 90], // straight down: the flat map's look
    [0, 30],
    [-120, 55],
    [170, 15],
  ].map(([yaw, pitch]) => [(yaw * Math.PI) / 180, (pitch * Math.PI) / 180]);

  it.each(ANGLES)("yaw %f, pitch %f: clicks, the WebGL camera and picking agree", (yaw, pitch) => {
    const ui = createUiState();
    ui.camera = isoCamera();
    Object.assign(ui.camera, { yaw, pitch });
    const s0 = tileToScreen(ui.camera, 20, 15);
    const back = screenToTile(ui.camera, s0.x, s0.y);
    expect(back.x).toBeCloseTo(20);
    expect(back.y).toBeCloseTo(15);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    placeCamera(camera, ui);
    camera.updateMatrixWorld();
    const { viewWidth, viewHeight } = ui.camera;
    for (const [x, y, h] of [
      [12, 9, 0],
      [25, 18, 1.5],
    ]) {
      const ndc = new THREE.Vector3(x, h, y).project(camera);
      const want = tileToScreen(ui.camera, x, y, h);
      expect(((ndc.x + 1) / 2) * viewWidth).toBeCloseTo(want.x, 3);
      expect(((1 - ndc.y) / 2) * viewHeight).toBeCloseTo(want.y, 3);
    }

    const state = createGame(1, { blankMap: true, fog: false });
    const wall = { x: state.keeps[0].x - 6, y: state.keeps[0].y + 1 };
    placeStructure(state, "wall", wall.x, wall.y, "N", 1);
    setViewport(ui.camera, 1200, 800, state.width, state.height);
    const top = tileToScreen(
      ui.camera,
      wall.x + 0.5,
      wall.y + 0.5,
      blockTiles(state, wall.x, wall.y),
    );
    const ground = screenToTile(ui.camera, top.x, top.y);
    expect(pickIsoTile(state, ui.camera, ground.x, ground.y)).toEqual(wall);
  });

  it("straight down, a height doesn't move a point on screen", () => {
    const cam = isoCamera();
    Object.assign(cam, { yaw: 0, pitch: Math.PI / 2 });
    const ground = tileToScreen(cam, 10, 10);
    const raised = tileToScreen(cam, 10, 10, 2);
    expect(raised.x).toBeCloseTo(ground.x);
    expect(raised.y).toBeCloseTo(ground.y);
  });
});

describe("the default angles", () => {
  it("look from the south, 75° up, so north stays up as on the flat map", () => {
    const cam = createCamera();
    cam.iso = true;
    setViewport(cam, 1200, 800, 60, 40);
    expect(cam.yaw).toBe(0);
    expect((cam.pitch * 180) / Math.PI).toBeCloseTo(75);
    const at = tileToScreen(cam, 20, 20);
    const east = tileToScreen(cam, 21, 20);
    const south = tileToScreen(cam, 20, 21);
    expect(east.y).toBeCloseTo(at.y); // east is straight right
    expect(south.x).toBeCloseTo(at.x); // south is straight down
  });
});
