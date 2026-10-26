// The map editor page (SPEC-map-editor.md): the map being edited, its undo history, the tool in
// hand and the mouse. The map is drawn by the game's own renderer, through a scratch game built
// from it (rebuilt at most once a frame, when the map has changed). The keys it shares with the
// game come from the game's handler (ui/input.ts); the rest are in keys.ts.
import { KEEP_SIZE, MAP_EDITOR, STRUCTURES, TERRAIN } from "../sim/config";
import { createGame } from "../sim/game";
import { validateMap, type MapFile, type MapProblems } from "../sim/mapFile";
import type { GameState, Point, StructureKind, Terrain } from "../sim/types";
import { pickTile } from "../render/canvas";
import { TILE_SIZE } from "../render/palette";
import { screenToTile } from "../ui/camera";
import { lineBetween } from "../ui/input";
import { TOOLS, type UiState } from "../ui/state";
import { editorKey } from "./keys";
import {
  History,
  addSpawn,
  brushTiles,
  erase,
  keepAt,
  moveKeep,
  paintTerrain,
  placeChest,
  placeKeep,
  placeRuin,
  placeStructure,
  rebuildKeepWalls,
  rectTiles,
  type Edit,
} from "./model";

/** What the Map tab (4) holds: terrain, and the map's own pieces. */
export type MapItem = Terrain | "keep" | "spawn" | "ruin" | "chest";

export const MAP_ITEMS: MapItem[] = [
  ...(Object.keys(TERRAIN) as Terrain[]),
  "keep",
  "spawn",
  "ruin",
  "chest",
];

export function itemName(item: MapItem): string {
  if (item === "keep") return "Keep";
  if (item === "spawn") return "Spawn zone";
  if (item === "ruin") return "Ruin";
  if (item === "chest") return "Chest";
  return TERRAIN[item].name;
}

const isTerrain = (item: MapItem | null): item is Terrain => item !== null && item in TERRAIN;

/** How long a note stays in the status line. */
const NOTE_MS = 3000;

/** A drag in progress: what it's doing, and where it started and is now. */
type Drag =
  | { kind: "line"; last: Point }
  | { kind: "rect"; start: Point; end: Point }
  /** Moving a keep: each step starts again from the map as it was, so only the end is cleared. */
  | { kind: "keep"; index: number; from: MapFile };

export interface Editor {
  /** The map as it is now. */
  readonly map: MapFile;
  /** The scratch game the map is drawn through, up to date with the map. */
  readonly state: GameState;
  readonly problems: MapProblems;
  readonly history: History;
  /** The Map tab's item in hand (structures and the eraser are `ui.tool`, as in game). */
  item: MapItem | null;
  /** Set by 4 to ask the toolbar to open the picker on the Map tab; the toolbar clears it. */
  openMapTab: boolean;
  /** Index into MAP_EDITOR.brushSizes. */
  brush: number;
  ruinHp: number;
  chestGold: number;
  /** A note for the status line, and until when (ms). */
  note: string;
  noteUntil: number;
  /** The rectangle being dragged out, for the overlay. */
  readonly dragRect: { start: Point; end: Point } | null;
  /** Shows a note in the status line for a while. */
  say(note: string | undefined): void;
  /** Replaces the map (New, Open), with a fresh history. */
  load(map: MapFile): void;
  /** One whole step: Keep walls, and the like. */
  apply(edit: Edit): void;
  undo(): void;
  redo(): void;
  /** Called every frame: brings the scratch game and the problems up to date. */
  update(now: number): void;
  /** Draws the brush, footprint or rectangle over the map, in map pixels. */
  drawOverlay(ctx: CanvasRenderingContext2D, ui: UiState): void;
  /** The amount or size `[` and `]` change, as shown in the tool box ("" if none). */
  amountLabel(ui: UiState): string;
}

