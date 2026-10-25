// The minimap: the whole map in miniature, with enemies and the current view, through the
// same fog of war as the map. Click or drag on it to move the view there.
import type { GameState } from "../sim/types";
import { baseAt, isKeepTile, isSpawnTile, mountAt, terrainAt } from "../sim/grid";
import { COLOURS, FOG, STRUCTURE_COLOURS, TERRAIN_STYLES } from "../render/palette";
import { centerOn, tilePixels } from "./camera";
import { KEEP, NONE, getEnclosures } from "../sim/enclosures";
import { SEEN, UNEXPLORED, canSeeEnemiesAt, getSight, isExplored } from "../sim/fog";
import type { UiState } from "./state";

/** The largest the minimap may be, in CSS pixels (it fits the panel). */
const MAX_WIDTH = 216;
const MAX_HEIGHT = 160;

/** The colour of one tile on the minimap: the keep, a structure, the spawn, or the ground. */
export function minimapColour(state: GameState, x: number, y: number): string {
  if (isKeepTile(state, x, y)) return COLOURS.keep;
  const top = mountAt(state, x, y) ?? baseAt(state, x, y);
  if (top) return STRUCTURE_COLOURS[top.kind].bg;
  if (isSpawnTile(state, x, y)) return COLOURS.spawn;
  const terrain = terrainAt(state, x, y);
  return terrain === "ground" ? COLOURS.ground : TERRAIN_STYLES[terrain].bg;
}

export function createMinimap(canvas: HTMLCanvasElement, ui: UiState) {
  const ctx = canvas.getContext("2d")!;
  /** Pixels per tile on the minimap. */
  let scale = 1;
  /** The map image, rebuilt only when the map changes. */
  let terrainImage: ImageData | null = null;
  let imageKey = "";
  let state: GameState | null = null;

  // Click or drag to move the view.
  let dragging = false;
  const moveViewTo = (e: PointerEvent) => {
    if (!state) return;
    const rect = canvas.getBoundingClientRect();
    const tx = ((e.clientX - rect.left) / rect.width) * state.width;
    const ty = ((e.clientY - rect.top) / rect.height) * state.height;
    centerOn(ui.camera, tx, ty);
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
    const { kind } = getEnclosures(s);
    const sight = getSight(s);
    terrainImage = ctx.createImageData(s.width * scale, s.height * scale);
    const data = terrainImage.data;
    const rgbCache = new Map<string, [number, number, number]>();
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const i = y * s.width + x;
        const hex = fogged(tinted(minimapColour(s, x, y), kind[i]), sight[i]);
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
    update(current: GameState) {
      state = current;
      scale = Math.max(
        1,
        Math.floor(Math.min(MAX_WIDTH / current.width, MAX_HEIGHT / current.height)),
      );
      const width = current.width * scale;
      const height = current.height * scale;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const key = `${current.seed}:${current.gridVersion}:${current.fog}:${current.width}x${current.height}:${scale}`;
      if (key !== imageKey) {
        rebuildImage(current);
        imageKey = key;
      }
      ctx.putImageData(terrainImage!, 0, 0);

      // Chests, then enemies, as bright dots.
      ctx.fillStyle = COLOURS.chest;
      for (const f of current.features) {
        if (isExplored(current, f.x, f.y)) ctx.fillRect(f.x * scale, f.y * scale, scale, scale);
      }
      ctx.fillStyle = COLOURS.enemy;
      for (const e of current.enemies) {
        if (canSeeEnemiesAt(current, e.x, e.y))
          ctx.fillRect(Math.round(e.x) * scale, Math.round(e.y) * scale, scale, scale);
      }

      // The view, as an outline.
      const cam = ui.camera;
      const tiles = tilePixels(cam);
      ctx.strokeStyle = COLOURS.minimapView;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(cam.x * scale) + 0.5,
        Math.round(cam.y * scale) + 0.5,
        Math.round((cam.viewWidth / tiles) * scale) - 1,
        Math.round((cam.viewHeight / tiles) * scale) - 1,
      );
    },
  };
}

/** Blends an enclosure's tint into a minimap colour, so claimed areas show there too. */
function tinted(hex: string, kind: number): string {
  if (kind === NONE) return hex;
  const tint = hexToRgb(kind === KEEP ? COLOURS.enclosureKeepTint : COLOURS.enclosureOuterTint);
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
