// The view onto the map: where it looks and how far it's zoomed. Pure: no DOM.
import { TILE_SIZE } from "../render/palette";

/** The most zoomed in: tiles drawn at 3x their normal size. */
export const MAX_ZOOM = 3;

/**
 * The 3D view's camera angles. It looks at the map from `yaw` round from the south (towards
 * the east), `pitch` above the horizon. A pitch of 90° looks straight down. The default looks
 * from the south, 75° up: close to the flat map's look (north up, blocks' fronts facing you),
 * with a little depth. Isometric is a yaw of 45° and a pitch of asin(tan 30°).
 */
export const ISO = {
  yaw: 0,
  pitch: (75 * Math.PI) / 180,
  /** The lowest the camera tilts, so the ground never turns edge-on. */
  minPitch: (10 * Math.PI) / 180,
  /** Blocks stand this many times taller than the flat view's lift, so they read as solid. */
  heightScale: 2.5,
};

export interface Camera {
  /** Top-left of the view, in tiles (fractional). */
  x: number;
  y: number;
  /** Screen pixels per map pixel: 1 draws tiles at TILE_SIZE px. */
  zoom: number;
  /** The view's size in screen (CSS) pixels, and the map's size in tiles. */
  viewWidth: number;
  viewHeight: number;
  mapWidth: number;
  mapHeight: number;
  /**
   * Drawn isometric (the 3D renderer). The view still looks at the middle of the window (x, y)
   * would have in the flat view, so centring and the minimap work the same either way.
   */
  iso: boolean;
  /** The 3D view's angles, in radians (see ISO). */
  yaw: number;
  pitch: number;
}

export function createCamera(): Camera {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    viewWidth: 1,
    viewHeight: 1,
    mapWidth: 1,
    mapHeight: 1,
    iso: false,
    yaw: ISO.yaw,
    pitch: ISO.pitch,
  };
}

/** The map point (in tiles) in the middle of the view. */
export function viewCentre(cam: Camera): { x: number; y: number } {
  const size = tilePixels(cam);
  return { x: cam.x + cam.viewWidth / size / 2, y: cam.y + cam.viewHeight / size / 2 };
}

/**
 * A move on screen (in pixels) as a move over the iso map (in tiles): undo the tilt's squash,
 * then turn back by the yaw.
 */
function isoScreenToMap(cam: Camera, px: number, py: number): { x: number; y: number } {
  const size = tilePixels(cam);
  const across = px / size;
  const down = py / (size * Math.sin(cam.pitch));
  const cos = Math.cos(cam.yaw);
  const sin = Math.sin(cam.yaw);
  return { x: across * cos + down * sin, y: down * cos - across * sin };
}

/**
 * How far a point raised one tile shows from the ground point under it, as a move over the map:
 * it shows where the ground that much further from the camera does.
 */
export function isoRise(cam: Camera): { x: number; y: number } {
  const reach = 1 / Math.tan(cam.pitch);
  return { x: reach * Math.sin(cam.yaw), y: reach * Math.cos(cam.yaw) };
}

/** Called when the view or the map changes size. */
export function setViewport(
  cam: Camera,
  viewWidth: number,
  viewHeight: number,
  mapWidth: number,
  mapHeight: number,
): void {
  Object.assign(cam, { viewWidth, viewHeight, mapWidth, mapHeight });
  cam.zoom = clampZoom(cam, cam.zoom);
  clamp(cam);
}

/**
 * The furthest out the view zooms: just far enough that the map spans the view from its left
 * edge to its right, so there's never empty space beside it (above and below, a map shorter than
 * the view is centred).
 */
export function fitZoom(cam: Camera): number {
  // Iso, the map's turned: its corners left and right span its width and height, turned.
  const across = cam.iso
    ? cam.mapWidth * Math.abs(Math.cos(cam.yaw)) + cam.mapHeight * Math.abs(Math.sin(cam.yaw))
    : cam.mapWidth;
  return cam.viewWidth / (across * TILE_SIZE);
}

/** Size of one tile on screen, in pixels. */
export function tilePixels(cam: Camera): number {
  return TILE_SIZE * cam.zoom;
}

/** The map point (in tiles) under a screen point; iso, on the ground. */
export function screenToTile(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  if (cam.iso) {
    const centre = viewCentre(cam);
    const d = isoScreenToMap(cam, sx - cam.viewWidth / 2, sy - cam.viewHeight / 2);
    return { x: centre.x + d.x, y: centre.y + d.y };
  }
  return { x: cam.x + sx / tilePixels(cam), y: cam.y + sy / tilePixels(cam) };
}

/**
 * The screen point over a map point (in tiles): the inverse of screenToTile. Iso, `height` (in
 * tiles) lifts it off the ground.
 */
