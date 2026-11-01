// The minimap: the whole map in miniature, with enemies and the current view, through the
// same fog of war as the map. Click or drag on it to move the view there.
import type { GameState } from "../sim/types";
import { baseAt, isKeepTile, isSpawnTile, mountAt, terrainAt } from "../sim/grid";
import { COLOURS, FOG, STRUCTURE_COLOURS, TERRAIN_STYLES } from "../render/palette";
import { centerOn, tilePixels } from "./camera";
import { KEEP, NONE, getEnclosures } from "../sim/enclosures";
import { SEEN, UNEXPLORED, canSeeEnemiesAt, getSight, isExplored } from "../sim/fog";
import type { UiState } from "./state";

/**
 * How wide the minimap is drawn, at least, in canvas pixels: about twice the width of its box
 * on screen, which it's stretched (pixelated) to fill, so it stays sharp on high-density
 * screens. A whole number of pixels per tile.
 */
const DRAW_WIDTH = 440;
/** The view outline, in screen pixels: a white line under black dashes, seen on any ground. */
const VIEW_LINE_PX = 2;
const VIEW_DASH_PX = 4;

/** The colour of one tile on the minimap: the keep, a structure, the spawn, or the ground. */
export function minimapColour(state: GameState, x: number, y: number): string {
  if (isKeepTile(state, x, y)) return COLOURS.keep;
  const top = mountAt(state, x, y) ?? baseAt(state, x, y);
  if (top) return STRUCTURE_COLOURS[top.kind].bg;
  if (isSpawnTile(state, x, y)) return COLOURS.spawn;
  const terrain = terrainAt(state, x, y);
  return terrain === "ground" ? COLOURS.ground : TERRAIN_STYLES[terrain].bg;
}

/** The full-screen map's scale: the most whole pixels per tile that fit, never below 1. */
export function fullMapScale(mapW: number, mapH: number, availW: number, availH: number): number {
  return Math.max(1, Math.floor(Math.min(availW / mapW, availH / mapH)));
}

/**
 * The minimap, drawn on `canvas`. With `fit`, it's the full-screen map instead: it fills the
 * space `fit` gives (in CSS pixels) at a whole number of device pixels per tile.
 */
