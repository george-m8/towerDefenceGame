import { TILE_SIZE } from "../render/palette";
import type { Command, Point } from "../sim/types";
import { TOOLS, rotateFacing, type UiState } from "./state";

/** Dev-only stress test: M spawns this many enemies at once. */
const STRESS_TEST_ENEMIES = 200;

export function bindInput(
  canvas: HTMLCanvasElement,
  ui: UiState,
  dispatch: (command: Command) => void,
) {
  let painting = false;
  let lastPainted: Point | null = null;

  function tileFromEvent(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - rect.left) / rect.width) * (canvas.width / TILE_SIZE)),
      y: Math.floor(((e.clientY - rect.top) / rect.height) * (canvas.height / TILE_SIZE)),
    };
  }

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
    if (e.code === "Space") {
      e.preventDefault();
      dispatch({ type: "togglePause" });
    } else if (e.code === "KeyF") {
      dispatch({ type: "toggleFastForward" });
    } else if (e.code === "KeyR") {
      rotateFacing(ui);
    } else if (e.code === "KeyD") {
      ui.showFlow = !ui.showFlow;
    } else if (e.code === "KeyE" && import.meta.env.DEV) {
      dispatch({ type: "debugSpawn", count: 1 });
    } else if (e.code === "KeyM" && import.meta.env.DEV) {
      dispatch({ type: "debugSpawn", count: STRESS_TEST_ENEMIES });
    } else if (e.code === "Escape") {
      ui.tool = null;
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