export function tileToScreen(
  cam: Camera,
  tx: number,
  ty: number,
  height = 0,
): { x: number; y: number } {
  const size = tilePixels(cam);
  if (cam.iso) {
    const centre = viewCentre(cam);
    const dx = tx - centre.x;
    const dy = ty - centre.y;
    const cos = Math.cos(cam.yaw);
    const sin = Math.sin(cam.yaw);
    const across = dx * cos - dy * sin;
    const down = dx * sin + dy * cos;
    return {
      x: cam.viewWidth / 2 + across * size,
      y: cam.viewHeight / 2 + (down * Math.sin(cam.pitch) - height * Math.cos(cam.pitch)) * size,
    };
  }
  return { x: (tx - cam.x) * size, y: (ty - cam.y) * size };
}

/** Moves the view by a distance on screen, in tiles' widths (iso, over the turned map). */
export function panBy(cam: Camera, dxTiles: number, dyTiles: number): void {
  const d = cam.iso
    ? isoScreenToMap(cam, dxTiles * tilePixels(cam), dyTiles * tilePixels(cam))
    : { x: dxTiles, y: dyTiles };
  cam.x += d.x;
  cam.y += d.y;
  clamp(cam);
}

/** Looks at a map point (in tiles), keeping the zoom within its limits first. */
export function centerOn(cam: Camera, tx: number, ty: number): void {
  cam.zoom = clampZoom(cam, cam.zoom);
  cam.x = tx - cam.viewWidth / tilePixels(cam) / 2;
  cam.y = ty - cam.viewHeight / tilePixels(cam) / 2;
  clamp(cam);
}

/** Zooms by `factor`, keeping the map point under screen point (sx, sy) where it is. */
export function zoomAt(cam: Camera, factor: number, sx: number, sy: number): void {
  const anchor = screenToTile(cam, sx, sy);
  const centre = viewCentre(cam);
  cam.zoom = clampZoom(cam, cam.zoom * factor);
  // Same middle at the new zoom, then shifted so the anchor's back under (sx, sy).
  centerOn(cam, centre.x, centre.y);
  const moved = screenToTile(cam, sx, sy);
  cam.x += anchor.x - moved.x;
  cam.y += anchor.y - moved.y;
  clamp(cam);
}

/** Zooms around the middle of the view. */
export function zoomBy(cam: Camera, factor: number): void {
  zoomAt(cam, factor, cam.viewWidth / 2, cam.viewHeight / 2);
}

/** Inclusive tile bounds. */
export interface VisibleTiles {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The tiles at least partly on screen, clamped to the map. */
export function visibleTiles(cam: Camera): VisibleTiles {
  if (cam.iso) {
    // The ground under the view's corners, and a little beyond for blocks standing into it.
    const corners = [
      screenToTile(cam, 0, 0),
      screenToTile(cam, cam.viewWidth, 0),
      screenToTile(cam, 0, cam.viewHeight + ISO_REACH_PX),
      screenToTile(cam, cam.viewWidth, cam.viewHeight + ISO_REACH_PX),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      x0: Math.max(0, Math.floor(Math.min(...xs))),
      y0: Math.max(0, Math.floor(Math.min(...ys))),
      x1: Math.min(cam.mapWidth - 1, Math.ceil(Math.max(...xs))),
      y1: Math.min(cam.mapHeight - 1, Math.ceil(Math.max(...ys))),
    };
  }
  const across = cam.viewWidth / tilePixels(cam);
  const down = cam.viewHeight / tilePixels(cam);
  return {
    x0: Math.max(0, Math.floor(cam.x)),
    y0: Math.max(0, Math.floor(cam.y)),
    x1: Math.min(cam.mapWidth - 1, Math.ceil(cam.x + across) - 1),
    y1: Math.min(cam.mapHeight - 1, Math.ceil(cam.y + down) - 1),
  };
}

function clampZoom(cam: Camera, zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(fitZoom(cam), zoom));
}

/** Below the view's bottom edge, how far blocks can stand up into it, in screen pixels. */
const ISO_REACH_PX = 200;

/**
 * Keeps the view on the map; a map narrower (or shorter) than the view is centred. Iso, the
 * middle of the view stays over the map.
 */
function clamp(cam: Camera): void {
  if (cam.iso) {
    const centre = viewCentre(cam);
    cam.x += clampTo(centre.x, 0, cam.mapWidth) - centre.x;
    cam.y += clampTo(centre.y, 0, cam.mapHeight) - centre.y;
    return;
  }
  const across = cam.viewWidth / tilePixels(cam);
  const down = cam.viewHeight / tilePixels(cam);
  cam.x =
    across >= cam.mapWidth ? (cam.mapWidth - across) / 2 : clampTo(cam.x, 0, cam.mapWidth - across);
  cam.y =
    down >= cam.mapHeight ? (cam.mapHeight - down) / 2 : clampTo(cam.y, 0, cam.mapHeight - down);
}

function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