export function createMinimap(
  canvas: HTMLCanvasElement,
  ui: UiState,
  fit?: () => { width: number; height: number },
) {
  const ctx = canvas.getContext("2d")!;
  /** Pixels per tile on the minimap. */
  let scale = 1;
  /** The map image, rebuilt only when the map changes. */
  let terrainImage: ImageData | null = null;
  let imageKey = "";
  let state: GameState | null = null;

  // Click or drag to move the view.
  let dragging = false;
  /** The map tile (in the view's tiles) under a point on the screen. */
  const tileAt = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * (state?.width ?? 0),
      y: ((clientY - rect.top) / rect.height) * (state?.height ?? 0),
    };
  };
  const moveViewTo = (e: PointerEvent) => {
    if (!state) return;
    const tile = tileAt(e.clientX, e.clientY);
    centerOn(ui.camera, tile.x, tile.y);
  };
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    moveViewTo(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragging) moveViewTo(e);
  });
  canvas.addEventListener("pointerup", () => (dragging = false));
  canvas.addEventListener("pointercancel", () => (dragging = false));

  function rebuildImage(s: GameState) {
    const { kind, owner } = getEnclosures(s);
    const sight = getSight(s, ui.playerId);
    terrainImage = ctx.createImageData(s.width * scale, s.height * scale);
    const data = terrainImage.data;
    const rgbCache = new Map<string, [number, number, number]>();
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const i = y * s.width + x;
        const rival = owner[i] !== 0 && owner[i] !== ui.playerId;
        const hex = fogged(tinted(minimapColour(s, x, y), kind[i], rival), sight[i]);
        let rgb = rgbCache.get(hex);
        if (!rgb) rgbCache.set(hex, (rgb = hexToRgb(hex)));
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const p = ((y * scale + py) * s.width * scale + (x * scale + px)) * 4;
            data[p] = rgb[0];
            data[p + 1] = rgb[1];
            data[p + 2] = rgb[2];
            data[p + 3] = 255;
          }
        }
      }
    }
  }

  return {
    tileAt,
    update(current: GameState) {
      state = current;
      const dpr = window.devicePixelRatio || 1;
      const space = fit?.();
      scale = space
        ? fullMapScale(current.width, current.height, space.width * dpr, space.height * dpr)
        : Math.max(1, Math.ceil(DRAW_WIDTH / current.width));
      const width = current.width * scale;
      const height = current.height * scale;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        if (space) {
          canvas.style.width = `${width / dpr}px`;
          canvas.style.height = `${height / dpr}px`;
        }
      }
      const key = `${current.seed}:${current.gridVersion}:${current.fog}:${ui.playerId}:${current.width}x${current.height}:${scale}`;
      if (key !== imageKey) {
        rebuildImage(current);
        imageKey = key;
      }
      ctx.putImageData(terrainImage!, 0, 0);

      // Chests, then enemies, as bright dots.
      ctx.fillStyle = COLOURS.chest;
      for (const f of current.features) {
        if (isExplored(current, f.x, f.y, ui.playerId))
          ctx.fillRect(f.x * scale, f.y * scale, scale, scale);
      }
      ctx.fillStyle = COLOURS.enemy;
      for (const e of current.enemies) {
        if (canSeeEnemiesAt(current, e.x, e.y, ui.playerId))
          ctx.fillRect(Math.round(e.x) * scale, Math.round(e.y) * scale, scale, scale);
      }

      // The view, as an outline: white with black dashes over it, so it shows on the white
      // fog and on dark ground alike. Sized in screen pixels (the canvas is stretched to fit).
      const cam = ui.camera;
      const tiles = tilePixels(cam);
      const perScreenPixel = canvas.width / (canvas.clientWidth || canvas.width);
      const line = Math.max(1, Math.round(VIEW_LINE_PX * perScreenPixel));
      const inset = line / 2;
      const rect: [number, number, number, number] = [
        Math.round(cam.x * scale) + inset,
        Math.round(cam.y * scale) + inset,
        Math.round((cam.viewWidth / tiles) * scale) - line,
        Math.round((cam.viewHeight / tiles) * scale) - line,
      ];
      ctx.lineWidth = line;
      ctx.setLineDash([]);
      ctx.strokeStyle = COLOURS.minimapView;
      ctx.strokeRect(...rect);
      ctx.setLineDash([VIEW_DASH_PX * perScreenPixel, VIEW_DASH_PX * perScreenPixel]);
      ctx.strokeStyle = COLOURS.minimapViewDash;
      ctx.strokeRect(...rect);
      ctx.setLineDash([]);
    },
  };
}

/** Blends an enclosure's tint into a minimap colour, so claimed areas show there too. */
function tinted(hex: string, kind: number, rival = false): string {
  if (kind === NONE) return hex;
  const tint = hexToRgb(
    rival
      ? COLOURS.enclosureRivalTint
      : kind === KEEP
        ? COLOURS.enclosureKeepTint
        : COLOURS.enclosureOuterTint,
  );
  const base = hexToRgb(hex);
  const mix = base.map((c, i) => Math.round(c * (1 - MINIMAP_TINT) + tint[i] * MINIMAP_TINT));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Fog of war on the minimap, like the map's: unexplored is misted over, seen is misted lightly. */
export function fogged(hex: string, tier: number): string {
  const opacity =
    tier === UNEXPLORED ? FOG.unexplored.opacity : tier === SEEN ? FOG.seen.opacity : 0;
  if (opacity === 0) return hex;
  const fog = hexToRgb(FOG.colour);
  const mix = hexToRgb(hex).map((c, i) => Math.round(c * (1 - opacity) + fog[i] * opacity));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** How strongly an enclosure tints the minimap. */
const MINIMAP_TINT = 0.4;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
