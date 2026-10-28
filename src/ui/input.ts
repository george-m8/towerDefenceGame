import { ENEMY_KIND_ORDER } from "../sim/config";
import type { Command, GameState, Point } from "../sim/types";
import { panBy, screenToTile, tilePixels, tileToScreen, zoomAt, zoomBy } from "./camera";
import { pickTile } from "../render/canvas";
import { fromView, lastViewOf, toView, turnView } from "../render/rotation";
import { GAME_ONLY_ACTIONS, keyAction, type Action } from "./controls";
import { createGamepads, createStepState, glide, stepStick, type PadFrame } from "./gamepad";
import { offeredTools } from "./hud";
import { pickerKey } from "./pickerKeys";
import {
  BUILD_TABS,
  TOOLS,
  hasBuildTools,
  pickerLayout,
  rotateFacing,
  tabForAction,
  tabForKey,
  type Tool,
  type UiState,
} from "./state";

/** Dev-only stress test: M spawns this many enemies at once. */
const STRESS_TEST_ENEMIES = 200;
/** Zoom step for the + and - keys (and the panel buttons). */
export const ZOOM_STEP = 1.25;
/** How much one notch of the mouse wheel (about 100 deltaY) zooms. */
const WHEEL_ZOOM_PER_PIXEL = 0.0015;

const PAN_ACTIONS: Partial<Record<Action, keyof UiState["panKeys"]>> = {
  panLeft: "left",
  panRight: "right",
  panUp: "up",
  panDown: "down",
};

