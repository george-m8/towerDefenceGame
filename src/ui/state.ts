import type { Facing, PlayerId, Point, StructureKind } from "../sim/types";
import { createCamera, type Camera } from "./camera";
import type { StatId } from "./stats";
import { DEFAULT_SUN } from "../render/sun";

export type Tool = StructureKind | "sell";

export function isBuildTool(tool: Tool | null): tool is StructureKind {
  return tool !== null && tool !== "sell";
}

/** The build picker's tabs, opened by clicking or with 1, 2, 3. */
export type BuildTab = "defence" | "civic" | "offence";

export const BUILD_TABS: { tab: BuildTab; name: string; key: string; label: string }[] = [
  { tab: "defence", name: "Defence", key: "Digit1", label: "1" },
  { tab: "civic", name: "Civic", key: "Digit2", label: "2" },
  { tab: "offence", name: "Offence", key: "Digit3", label: "3" },
];

export interface ToolDef {
  tool: Tool;
  /** Which tab it's in; "all" shows on every tab (sell). */
  tab: BuildTab | "all";
  /** A key that picks it (KeyboardEvent.code). Only sell has one: tools are picked by click. */
  key?: string;
  label?: string;
  /** Click-and-drag places along the dragged tiles. */
  paintable: boolean;
}

export const TOOLS: ToolDef[] = [
  { tool: "wall", tab: "defence", paintable: true },
  { tool: "archer", tab: "defence", paintable: false },
  { tool: "cannon", tab: "defence", paintable: false },
  { tool: "catapult", tab: "defence", paintable: false },
  { tool: "floorSpikes", tab: "defence", paintable: true },
  { tool: "wallSpikes", tab: "defence", paintable: true },
  { tool: "bridge", tab: "defence", paintable: true },
  { tool: "watchtower", tab: "defence", paintable: false },
  { tool: "gate", tab: "defence", paintable: true },
  { tool: "guardhouse", tab: "defence", paintable: false },
  { tool: "archeryPost", tab: "defence", paintable: false },
  { tool: "paladinHall", tab: "defence", paintable: false },
  { tool: "house", tab: "civic", paintable: false },
  { tool: "shop", tab: "civic", paintable: false },
  { tool: "farmhouse", tab: "civic", paintable: false },
  { tool: "farmland", tab: "civic", paintable: true },
  { tool: "timberYard", tab: "civic", paintable: false },
  { tool: "mine", tab: "civic", paintable: false },
  { tool: "foragerHut", tab: "civic", paintable: false },
  { tool: "scoutCamp", tab: "offence", paintable: false },
  { tool: "barracks", tab: "offence", paintable: false },
  { tool: "archeryRange", tab: "offence", paintable: false },
  { tool: "sell", tab: "all", key: "KeyX", label: "X", paintable: true },
];

/** The tools shown on a tab, in order (sell last, on every tab). */
export function toolsInTab(tab: BuildTab): ToolDef[] {
  return TOOLS.filter((t) => t.tab === tab || t.tab === "all");
}

/** Whether a tab has anything to build (Offence is empty until barracks exist). */
export function hasBuildTools(tab: BuildTab): boolean {
  return TOOLS.some((t) => t.tab === tab);
}

export function tabForKey(code: string): BuildTab | undefined {
  return BUILD_TABS.find((t) => t.key === code)?.tab;
}

export interface UiState {
  tool: Tool | null;
  hover: Point | null;
  message: string;
  messageUntil: number;
  /** Debug overlay: show the flow field direction on every tile. */
  showFlow: boolean;
  /** Debug: the sun slider shown over the map. */
  showSun: boolean;
  /** The time of day shadows are drawn for: 0 sunrise, 0.5 noon, 1 sunset (see render/sun.ts). */
  sun: number;
  /** Facing for directional structures, rotated with R. */
  facing: Facing;
  /** The player this screen acts as. Always 1 offline. */
  playerId: PlayerId;
  /** The view onto the map: scroll position and zoom. */
  camera: Camera;
  /** Which stats the HUD shows, a box each (toggled in its menu). Never empty. */
  hudStats: StatId[];
  /** The build picker tab showing. */
  tab: BuildTab;
  /** Set by 1/2/3 to ask the HUD to open the picker on `tab`; the HUD clears it. */
  openPicker: boolean;
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
    showSun: false,
    sun: DEFAULT_SUN,
    facing: "N",
    playerId: 1,
    camera: createCamera(),
    hudStats: ["gold"],
    tab: "defence",
    openPicker: false,
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
