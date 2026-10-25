// The view onto the map: where it looks and how far it's zoomed. Pure: no DOM.
import { TILE_SIZE } from "../render/palette";

/** The most zoomed in: tiles drawn at 3x their normal size. */
export const MAX_ZOOM = 3;

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
}

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1, viewWidth: 1, viewHeight: 1, mapWidth: 1, mapHeight: 1 };
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

/** The zoom that shows the whole map. */
export function fitZoom(cam: Camera): number {
  return Math.min(
    cam.viewWidth / (cam.mapWidth * TILE_SIZE),
    cam.viewHeight / (cam.mapHeight * TILE_SIZE),
  );
}

/** Size of one tile on screen, in pixels. */
export function tilePixels(cam: Camera): number {
  return TILE_SIZE * cam.zoom;
}

/** The map point (in tiles) under a screen point. */
export function screenToTile(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.x + sx / tilePixels(cam), y: cam.y + sy / tilePixels(cam) };
}

/** The screen point over a map point (in tiles): the inverse of screenToTile. */
export function tileToScreen(cam: Camera, tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - cam.x) * tilePixels(cam), y: (ty - cam.y) * tilePixels(cam) };
}

export function panBy(cam: Camera, dxTiles: number, dyTiles: number): void {
  cam.x += dxTiles;
  cam.y += dyTiles;
  clamp(cam);
}

export function centerOn(cam: Camera, tx: number, ty: number): void {
  cam.x = tx - cam.viewWidth / tilePixels(cam) / 2;
  cam.y = ty - cam.viewHeight / tilePixels(cam) / 2;
  clamp(cam);
}

/** Zooms by `factor`, keeping the map point under screen point (sx, sy) where it is. */
export function zoomAt(cam: Camera, factor: number, sx: number, sy: number): void {
  const anchor = screenToTile(cam, sx, sy);
  cam.zoom = clampZoom(cam, cam.zoom * factor);
  cam.x = anchor.x - sx / tilePixels(cam);
  cam.y = anchor.y - sy / tilePixels(cam);
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

/** Keeps the view on the map; a map narrower (or shorter) than the view is centred. */
function clamp(cam: Camera): void {
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
