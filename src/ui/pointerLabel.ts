// A small label floating above the block being placed: what it costs on that tile (green if you
// can afford it, red if not; a discounted price beside the full one, struck through), a faint
// "R ⟳" when the tool can be turned, and below that how long it takes to build there (white).
import { blockHeight } from "../render/canvas";
import { STRUCTURES } from "../sim/config";
import { priceAt } from "../sim/enclosures";
import type { GameState, Point } from "../sim/types";
import { tileToScreen } from "./camera";
import { canRotate } from "./describe";
import { hudContent } from "./hud";
import { isBuildTool, type UiState } from "./state";

export interface PointerTags {
  /** e.g. "3g" */
  cost: string;
  /** True if you can't afford it here: the cost shows red. */
  short: boolean;
  /** e.g. "4.5s" */
  time: string;
  /** The full price when this tile's is discounted (shown struck through), else null. */
  fullCost: string | null;
  /** The tool turns with R: a faint hint shows. */
  rotate: boolean;
}

/** What the label shows, or null when nothing is being placed on the map. */
export function pointerTags(state: GameState, ui: UiState): PointerTags | null {
  if (!isBuildTool(ui.tool) || !ui.hover) return null;
  const { short, time } = hudContent(state, ui);
  const price = priceAt(state, ui.tool, ui.hover.x, ui.hover.y, ui.playerId);
  const full = STRUCTURES[ui.tool].cost;
  return {
    cost: `${price}g`,
    short,
    time: time ?? "",
    fullCost: price < full ? `${full}g` : null,
    rotate: canRotate(ui.tool),
  };
}

/**
 * Where the label sits, in screen pixels: the middle of the top edge of the hovered tile, lifted
 * like the ghost drawn there (it sits on top of whatever it's placed on).
 */
export function labelAnchor(state: GameState, ui: UiState): Point | null {
  if (!ui.hover) return null;
  const { x, y } = ui.hover;
  const top = tileToScreen(ui.camera, x + 0.5, y);
  return { x: top.x, y: top.y - blockHeight(state, x, y) * ui.camera.zoom };
}

/** The label, in `root` (the map's window, which the canvas fills). */
export function createPointerLabel(root: HTMLElement) {
  const label = document.createElement("div");
  label.className = "pointer-label";
  label.hidden = true;
  const full = document.createElement("s");
  full.className = "pointer-full";
  const cost = document.createElement("span");
  const rotate = document.createElement("span");
  rotate.className = "pointer-rotate";
  rotate.textContent = "R ⟳";
  rotate.title = "R to rotate";
  const time = document.createElement("span");
  time.className = "pointer-time";
  // The price row: [full price struck through] price [R ⟳], with the build time below.
  const price = document.createElement("span");
  price.className = "pointer-price";
  price.append(full, cost, rotate);
  label.append(price, time);
  root.append(label);

  return {
    update(state: GameState | null, ui: UiState) {
      const tags = state ? pointerTags(state, ui) : null;
      const anchor = state ? labelAnchor(state, ui) : null;
      label.hidden = tags === null || anchor === null;
      if (!tags || !anchor) return;
      full.hidden = tags.fullCost === null;
      full.textContent = tags.fullCost ?? "";
      cost.textContent = tags.cost;
      rotate.hidden = !tags.rotate;
      cost.className = tags.short ? "pointer-cost short" : "pointer-cost";
      time.textContent = tags.time;
      label.style.left = `${anchor.x}px`;
      label.style.bottom = `${root.clientHeight - anchor.y + LABEL_GAP_PX}px`;
    },
  };
}

/** Space between the label and the top of the block. */
const LABEL_GAP_PX = 2;
