import type { Facing, PlayerId, Point, StructureKind } from "../sim/types";
import { createCamera, type Camera } from "./camera";
import type { StatId } from "./stats";

export type Tool = StructureKind | "sell";

export function isBuildTool(tool: Tool | null): tool is StructureKind {
  return tool !== null && tool !== "sell";
}

export interface ToolDef {
  tool: Tool;
  key: string; // KeyboardEvent.code
  label: string;
  /** Click-and-drag places along the dragged tiles. */
  paintable: boolean;
}

export const TOOLS: ToolDef[] = [
  { tool: "wall", key: "Digit1", label: "1", paintable: true },
  { tool: "archer", key: "Digit2", label: "2", paintable: false },
  { tool: "cannon", key: "Digit3", label: "3", paintable: false },
  { tool: "catapult", key: "Digit4", label: "4", paintable: false },
  { tool: "floorSpikes", key: "Digit5", label: "5", paintable: true },
  { tool: "wallSpikes", key: "Digit6", label: "6", paintable: true },
  { tool: "house", key: "Digit7", label: "7", paintable: false },
  { tool: "timberYard", key: "KeyT", label: "T", paintable: false },
  { tool: "mine", key: "KeyG", label: "G", paintable: false },
  { tool: "foragerHut", key: "KeyB", label: "B", paintable: false },
  { tool: "bridge", key: "Digit8", label: "8", paintable: true },
  { tool: "watchtower", key: "Digit9", label: "9", paintable: false },
  { tool: "sell", key: "KeyX", label: "X", paintable: true },
];

export interface UiState {
  tool: Tool | null;
  hover: Point | null;
  message: string;
  messageUntil: number;
  /** Debug overlay: show the flow field direction on every tile. */
  showFlow: boolean;
  /** Facing for directional structures, rotated with R. */
  facing: Facing;
  /** The player this screen acts as. Always 1 offline. */
  playerId: PlayerId;
  /** The view onto the map: scroll position and zoom. */
  camera: Camera;
  /** Which stats the HUD shows, a box each (toggled in its menu). Never empty. */
  hudStats: StatId[];
  /** Arrow keys (or WASD) held down, for smooth panning. */
  panKeys: { left: boolean; right: boolean; up: boolean; down: boolean };
}

export function createUiState(): UiState {
  return {
    tool: null,
    hover: null,
    message: "",
    messageUntil: 0,
    showFlow: false,
    facing: "N",
    playerId: 1,
    camera: createCamera(),
    hudStats: ["gold"],
    panKeys: { left: false, right: false, up: false, down: false },
  };
}

const ROTATION: Facing[] = ["N", "E", "S", "W"];

export function rotateFacing(ui: UiState) {
  ui.facing = ROTATION[(ROTATION.indexOf(ui.facing) + 1) % ROTATION.length];
}

const MESSAGE_MS = 2000;

export function showMessage(ui: UiState, message: string) {
  ui.message = message;
  ui.messageUntil = performance.now() + MESSAGE_MS;
}
