import { ENEMY_KIND_ORDER } from "../sim/config";
import type { Command, GameState, Point } from "../sim/types";
import { screenToTile, zoomAt, zoomBy } from "./camera";
import { pickTile } from "../render/canvas";
import { TOOLS, hasBuildTools, rotateFacing, tabForKey, type UiState } from "./state";

/** Keys that act on a running game, so they do nothing in the map editor. */
export const GAME_ONLY_KEYS = ["Space", "KeyF", "KeyJ", "KeyE", "KeyU", "KeyM"];
/** Dev-only stress test: M spawns this many enemies at once. */
const STRESS_TEST_ENEMIES = 200;
/** Zoom step for the + and - keys (and the panel buttons). */
export const ZOOM_STEP = 1.25;
/** How much one notch of the mouse wheel (about 100 deltaY) zooms. */
const WHEEL_ZOOM_PER_PIXEL = 0.0015;

const PAN_KEYS: Record<string, keyof UiState["panKeys"]> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  KeyA: "left",
  KeyD: "right",
  KeyW: "up",
  KeyS: "down",
};

export function bindInput(
  canvas: HTMLCanvasElement,
  ui: UiState,
  dispatch: (command: Command) => void,
  /** The game being shown, so clicks on a raised block's lifted top pick that block. */
  getState: () => GameState | null = () => null,
  /**
   * Window keys: J toggles the journal; escape() closes an open window and returns true if it
   * did. playing() is false while the map editor has the map: then the keys and clicks that
   * act on a game do nothing, and the ones the editor shares (pan, zoom, 1-3, R, X, Esc) work.
   */
  keys?: { journal(): void; escape(): boolean; playing?(): boolean },
) {
  const playing = () => keys?.playing?.() ?? true;
  let painting = false;
  let debugKind = 0;
  let lastPainted: Point | null = null;

  /** The tile under the mouse, through the camera's scroll and zoom. */
  function tileFromEvent(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const p = screenToTile(ui.camera, e.clientX - rect.left, e.clientY - rect.top);
    return pickTile(getState(), p.x, p.y);
  }

  // Wheel zooms around the cursor, so the tile under it stays put.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_PER_PIXEL);
      zoomAt(ui.camera, factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false },
  );

  // Arrow keys and WASD pan while held (main.ts moves the camera each frame).
  window.addEventListener("keyup", (e) => {
    const direction = PAN_KEYS[e.code];
    if (direction) ui.panKeys[direction] = false;
  });
  window.addEventListener("blur", () => {
    for (const key of Object.keys(ui.panKeys) as (keyof UiState["panKeys"])[]) {
      ui.panKeys[key] = false;
    }
  });

  function useToolAt(p: Point) {
    if (!ui.tool || !playing()) return;
    // Refusals come back through the session's onResult.
    dispatch(
      ui.tool === "sell"
        ? { type: "sell", x: p.x, y: p.y }
        : { type: "build", kind: ui.tool, x: p.x, y: p.y, facing: ui.facing },
    );
  }

  window.addEventListener("keydown", (e) => {
    // Typing a name or room code must not trigger game shortcuts.
    if (e.target instanceof HTMLInputElement) return;
    // Not with Cmd or Ctrl held, so browser shortcuts (Cmd+S, Ctrl+W) don't pan the map.
    const direction = e.metaKey || e.ctrlKey ? undefined : PAN_KEYS[e.code];
    if (direction) {
      e.preventDefault(); // don't scroll the page
      ui.panKeys[direction] = true;
    } else if (e.code === "Equal" || e.code === "NumpadAdd") {
      zoomBy(ui.camera, ZOOM_STEP);
    } else if (e.code === "Minus" || e.code === "NumpadSubtract") {
      zoomBy(ui.camera, 1 / ZOOM_STEP);
    } else if (!playing() && GAME_ONLY_KEYS.includes(e.code)) {
      // The editor has the map: no pausing, journal or debug spawns.
    } else if (e.code === "Space") {
      e.preventDefault();
      dispatch({ type: "togglePause" });
    } else if (e.code === "KeyF") {
      dispatch({ type: "toggleFastForward" });
    } else if (e.code === "KeyR") {
      rotateFacing(ui);
    } else if (e.code === "KeyE" && import.meta.env.DEV) {
      // One of each kind in turn, so every kind is easy to look at.
      dispatch({ type: "debugSpawn", count: 1, kind: ENEMY_KIND_ORDER[debugKind] });
      debugKind = (debugKind + 1) % ENEMY_KIND_ORDER.length;
    } else if (e.code === "KeyU" && import.meta.env.DEV && ui.hover) {
      // A militia for you on the hovered tile (offline only, like the other debug keys).
      dispatch({ type: "debugUnit", kind: "militia", x: ui.hover.x, y: ui.hover.y });
    } else if (e.code === "KeyM" && import.meta.env.DEV) {
      dispatch({ type: "debugSpawn", count: STRESS_TEST_ENEMIES });
    } else if (e.code === "KeyJ" && keys) {
      keys.journal();
    } else if (e.code === "Escape") {
      // Closing a window comes first; otherwise Escape drops the current tool.
      if (!keys?.escape()) {
        ui.tool = null;
        ui.debugDamage = false;
      }
    } else if (tabForKey(e.code) && hasBuildTools(tabForKey(e.code)!)) {
      // 1, 2, 3 open the build picker on Defence, Civic or Offence.
      ui.tab = tabForKey(e.code)!;
      ui.openPicker = true;
    } else {
      const def = TOOLS.find((t) => t.key && t.key === e.code);
      if (def) ui.tool = def.tool;
    }
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    ui.tool = null;
    ui.debugDamage = false;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const p = tileFromEvent(e);
    if (ui.tool !== null) ui.debugDamage = false; // a tool picked since: that's in hand now
    if (ui.debugDamage && playing()) {
      dispatch({ type: "debugDamage", x: p.x, y: p.y });
      return;
    }
    useToolAt(p);
    painting = TOOLS.some((t) => t.tool === ui.tool && t.paintable);
    lastPainted = p;
  });

  canvas.addEventListener("mousemove", (e) => {
    const p = tileFromEvent(e);
    ui.hover = p;
    if (!painting || !lastPainted || (p.x === lastPainted.x && p.y === lastPainted.y)) return;
    // Fill every tile between the last and current position so fast drags leave no gaps.
    for (const step of lineBetween(lastPainted, p)) useToolAt(step);
    lastPainted = p;
  });

  canvas.addEventListener("mouseleave", () => {
    ui.hover = null;
  });

  window.addEventListener("mouseup", () => {
    painting = false;
    lastPainted = null;
  });
}

/** 4-connected tiles from a (exclusive) to b (inclusive), so painted walls have no diagonal gaps. */
export function lineBetween(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = Math.sign(b.x - a.x);
  const sy = Math.sign(b.y - a.y);
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    if (err > 0 || (err === 0 && dx >= dy)) {
      x += sx;
      err -= dy;
    } else {
      y += sy;
      err += dx;
    }
    points.push({ x, y });
  }
  return points;
}
