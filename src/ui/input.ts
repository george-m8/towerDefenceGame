import { ENEMY_KIND_ORDER } from "../sim/config";
import type { Command, GameState, Point } from "../sim/types";
import { screenToTile, zoomAt, zoomBy } from "./camera";
import { pickTile } from "../render/canvas";
import { TOOLS, rotateFacing, type UiState } from "./state";

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
};

export function bindInput(
  canvas: HTMLCanvasElement,
  ui: UiState,
  dispatch: (command: Command) => void,
  /** The game being shown, so clicks on a raised block's lifted top pick that block. */
  getState: () => GameState | null = () => null,
  /** Window keys: J toggles the journal; escape() closes an open window and returns true if it did. */
  keys?: { journal(): void; escape(): boolean },
) {
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

  // Arrow keys pan while held (main.ts moves the camera each frame).
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
    if (!ui.tool) return;
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
    const direction = PAN_KEYS[e.code];
    if (direction) {
      e.preventDefault(); // don't scroll the page
      ui.panKeys[direction] = true;
    } else if (e.code === "Equal" || e.code === "NumpadAdd") {
      zoomBy(ui.camera, ZOOM_STEP);
    } else if (e.code === "Minus" || e.code === "NumpadSubtract") {
      zoomBy(ui.camera, 1 / ZOOM_STEP);
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
    } else if (e.code === "KeyM" && import.meta.env.DEV) {
      dispatch({ type: "debugSpawn", count: STRESS_TEST_ENEMIES });
    } else if (e.code === "KeyJ" && keys) {
      keys.journal();
    } else if (e.code === "Escape") {
      // Closing a window comes first; otherwise Escape drops the current tool.
      if (!keys?.escape()) ui.tool = null;
    } else {
      const def = TOOLS.find((t) => t.key === e.code);
      if (def) ui.tool = def.tool;
    }
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    ui.tool = null;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const p = tileFromEvent(e);
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
function lineBetween(a: Point, b: Point): Point[] {
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