export function createEditor(
  canvas: HTMLCanvasElement,
  ui: UiState,
  start: MapFile,
  options: {
    /** False while a game is being played from the editor: then the editor leaves input be. */
    active: () => boolean;
    play: () => void;
  },
): Editor {
  const history = new History(start);
  let state = scratchGame(start);
  let built = start;
  let problems = validateMap(start);
  let checked = start;
  let drag: Drag | null = null;
  let lastTool = ui.tool;

  const editor: Editor = {
    get map() {
      return history.map;
    },
    get state() {
      return state;
    },
    get problems() {
      return problems;
    },
    history,
    item: null,
    openMapTab: false,
    brush: 1,
    ruinHp: MAP_EDITOR.defaultRuinHp,
    chestGold: MAP_EDITOR.chestGold.default,
    note: "",
    noteUntil: 0,
    say,
    get dragRect() {
      return drag?.kind === "rect" ? { start: drag.start, end: drag.end } : null;
    },
    load(map) {
      history.reset(map);
      drag = null;
    },
    apply(edit) {
      history.apply(edit.map);
      say(edit.note);
    },
    undo() {
      drag = null;
      if (!history.undo()) say("Nothing to undo");
    },
    redo() {
      drag = null;
      if (!history.redo()) say("Nothing to redo");
    },
    update() {
      // X or a structure picked: that's the tool now, so the Map tab's item goes.
      if (ui.tool !== lastTool && ui.tool !== null) editor.item = null;
      lastTool = ui.tool;
      if (built !== history.map) {
        state = scratchGame(history.map);
        built = history.map;
      }
      if (checked !== history.map && drag === null) {
        problems = validateMap(history.map);
        checked = history.map;
      }
    },
    drawOverlay(ctx, ui) {
      // The renderer's view: map pixels, through the camera's scroll and zoom.
      const cam = ui.camera;
      const scale = cam.zoom * (ctx.canvas.width / cam.viewWidth);
      ctx.setTransform(scale, 0, 0, scale, -cam.x * TILE_SIZE * scale, -cam.y * TILE_SIZE * scale);
      const outline = (tiles: { x: number; y: number; w: number; h: number }, colour: string) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          tiles.x * TILE_SIZE + 0.75,
          tiles.y * TILE_SIZE + 0.75,
          tiles.w * TILE_SIZE - 1.5,
          tiles.h * TILE_SIZE - 1.5,
        );
      };
      if (drag?.kind === "rect") {
        const x = Math.min(drag.start.x, drag.end.x);
        const y = Math.min(drag.start.y, drag.end.y);
        const w = Math.abs(drag.end.x - drag.start.x) + 1;
        const h = Math.abs(drag.end.y - drag.start.y) + 1;
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, w * TILE_SIZE, h * TILE_SIZE);
        outline({ x, y, w, h }, "#ffffff");
        return;
      }
      const hover = ui.hover;
      if (!hover || editor.item === null) return;
      if (isTerrain(editor.item)) {
        const size = MAP_EDITOR.brushSizes[editor.brush];
        const r = Math.floor(size / 2);
        outline({ x: hover.x - r, y: hover.y - r, w: size, h: size }, "#ffffff");
      } else if (editor.item === "keep") {
        const half = Math.floor(KEEP_SIZE / 2);
        outline({ x: hover.x - half, y: hover.y - half, w: KEEP_SIZE, h: KEEP_SIZE }, "#ffffff");
      } else {
        outline({ x: hover.x, y: hover.y, w: 1, h: 1 }, "#ffffff");
      }
    },
    amountLabel(ui) {
      if (ui.tool !== null) return "";
      if (isTerrain(editor.item)) {
        const size = MAP_EDITOR.brushSizes[editor.brush];
        return `${size}x${size}`;
      }
      if (editor.item === "ruin") return `${Math.round(editor.ruinHp * 100)}% HP`;
      if (editor.item === "chest") return `${editor.chestGold}g`;
      return "";
    },
  };

  function say(note: string | undefined) {
    if (!note) return;
    editor.note = note;
    editor.noteUntil = performance.now() + NOTE_MS;
  }

  /** Applies an edit inside the open step (a click or a drag). */
  function step(edit: Edit) {
    history.set(edit.map);
    say(edit.note);
  }

  /** Uses the tool in hand on one tile (a click, or a tile along a drag). */
  function useAt(p: Point) {
    const map = history.map;
    const tool = ui.tool;
    if (tool === "sell") return step(erase(map, p));
    if (tool !== null) return step(placeStructure(map, tool as StructureKind, p, ui.facing));
    const item = editor.item;
    if (isTerrain(item)) {
      return step(paintTerrain(map, brushTiles(map, p, MAP_EDITOR.brushSizes[editor.brush]), item));
    }
    if (item === "ruin") return step(placeRuin(map, p, editor.ruinHp));
    if (item === "chest") return step(placeChest(map, p, editor.chestGold));
  }

  /** Whether the tool in hand works along a drag, tile by tile. */
  function paintsAlong(): boolean {
    if (ui.tool === "sell") return true;
    if (ui.tool !== null) return TOOLS.some((t) => t.tool === ui.tool && t.paintable);
    return isTerrain(editor.item);
  }

  function tileFromEvent(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const p = screenToTile(ui.camera, e.clientX - rect.left, e.clientY - rect.top);
    return pickTile(state, p.x, p.y);
  }

  canvas.addEventListener("mousedown", (e) => {
    if (!options.active() || e.button !== 0) return;
    const p = tileFromEvent(e);
    if (ui.tool === null && editor.item === null) return;
    history.begin();
    const item = editor.item;
    if (ui.tool === null && (item === "spawn" || (isTerrain(item) && e.shiftKey))) {
      drag = { kind: "rect", start: p, end: p };
      return;
    }
    if (ui.tool === null && item === "keep") {
      const index = keepAt(history.map, p.x, p.y);
      if (index !== undefined) {
        drag = { kind: "keep", index, from: history.map };
        return;
      }
      const before = history.map;
      const placed = placeKeep(before, p);
      step(placed);
      const now = keepAt(placed.map, p.x, p.y);
      // A new keep is dragged from the map without it; a moved one, from before it moved.
      drag = now !== undefined ? { kind: "keep", index: now, from: before } : null;
      return;
    }
    useAt(p);
    drag = paintsAlong() ? { kind: "line", last: p } : null;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!options.active() || !drag) return;
    const p = tileFromEvent(e);
    if (drag.kind === "rect") {
      drag.end = p;
    } else if (drag.kind === "keep") {
      const { from, index } = drag;
      step(index < from.keeps.length ? moveKeep(from, index, p) : placeKeep(from, p));
    } else if (p.x !== drag.last.x || p.y !== drag.last.y) {
      for (const tile of lineBetween(drag.last, p)) useAt(tile);
      drag.last = p;
    }
  });

  window.addEventListener("mouseup", () => {
    if (!drag && !options.active()) return;
    if (drag?.kind === "rect") {
      const { start, end } = drag;
      const map = history.map;
      if (isTerrain(editor.item)) step(paintTerrain(map, rectTiles(map, start, end), editor.item));
      else step(addSpawn(map, start, end));
    }
    drag = null;
    history.end();
  });

  canvas.addEventListener("contextmenu", () => {
    if (options.active()) editor.item = null; // the game's handler drops ui.tool
  });

  window.addEventListener("keydown", (e) => {
    if (!options.active() || e.target instanceof HTMLInputElement) return;
    if (e.code === "Escape") editor.item = null; // the game's handler drops ui.tool
    const action = editorKey(e);
    if (!action) return;
    e.preventDefault();
    if (action.type === "undo") editor.undo();
    else if (action.type === "redo") editor.redo();
    else if (action.type === "play") options.play();
    else if (action.type === "smaller" || action.type === "bigger") {
      change(editor, action.type === "bigger" ? 1 : -1);
    } else if (action.type === "mapTab") editor.openMapTab = true;
  });

  return editor;
}

