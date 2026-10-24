import type { Point, StructureKind } from "../sim/types";

export type Tool = StructureKind;

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
];

export interface UiState {
  tool: Tool | null;
  hover: Point | null;
  message: string;
  messageUntil: number;
  /** Debug overlay: show the flow field direction on every tile. */
  showFlow: boolean;
}

export function createUiState(): UiState {
  return { tool: null, hover: null, message: "", messageUntil: 0, showFlow: false };
}

const MESSAGE_MS = 2000;

export function showMessage(ui: UiState, message: string) {
  ui.message = message;
  ui.messageUntil = performance.now() + MESSAGE_MS;
}
