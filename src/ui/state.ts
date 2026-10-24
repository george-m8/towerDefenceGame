import type { Facing, PlayerId, Point, StructureKind } from "../sim/types";

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
  { tool: "bridge", key: "Digit8", label: "8", paintable: true },
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