/** `[` and `]`: the brush size, or the ruin's HP or chest's gold, a step down or up. */
function change(editor: Editor, by: 1 | -1) {
  if (isTerrain(editor.item)) {
    const last = MAP_EDITOR.brushSizes.length - 1;
    editor.brush = Math.max(0, Math.min(last, editor.brush + by));
  } else if (editor.item === "ruin") {
    const steps = MAP_EDITOR.ruinHpSteps;
    const i = Math.max(
      0,
      steps.findIndex((s) => s >= editor.ruinHp - 1e-9),
    );
    editor.ruinHp = steps[Math.max(0, Math.min(steps.length - 1, i + by))];
  } else if (editor.item === "chest") {
    const { min, max, step } = MAP_EDITOR.chestGold;
    editor.chestGold = Math.max(min, Math.min(max, editor.chestGold + by * step));
  }
}

/** The game the map is drawn through: no fog, and gold enough that every ghost shows its rule. */
function scratchGame(map: MapFile): GameState {
  const state = createGame(map.seed, { map, fog: false });
  state.debug.infiniteGold = true;
  return state;
}

/** A rebuilt keep wall ring, as a step (the Keep walls button). */
export function keepWalls(editor: Editor) {
  editor.apply(rebuildKeepWalls(editor.map));
}

/** Names for the tool box: the structure, the eraser, or the Map tab's item. */
export function toolName(editor: Editor, ui: UiState): string {
  if (ui.tool === "sell") return "Eraser";
  if (ui.tool !== null) return STRUCTURES[ui.tool].name;
  if (editor.item !== null) return itemName(editor.item);
  return "Choose a tool";
}