/**
 * Keys, the mouse and game pads, all turned into Actions (controls.ts) that do the same thing
 * whichever device they came from. Returns frame(), which main.ts calls once a frame to move the
 * view for held keys and read the pads.
 */
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
  const gamepads = createGamepads(() => ui.schemes);
  /** The pads' pointer, in screen pixels over the map; null until a pad is first touched. */
  let padPointer: { x: number; y: number } | null = null;
  /**
   * The tile the d-pad has stepped to, in the turned view's tiles; null while the stick points.
   * Kept as a tile, not a point on screen, so a raised block drawn over it can't take the pick.
   */
  let padTile: Point | null = null;
  /** The d-pad's stepping, and the stick's while it walks the build menu (see stepStick). */
  const dpadStep = createStepState();
  const menuStep = createStepState();
  /** The pointer's and the view's speeds from the sticks, with momentum (see glide). */
  let pointerVelocity = { x: 0, y: 0 };
  let panVelocity = { x: 0, y: 0 };
  /** What was in hand before a pad's sell toggle, to go back to. */
  let beforeSell: Tool | null = null;
  // The pads' pointer arrow, over the map while the stick points.
  const arrow = document.createElement("div");
  arrow.className = "pad-pointer";
  arrow.hidden = true;
  arrow.innerHTML = `<svg width="16" height="18" viewBox="0 0 16 18"><path d="M1 1 V14 L4.5 10.5 L7.5 17 L10 16 L7 9.5 H12 Z" /></svg>`;
  canvas.after(arrow);

  /** The map tile under a point on the canvas, through the camera and the view's turn. */
  function tileAt(sx: number, sy: number): Point {
    const p = screenToTile(ui.camera, sx, sy);
    const state = getState();
    if (!state || ui.rotation === 0) return pickTile(state, p.x, p.y);
    const picked = pickTile(lastViewOf(state, ui.rotation), p.x, p.y);
    return fromView(picked, ui.rotation, state.width, state.height);
  }

  /** The map tile under the mouse. */
  function tileFromEvent(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return tileAt(e.clientX - rect.left, e.clientY - rect.top);
  }

  // Wheel zooms around the cursor, so the tile under it stays put.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      ui.device = "keyboard";
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_PER_PIXEL);
      zoomAt(ui.camera, factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false },
  );

  // Pan keys pan while held (frame() moves the camera).
  window.addEventListener("keyup", (e) => {
    const action = keyAction(ui.schemes.keyboard, e.code);
    const direction = action && PAN_ACTIONS[action];
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

  /** Applies a key to the game's build picker; false if the picker had no use for it. */
  function applyPickerKey(code: string): boolean {
    const state = getState();
    if (!state) return false;
    const action = pickerKey(
      { open: ui.pickerOpen, tab: ui.tab },
      code,
      (tab) => offeredTools(state, tab),
      (key) => tabForKey(key, ui.schemes.keyboard),
    );
    if (!action) return false;
    if (action.type === "open") {
      ui.tab = action.tab;
      ui.pickerOpen = true;
    } else if (action.type === "pick") {
      ui.tool = action.tool;
      ui.pickerOpen = false;
    } else if (action.type === "close") {
      ui.pickerOpen = false;
    }
    return true;
  }

  /** Drops the tool in hand (Esc, right click, a pad's cancel). */
  function dropTool() {
    ui.tool = null;
    ui.debugDamage = false;
  }

  /** What a click does on a tile: the debug Damage tool, or the tool in hand. */
  function pressAt(p: Point) {
    if (ui.tool !== null) ui.debugDamage = false; // a tool picked since: that's in hand now
    if (ui.debugDamage && playing()) {
      dispatch({ type: "debugDamage", x: p.x, y: p.y });
      return;
    }
    useToolAt(p);
    painting = TOOLS.some((t) => t.tool === ui.tool && t.paintable);
    lastPainted = p;
  }

  /** Drags the tool in hand to `p`, filling the tiles between so fast drags leave no gaps. */
  function dragTo(p: Point) {
    if (!painting || !lastPainted || (p.x === lastPainted.x && p.y === lastPainted.y)) return;
    for (const step of lineBetween(lastPainted, p)) useToolAt(step);
    lastPainted = p;
  }

  function endPress() {
    painting = false;
    lastPainted = null;
  }

  /** Steps the tool in hand through the tools offered on the open tab (a pad's bumpers). */
  function stepTool(step: 1 | -1) {
    const state = getState();
    if (!state) return;
    const tab = pickerLayout(offeredTools(state).length) === "row" ? undefined : ui.tab;
    const tools: Tool[] = [...offeredTools(state, tab), "sell"];
    const at = ui.tool === null ? (step > 0 ? -1 : 0) : tools.indexOf(ui.tool);
    ui.tool = tools[(at + step + tools.length) % tools.length];
    ui.debugDamage = false;
    ui.pickerOpen = true;
  }

  /** Moves the build menu to the next (or previous) tab with something to build, and opens it. */
  function stepTab(step: 1 | -1) {
    const state = getState();
    if (!state) return;
    const tabs = BUILD_TABS.filter((t) => offeredTools(state, t.tab).length > 0).map((t) => t.tab);
    if (tabs.length === 0) return;
    const at = tabs.indexOf(ui.tab);
    ui.tab = tabs[(at + step + tabs.length) % tabs.length];
    ui.pickerOpen = true;
  }

  /** Does what an action does, whichever device it came from. Pan and place are held: not here. */
  function perform(action: Action) {
    if (!playing() && GAME_ONLY_ACTIONS.includes(action)) return; // the editor has the map
    const tab = tabForAction(action);
    if (tab) {
      if (!hasBuildTools(tab)) return;
      ui.tab = tab;
      // The game's picker, or (with the editor's map) the editor's toolbar.
      if (playing()) ui.pickerOpen = true;
      else ui.openPicker = true;
      return;
    }
    switch (action) {
      case "zoomIn":
        return zoomBy(ui.camera, ZOOM_STEP);
      case "zoomOut":
        return zoomBy(ui.camera, 1 / ZOOM_STEP);
      case "pause":
        return dispatch({ type: "togglePause" });
      case "fastForward":
        return dispatch({ type: "toggleFastForward" });
      case "rotate":
        return rotateFacing(ui);
      case "rotateBack":
        return rotateFacing(ui, -1);
      case "debugEnemy":
        if (!import.meta.env.DEV) return;
        // One of each kind in turn, so every kind is easy to look at.
        dispatch({ type: "debugSpawn", count: 1, kind: ENEMY_KIND_ORDER[debugKind] });
        debugKind = (debugKind + 1) % ENEMY_KIND_ORDER.length;
        return;
      case "debugUnit":
        // A militia for you on the hovered tile (offline only, like the other debug keys).
        if (!import.meta.env.DEV || !ui.hover) return;
        return dispatch({ type: "debugUnit", kind: "militia", x: ui.hover.x, y: ui.hover.y });
      case "debugSwarm":
        if (!import.meta.env.DEV) return;
        return dispatch({ type: "debugSpawn", count: STRESS_TEST_ENEMIES });
      case "flipView":
        return turnView(ui, getState(), 2); // flips the view round (180°)
      case "journal":
        return keys?.journal();
      case "cancel":
        // The build menu closes first (keeping what's in hand), then a window; otherwise it
        // drops the current tool.
        if (ui.pickerOpen) ui.pickerOpen = false;
        else if (!keys?.escape()) dropTool();
        return;
      case "menu":
        ui.pickerOpen = !ui.pickerOpen;
        return;
      case "prevTab":
        return stepTab(-1);
      case "nextTab":
        return stepTab(1);
      case "toggleSell":
        ui.debugDamage = false;
        if (ui.tool === "sell") ui.tool = beforeSell;
        else [beforeSell, ui.tool] = [ui.tool, "sell"];
        return;
      case "prevTool":
        return stepTool(-1);
      case "nextTool":
        return stepTool(1);
      default: {
        const def = TOOLS.find((t) => t.action === action);
        if (def) ui.tool = def.tool;
      }
    }
  }

  window.addEventListener("keydown", (e) => {
    // Typing a name or room code must not trigger game shortcuts.
    if (e.target instanceof HTMLInputElement) return;
    // The build picker first: 1-3 open a tab, then a number picks, Esc closes.
    if (playing() && !e.metaKey && !e.ctrlKey && applyPickerKey(e.code)) {
      ui.device = "keyboard";
      return;
    }
    // Not with Cmd or Ctrl held, so browser shortcuts (Cmd+S, Ctrl+W) don't pan the map.
    const action = keyAction(ui.schemes.keyboard, e.code);
    if (!action) return;
    ui.device = "keyboard";
    const direction = PAN_ACTIONS[action];
    if (direction) {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault(); // don't scroll the page
      ui.panKeys[direction] = true;
      return;
    }
    if (action === "pause") e.preventDefault();
    // The debug menu is mapButtons.ts's; its key does nothing here.
    if (action !== "debugMenu") perform(action);
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    dropTool();
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    ui.device = "keyboard";
    pressAt(tileFromEvent(e));
  });

  canvas.addEventListener("mousemove", (e) => {
    ui.device = "keyboard";
    padTile = null; // a pad's d-pad starts again from where the mouse is
    const p = tileFromEvent(e);
    ui.hover = p;
    dragTo(p);
  });

  canvas.addEventListener("mouseleave", () => {
    if (ui.device === "keyboard") ui.hover = null;
  });

  window.addEventListener("mouseup", endPress);

  /** A turned view's tile as a map tile, and back. */
  const fromViewTile = (p: Point): Point => {
    const state = getState();
    return state && ui.rotation ? fromView(p, ui.rotation, state.width, state.height) : p;
  };
  const toViewTile = (p: Point): Point => {
    const state = getState();
    return state && ui.rotation ? toView(p, ui.rotation, state.width, state.height) : p;
  };

  /** The map tile a pad is on: the d-pad's tile, or the one under the pointer. */
  function padTarget(): Point | null {
    if (padTile) return fromViewTile(padTile);
    return padPointer ? tileAt(padPointer.x, padPointer.y) : null;
  }

  /** How far past the view's inner margin a screen point is (0 inside), for the view to follow. */
  function pastEdge(at: { x: number; y: number }, margin: number): { x: number; y: number } {
    const { viewWidth, viewHeight } = ui.camera;
    const edge = Math.min(margin, viewWidth / 4, viewHeight / 4);
    const past = (v: number, length: number) =>
      v < edge ? v - edge : v > length - edge ? v - (length - edge) : 0;
    return { x: past(at.x, viewWidth), y: past(at.y, viewHeight) };
  }

  /** Steps the d-pad's tile, starting from the tile the pad (or mouse) was last on. */
  function stepPadTile(step: { x: number; y: number }, edgePixels: number) {
    const { camera } = ui;
    const centre = screenToTile(camera, camera.viewWidth / 2, camera.viewHeight / 2);
    const from =
      padTile ??
      (ui.hover ? toViewTile(ui.hover) : { x: Math.floor(centre.x), y: Math.floor(centre.y) });
    const keep = (v: number, length: number) => Math.min(Math.max(v, 0), length - 1);
    padTile = {
      x: keep(from.x + step.x, camera.mapWidth),
      y: keep(from.y + step.y, camera.mapHeight),
    };
    const size = tilePixels(camera);
    const over = pastEdge(
      tileToScreen(camera, padTile.x + 0.5, padTile.y + 0.5),
      Math.max(edgePixels, size),
    );
    panBy(camera, over.x / size, over.y / size);
  }

  /** One pad's frame: its buttons, then its pointer, panning and zoom, each with its own feel. */
  function applyPad(pad: PadFrame, seconds: number) {
    const { feel } = pad.scheme;
    const { camera } = ui;
    if (pad.active) {
      ui.device = pad.scheme.device;
      padPointer ??= { x: camera.viewWidth / 2, y: camera.viewHeight / 2 };
    }
    for (const action of pad.pressed) {
      if (action !== "place") perform(action);
      // A click: with the build menu open it picks what's chosen there (and closes it); with
      // nothing in hand it opens the menu; otherwise it uses what's in hand.
      else if (ui.pickerOpen) ui.pickerOpen = false;
      else if (ui.tool === null && !ui.debugDamage) ui.pickerOpen = true;
      else {
        const p = padTarget();
        if (p) pressAt(p);
      }
    }
    // The pan stick moves the view, with a little momentum; the pointer stays put on screen.
    panVelocity = glide(panVelocity, pad.pan, seconds, feel.momentumSeconds);
    const panStep = (feel.panPixelsPerSecond * seconds) / tilePixels(camera);
    if (panVelocity.x || panVelocity.y) {
      panBy(camera, panVelocity.x * panStep, panVelocity.y * panStep);
    }
    if (pad.zoom) {
      const anchor = padTile
        ? tileToScreen(camera, padTile.x + 0.5, padTile.y + 0.5)
        : (padPointer ?? { x: camera.viewWidth / 2, y: camera.viewHeight / 2 });
      zoomAt(camera, feel.zoomPerSecond ** (pad.zoom * seconds), anchor.x, anchor.y);
    }
    const dpad = stepStick(dpadStep, pad.dpad, seconds, feel);
    if (ui.pickerOpen) {
      // The build menu is open: the d-pad and the stick both walk it, up and down its items,
      // left and right its tabs.
      pointerVelocity = { x: 0, y: 0 };
      const stick = stepStick(menuStep, pad.cursor, seconds, feel);
      for (const step of [dpad, stick]) {
        if (step?.x) stepTab(step.x as 1 | -1);
        if (step?.y) stepTool(step.y as 1 | -1);
      }
    } else {
      stepStick(menuStep, { x: 0, y: 0 }, seconds, feel); // so the menu starts fresh next time
      // The d-pad steps a tile at a time, with the pointer hidden (and stopped).
      if (dpad) {
        stepPadTile(dpad, feel.edgePixels);
        pointerVelocity = { x: 0, y: 0 };
      }
      // The stick points, from the d-pad's tile if it was stepping, and pushes the view near the
      // edge; with momentum, the pointer glides a moment after the stick is let go.
      if (padPointer && (pad.cursor.x || pad.cursor.y) && padTile) {
        padPointer = tileToScreen(camera, padTile.x + 0.5, padTile.y + 0.5);
        padTile = null;
      }
      if (!padTile)
        pointerVelocity = glide(pointerVelocity, pad.cursor, seconds, feel.momentumSeconds);
      if (padPointer && !padTile && (pointerVelocity.x || pointerVelocity.y)) {
        const step = feel.cursorPixelsPerSecond * seconds;
        padPointer.x += pointerVelocity.x * step;
        padPointer.y += pointerVelocity.y * step;
        const over = pastEdge(padPointer, feel.edgePixels);
        padPointer.x -= over.x;
        padPointer.y -= over.y;
        if (over.x || over.y)
          panBy(camera, over.x / tilePixels(camera), over.y / tilePixels(camera));
      }
    }
    if (ui.device !== pad.scheme.device) return;
    const p = padTarget();
    if (!p) return;
    ui.hover = p;
    if (pad.held.includes("place")) dragTo(p);
    else if (painting) endPress();
  }

  return {
    /** Moves the view for held pan keys and reads the pads; call once a frame. */
    frame(seconds: number) {
      const { left, right, up, down } = ui.panKeys;
      const step = (ui.schemes.keyboard.feel.panPixelsPerSecond * seconds) / tilePixels(ui.camera);
      const dx = (right ? 1 : 0) - (left ? 1 : 0);
      const dy = (down ? 1 : 0) - (up ? 1 : 0);
      if (dx || dy) panBy(ui.camera, dx * step, dy * step);
      for (const pad of gamepads.poll()) applyPad(pad, seconds);
      // The arrow shows where the stick points; the mouse, the d-pad and the menu hide it.
      const shown = ui.device !== "keyboard" && !padTile && !ui.pickerOpen && padPointer;
      arrow.hidden = !shown;
      if (shown) {
        const x = canvas.offsetLeft + padPointer!.x;
        const y = canvas.offsetTop + padPointer!.y;
        arrow.style.transform = `translate(${x}px, ${y}px)`;
      }
    },
  };
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
