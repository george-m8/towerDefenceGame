import { PICKER } from "../sim/config";
import type { Facing, PlayerId, Point, StructureKind } from "../sim/types";
import { createCamera, type Camera } from "./camera";
import type { Rotation } from "../render/rotation";
import type { StatId } from "./stats";
import { defaultViewPrefs } from "./viewPrefs";
import { DEFAULT_SUN, type Sun } from "../render/sun";
import { DEFAULT_SCHEMES, type Action, type Device, type Schemes } from "./controls";

export type Tool = StructureKind | "sell";

export function isBuildTool(tool: Tool | null): tool is StructureKind {
  return tool !== null && tool !== "sell";
}

/** The build picker's tabs, opened by clicking or with their action (1, 2, 3 on a keyboard). */
export type BuildTab = "defence" | "civic" | "offence";

export const BUILD_TABS: { tab: BuildTab; name: string; action: Action }[] = [
  { tab: "defence", name: "Defence", action: "buildDefence" },
  { tab: "civic", name: "Civic", action: "buildCivic" },
  { tab: "offence", name: "Offence", action: "buildOffence" },
];

export interface ToolDef {
  tool: Tool;
  /** Which tab it's in; "all" shows on every tab (sell). */
  tab: BuildTab | "all";
  /** An action that picks it (see controls.ts). Only sell has one: tools are picked by click. */
  action?: Action;
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
  { tool: "sell", tab: "all", action: "sell", paintable: true },
];

/** The tools shown on a tab, in order (sell last, on every tab). */
export function toolsInTab(tab: BuildTab): ToolDef[] {
  return TOOLS.filter((t) => t.tab === tab || t.tab === "all");
}

/** Whether a tab has anything to build (Offence is empty until barracks exist). */
export function hasBuildTools(tab: BuildTab): boolean {
  return TOOLS.some((t) => t.tab === tab);
}

/** One list (few kinds offered) or three tabs (see PICKER). Sell isn't counted. */
export function pickerLayout(offered: number): "row" | "tabs" {
  return offered <= PICKER.oneRowMax ? "row" : "tabs";
}

export function tabForAction(action: Action): BuildTab | undefined {
  return BUILD_TABS.find((t) => t.action === action)?.tab;
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
  /** Debug: the controller test shown over the map (padTest.ts). */
  showPadTest: boolean;
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
  /**
   * Asks the HUD to open the picker on `tab` (1/2/3, or a pad stepping through tools) or close
   * it (a pad placing or cancelling, with no mouse to click elsewhere); the HUD clears it.
   */
  pickerRequest: "open" | "close" | null;
  /** Whether the build menu is open (the HUD keeps this), so a pad's A picks rather than places. */
  pickerOpen: boolean;
  /** Arrow keys (or WASD) held down, for smooth panning. */
  panKeys: { left: boolean; right: boolean; up: boolean; down: boolean };
  /** What the player last used: the HUD shows its buttons (controls.ts). */
  device: Device;
  /** Each device's bindings, faces and feel, with the player's remaps. */
  schemes: Schemes;
}

export function createUiState(): UiState {
  return {
    tool: null,
    hover: null,
    message: "",
    messageUntil: 0,
    showFlow: false,
    showSun: false,
    showPadTest: false,
    sun: { ...DEFAULT_SUN },
    clock: null,
    debugDamage: false,
    facing: "N",
    playerId: 1,
    camera: createCamera(),
    rotation: 0,
    hudStats: defaultViewPrefs().hudStats,
    tab: "defence",
    pickerRequest: null,
    pickerOpen: false,
    panKeys: { left: false, right: false, up: false, down: false },
    device: "keyboard",
    schemes: DEFAULT_SCHEMES,
  };
}

const ROTATION: Facing[] = ["N", "E", "S", "W"];

/** Turns the facing a quarter clockwise, or anticlockwise with `turns` -1. */
export function rotateFacing(ui: UiState, turns: 1 | -1 = 1) {
  const at = ROTATION.indexOf(ui.facing) + turns + ROTATION.length;
  ui.facing = ROTATION[at % ROTATION.length];
}

const MESSAGE_MS = 2000;

export function showMessage(ui: UiState, message: string) {
  ui.message = message;
  ui.messageUntil = performance.now() + MESSAGE_MS;
}
