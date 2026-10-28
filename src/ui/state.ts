import { PICKER } from "../sim/config";
import type { Facing, PlayerId, Point, StructureKind } from "../sim/types";
import { createCamera, type Camera } from "./camera";
import type { Rotation } from "../render/rotation";
import type { StatId } from "./stats";
import { defaultViewPrefs } from "./viewPrefs";
import { DEFAULT_SUN, type Sun } from "../render/sun";

export type Tool = StructureKind | "sell";

export function isBuildTool(tool: Tool | null): tool is StructureKind {
  return tool !== null && tool !== "sell";
}

/**
 * The build picker's tabs, opened by clicking or with 1, 2, 3: Towers (static defences and the
 * walls they stand on), Units (buildings that send units out) and Civic (the town).
 */
export type BuildTab = "towers" | "units" | "civic";

export const BUILD_TABS: { tab: BuildTab; name: string; key: string; label: string }[] = [
  { tab: "towers", name: "Towers", key: "Digit1", label: "1" },
  { tab: "units", name: "Units", key: "Digit2", label: "2" },
  { tab: "civic", name: "Civic", key: "Digit3", label: "3" },
];

export interface ToolDef {
  tool: Tool;
  /** Which tab it's in; "all" shows on every tab (sell). */
  tab: BuildTab | "all";
  /** The small subtitle it's listed under in its tab, if the tab has any. */
  group?: string;
  /** A key that picks it (KeyboardEvent.code). Only sell has one: tools are picked by click. */
  key?: string;
  label?: string;
  /** Click-and-drag places along the dragged tiles. */
  paintable: boolean;
}

export const TOOLS: ToolDef[] = [
  { tool: "wall", tab: "towers", group: "Walls", paintable: true },
  { tool: "gate", tab: "towers", group: "Walls", paintable: true },
  { tool: "bridge", tab: "towers", group: "Walls", paintable: true },
  { tool: "watchtower", tab: "towers", group: "Walls", paintable: false },
  { tool: "archer", tab: "towers", group: "Towers", paintable: false },
  { tool: "cannon", tab: "towers", group: "Towers", paintable: false },
  { tool: "catapult", tab: "towers", group: "Towers", paintable: false },
  { tool: "floorSpikes", tab: "towers", group: "Towers", paintable: true },
  { tool: "wallSpikes", tab: "towers", group: "Towers", paintable: true },
  // Static units guard the tiles in front of their building; exploring ones go out.
  { tool: "guardhouse", tab: "units", group: "Static", paintable: false },
  { tool: "archeryPost", tab: "units", group: "Static", paintable: false },
  { tool: "paladinHall", tab: "units", group: "Static", paintable: false },
  { tool: "scoutCamp", tab: "units", group: "Exploring", paintable: false },
  { tool: "barracks", tab: "units", group: "Exploring", paintable: false },
  { tool: "archeryRange", tab: "units", group: "Exploring", paintable: false },
  { tool: "house", tab: "civic", paintable: false },
  { tool: "shop", tab: "civic", paintable: false },
  { tool: "farmhouse", tab: "civic", paintable: false },
  { tool: "farmland", tab: "civic", paintable: true },
  { tool: "foragerHut", tab: "civic", paintable: false },
  { tool: "timberYard", tab: "civic", paintable: false },
  { tool: "mine", tab: "civic", paintable: false },
  { tool: "sell", tab: "all", key: "KeyX", label: "X", paintable: true },
];

/** The tools shown on a tab, in order (sell last, on every tab). */
export function toolsInTab(tab: BuildTab): ToolDef[] {
  return TOOLS.filter((t) => t.tab === tab || t.tab === "all");
}

/** Whether a tab has anything to build. */
export function hasBuildTools(tab: BuildTab): boolean {
  return TOOLS.some((t) => t.tab === tab);
}

/** One list (few kinds offered) or three tabs (see PICKER). Sell isn't counted. */
export function pickerLayout(offered: number): "row" | "tabs" {
  return offered <= PICKER.oneRowMax ? "row" : "tabs";
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
  /** Where the sun is, for shadows (see render/sun.ts). */
  sun: Sun;
  /** Debug: the day and night clock (render/dayNight.ts), or null when it's off. */
  clock: { hour: number; playing: boolean } | null;
  /** Debug Damage tool: clicks wear down what's on the tile (offline only). Picking a tool ends it. */
  debugDamage: boolean;
  /** Facing for directional structures, rotated with R. */
  facing: Facing;
  /** The player this screen acts as. Always 1 offline. */
  playerId: PlayerId;
  /** The view onto the map: scroll position and zoom, in the turned view's tiles. */
  camera: Camera;
  /** Quarter turns the view is turned: 0, or 2 once flipped (Q). The camera works in the view. */
  rotation: Rotation;
  /** Which stats the HUD shows, a box each (toggled in its menu). Never empty. */
  hudStats: StatId[];
  /** The build picker tab showing. */
  tab: BuildTab;
  /** Whether the game's build picker is open (the HUD shows it; number keys pick from it). */
  pickerOpen: boolean;
  /** The map editor: set by 1/2/3 to ask its toolbar to open on `tab`; the toolbar clears it. */
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
    sun: { ...DEFAULT_SUN },
    clock: null,
    debugDamage: false,
    facing: "N",
    playerId: 1,
    camera: createCamera(),
    rotation: 0,
    hudStats: defaultViewPrefs().hudStats,
    tab: "towers",
    pickerOpen: false,
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
