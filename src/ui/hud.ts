// The HUD along the bottom of the map: the selected tool, and what it costs and how long it
// takes to build on the tile under the cursor (bottom left), and a box for each stat you've turned on, gold to start with
// (bottom right, side by side). Clicking the tool opens a menu above it to pick another;
// clicking any stat box opens the stat menu, where each stat toggles on and off. Clicks
// anywhere else pass through to the map.
import { SELL_REFUND, STRUCTURES, TICK_RATE, type StructureStats } from "../sim/config";
import { buildTicksAt } from "../sim/building";
import { discountAt, priceAt } from "../sim/enclosures";
import { refundFor } from "../sim/economy";
import { ownedCount, topAt } from "../sim/grid";
import type { GameState, PlayerId, StructureKind } from "../sim/types";
import { ARROW_SYMBOLS, GLYPHS, glyphFor } from "../render/palette";
import { BUILD_TABS, TOOLS, isBuildTool, pickerLayout, type BuildTab, type UiState } from "./state";
import { statList, type Stat, type StatId } from "./stats";
import { buildHints, describeKind, traits } from "./describe";

export interface HudContent {
  /** The selected tool, or null with none selected. */
  tool: { glyph: string; name: string } | null;
  /** What it costs here, e.g. "3g (50% off)", or what selling here pays; null if nothing. */
  cost: string | null;
  /** How long it takes to build on the hovered tile, e.g. "4.5s"; null off the map. */
  time: string | null;
  /** True if you can't afford it here: the gold shows red. */
  short: boolean;
  gold: number;
}

/** What the HUD shows. Prices are for the hovered tile, or full price off the map. */
export function hudContent(state: GameState, ui: UiState): HudContent {
  // With infinite money (debug) everything is affordable.
  const gold = state.debug.infiniteGold ? Infinity : (state.players[ui.playerId]?.gold ?? 0);
  if (ui.tool === "sell") {
    const target = ui.hover ? topAt(state, ui.hover.x, ui.hover.y) : undefined;
    return {
      tool: { glyph: "$", name: "Sell" },
      cost: target ? `+${refundFor(target)}g` : null,
      time: null,
      short: false,
      gold,
    };
  }
  if (!isBuildTool(ui.tool)) return { tool: null, cost: null, time: null, short: false, gold };
  const kind = ui.tool;
  const stats: StructureStats = STRUCTURES[kind];
  const tool = { glyph: glyphFor(kind, ui.facing), name: stats.name };
  if (!ui.hover) {
    return { tool, cost: `${stats.cost}g`, time: null, short: gold < stats.cost, gold };
  }
  const { x, y } = ui.hover;
  const price = priceAt(state, kind, x, y, ui.playerId);
  const discount = discountAt(state, x, y, ui.playerId);
  const cost = discount > 0 ? `${price}g (${Math.round(discount * 100)}% off)` : `${price}g`;
  const time = `${(buildTicksAt(state, x, y, ui.playerId) / TICK_RATE).toFixed(1)}s`;
  return { tool, cost, time, short: gold < price, gold };
}

/**
 * How many of a limited kind the player has, out of the most they can: "2/5". Null when it has
 * no limit (nothing is shown then), or can't be built at all (it isn't offered).
 */
export function limitLabel(state: GameState, player: PlayerId, kind: StructureKind): string | null {
  const limit = state.limits[kind];
  if (limit === undefined || limit === 0) return null;
  return `${ownedCount(state, player, kind)}/${limit}`;
}

/** Whether the game lets this kind be built at all (an items file can rule it out). */
export function allowed(state: GameState, kind: StructureKind): boolean {
  return state.limits[kind] !== 0;
}

/** The build tools this game offers (sell not counted), in the picker's order. */
export function offeredTools(state: GameState, tab?: BuildTab): StructureKind[] {
  return TOOLS.filter((t) => tab === undefined || t.tab === tab)
    .map((t) => t.tool)
    .filter((tool): tool is StructureKind => isBuildTool(tool) && allowed(state, tool));
}

/** What a build picker item's tooltip card says, top to bottom. */
export interface PickerCard {
  /** Glyph and name, e.g. "C Cannon". */
  title: string;
  /** Full price, and the limit if an items file sets one: "50g · 2/5". */
  cost: string;
  description: string;
  numbers: string[];
  /** Short trait words joined: "Splash damage · Turns slowly". Empty when it has none. */
  traits: string;
  hints: string[];
}

export function pickerCard(state: GameState, player: PlayerId, kind: StructureKind): PickerCard {
  const { title, description, numbers } = describeKind({ type: "structure", kind });
  const limit = limitLabel(state, player, kind);
  return {
    title: `${GLYPHS[kind]} ${title}`,
    cost: `${STRUCTURES[kind].cost}g${limit ? ` · ${limit}` : ""}`,
    description,
    numbers,
    traits: traits(kind).join(" · "),
    hints: buildHints(kind),
  };
}

/** Fills the tooltip card element with a picker item's card. */
function renderCard(root: HTMLElement, card: PickerCard) {
  const line = (className: string, text: string) =>
    Object.assign(document.createElement("p"), { className, textContent: text });
  const head = document.createElement("p");
  head.className = "card-head";
  head.append(
    Object.assign(document.createElement("strong"), { textContent: card.title }),
    Object.assign(document.createElement("span"), { textContent: card.cost }),
  );
  root.replaceChildren(
    head,
    line("card-description", card.description),
    ...card.numbers.map((n) => line("card-numbers", n)),
    ...(card.traits ? [line("card-traits", card.traits)] : []),
    ...card.hints.map((h) => line("card-hint", h)),
  );
}

/** Space between a picker button and its card, in pixels. */
const CARD_GAP_PX = 14;

/** The build time the HUD shows, and the tool it was for. */
export interface ShownTime {
  tool: UiState["tool"];
  text: string;
}

/**
 * The build time to show: the new one if there is one, else the last one while the same tool
 * is selected, so the box doesn't vanish (and shift Pause and fast forward along under the
 * pointer) every time the pointer leaves the map. Null once another tool is picked.
 */
export function heldTime(
  shown: ShownTime | null,
  tool: UiState["tool"],
  time: string | null,
): ShownTime | null {
  if (time !== null) return { tool, text: time };
  return shown?.tool === tool ? shown : null;
}

/**
 * The stats the HUD shows, in the menu's order: the ones turned on that this game has (PvP
 * has no waves), or gold if none of them are.
 */
export function hudStats(state: GameState, ui: UiState): Stat[] {
  const stats = statList(state, ui.playerId);
  const shown = stats.filter((s) => ui.hudStats.includes(s.id));
  return shown.length > 0 ? shown : [stats[0]];
}

/** Turns a stat on or off in the HUD, keeping at least one on. */
export function toggleHudStat(ui: UiState, id: StatId): void {
  if (!ui.hudStats.includes(id)) ui.hudStats = [...ui.hudStats, id];
  else if (ui.hudStats.length > 1) ui.hudStats = ui.hudStats.filter((s) => s !== id);
}

export function createHud(root: HTMLElement, ui: UiState) {
  root.innerHTML = `
    <div class="hud-left">
      <div class="hud-picker tools" data-field="picker" hidden>
        <div class="build-tabs" role="tablist">
          ${BUILD_TABS.map(
            (t) => `
            <button class="build-tab" role="tab" data-tab="${t.tab}">
              ${t.name} <kbd>${t.label}</kbd>
            </button>`,
          ).join("")}
        </div>
        ${TOOLS.map(
          (t, i) => `
          ${
            // One-list layout: a section label before each tab's first tool.
            t.tab !== "all" && TOOLS[i - 1]?.tab !== t.tab
              ? `<p class="picker-section" data-section="${t.tab}" hidden>${BUILD_TABS.find((b) => b.tab === t.tab)!.name}</p>`
              : ""
          }
          <button class="tool" data-tool="${t.tool}" data-tab="${t.tab}">
            <span class="glyph">${isBuildTool(t.tool) ? GLYPHS[t.tool] : "$"}</span>
            <span class="name">${isBuildTool(t.tool) ? STRUCTURES[t.tool].name : "Sell"}</span>
            <span class="cost">${isBuildTool(t.tool) ? `${STRUCTURES[t.tool].cost}g` : `${SELL_REFUND * 100}%`}</span>
            ${t.label ? `<kbd>${t.label}</kbd>` : '<span class="limit"></span>'}
          </button>`,
        ).join("")}
      </div>
      <div class="picker-card" data-field="card" role="tooltip" hidden></div>
      <button class="hud-box hud-tool" data-field="tool" title="Choose what to build">
        <span class="hud-glyph" data-field="glyph"></span>
        <span data-field="name"></span>
      </button>
      <div class="hud-box hud-cost" data-field="cost"></div>
      <div class="hud-box hud-cost" data-field="time" title="Time to build here"></div>
      <div class="hud-actions" data-field="actions"></div>
    </div>
    <div class="hud-right">
      <div class="hud-picker hud-stat-picker tools" data-field="statPicker" hidden></div>
      <div class="hud-stats" data-field="stats"></div>
    </div>
  `;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const toolBox = field("tool");
  const picker = field("picker");
  const glyph = field("glyph");
  const name = field("name");
  const cost = field("cost");
  const time = field("time");
  let shownTime: ShownTime | null = null;
  const statBoxes = field("stats");
  const statPicker = field("statPicker");
  /** The stat boxes by id, rebuilt only when the set shown changes. */
  let boxes = new Map<string, { box: HTMLButtonElement; value: HTMLElement }>();
  /** The stat menu's rows by id, rebuilt only when the set of stats changes (PvP differs). */
  let statRows = new Map<string, HTMLButtonElement>();
  const toolButtons = [...picker.querySelectorAll<HTMLButtonElement>("[data-tool]")];
  const card = field("card");
  /** The game the card describes (its limits and counts), kept from the last update. */
  let cardState: GameState | null = null;
  /** Shows the card beside a picker button, pointing at it, kept inside the window. */
  function showCard(button: HTMLButtonElement) {
    const tool = button.dataset.tool as UiState["tool"];
    if (!isBuildTool(tool) || !cardState) return hideCard();
    renderCard(card, pickerCard(cardState, ui.playerId, tool));
    card.hidden = false;
    const at = button.getBoundingClientRect();
    const box = picker.getBoundingClientRect();
    const height = card.offsetHeight;
    const top = Math.max(8, Math.min(at.top + at.height / 2 - 24, window.innerHeight - height - 8));
    card.style.left = `${box.right + CARD_GAP_PX}px`;
    card.style.top = `${top}px`;
    // The pointer on the card's left edge lines up with the button's middle.
    card.style.setProperty("--card-arrow", `${at.top + at.height / 2 - top}px`);
  }
  function hideCard() {
    card.hidden = true;
  }
  for (const button of toolButtons) {
    button.addEventListener("pointerenter", () => showCard(button));
    button.addEventListener("focus", () => showCard(button));
    button.addEventListener("blur", hideCard);
  }
  picker.addEventListener("pointerleave", hideCard);
  const tabButtons = [...picker.querySelectorAll<HTMLButtonElement>(".build-tab")];
  const tabBar = picker.querySelector<HTMLElement>(".build-tabs")!;
  const sections = [...picker.querySelectorAll<HTMLElement>("[data-section]")];
  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      ui.tab = button.dataset.tab as BuildTab;
      button.blur();
    });
  }

  // Each box opens and closes its menu (and closes the other one); picking something, or
  // clicking anywhere else, closes it.
  toolBox.addEventListener("click", () => {
    picker.hidden = !picker.hidden;
    statPicker.hidden = true;
    toolBox.blur(); // so Space only ever toggles pause
  });
  // Every stat box opens the same menu.
  statBoxes.addEventListener("click", (e) => {
    const box = (e.target as HTMLElement).closest("button");
    if (!box) return;
    statPicker.hidden = !statPicker.hidden;
    picker.hidden = true;
    box.blur();
  });
  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool as UiState["tool"];
      ui.tool = ui.tool === tool ? null : tool;
      picker.hidden = true;
      button.blur();
    });
  }
  document.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".hud-left")) picker.hidden = true;
    if (!target.closest(".hud-right")) statPicker.hidden = true;
  });

  /** One box per stat shown, side by side; rebuilt only when which stats are on changes. */
  function updateStatBoxes(shown: Stat[], short: boolean) {
    if (shown.map((s) => s.id).join() !== [...boxes.keys()].join()) {
      boxes = new Map();
      statBoxes.replaceChildren(
        ...shown.map((s) => {
          const box = document.createElement("button");
          box.className = "hud-box hud-stat";
          box.title = "Choose which stats to show";
          const label = document.createElement("span");
          label.textContent = `${s.label} `;
          const value = document.createElement("strong");
          box.append(label, value);
          boxes.set(s.id, { box, value });
          return box;
        }),
      );
    }
    for (const s of shown) {
      const { box, value } = boxes.get(s.id)!;
      value.textContent = s.value;
      // Red while you can't afford the selected tool here (the gold box only).
      box.classList.toggle("short", s.id === "gold" && short);
    }
  }

  /** The stat menu: every stat with its current value, highlighted when it's on. */
  function updateStatPicker(state: GameState) {
    const stats = statList(state, ui.playerId);
    if (stats.map((s) => s.id).join() !== [...statRows.keys()].join()) {
      statRows = new Map();
      statPicker.replaceChildren(
        ...stats.map((s) => {
          const row = document.createElement("button");
          row.className = "tool stat-choice";
          row.innerHTML = `<span class="name"></span><span class="cost"></span>`;
          // Toggling leaves the menu open, so several can be turned on in a row.
          row.addEventListener("click", () => {
            toggleHudStat(ui, s.id);
            row.blur();
          });
          statRows.set(s.id, row);
          return row;
        }),
      );
    }
    const on = new Set(hudStats(state, ui).map((s) => s.id));
    for (const s of stats) {
      const row = statRows.get(s.id)!;
      row.querySelector(".name")!.textContent = s.label;
      row.querySelector(".cost")!.textContent = s.value;
      row.classList.toggle("selected", on.has(s.id));
    }
  }

  return {
    /** Where the game's buttons go (Pause, fast forward), beside the tool. */
    actions: field("actions"),
    update(state: GameState | null) {
      root.hidden = state === null;
      if (!state) return;
      const hud = hudContent(state, ui);
      const damaging = ui.debugDamage && ui.tool === null;
      glyph.textContent = damaging ? "✸" : (hud.tool?.glyph ?? "+");
      const limit = isBuildTool(ui.tool) ? limitLabel(state, ui.playerId, ui.tool) : null;
      name.textContent = damaging
        ? "Damage (debug)"
        : `${hud.tool?.name ?? "Build"}${limit ? ` ${limit}` : ""}`;
      cost.hidden = hud.cost === null;
      cost.textContent = hud.cost ?? "";
      shownTime = heldTime(shownTime, ui.tool, hud.time);
      time.hidden = shownTime === null;
      time.textContent = shownTime?.text ?? "";
      updateStatBoxes(hudStats(state, ui), hud.short);
      if (!statPicker.hidden) updateStatPicker(state);
      if (ui.openPicker) {
        // 1, 2 or 3 was pressed: open the picker on that tab.
        ui.openPicker = false;
        picker.hidden = false;
        statPicker.hidden = true;
      }
      cardState = state;
      if (picker.hidden) {
        card.hidden = true;
        return;
      }
      // Few kinds offered: one list with section labels; otherwise tabs, minus the empty ones.
      const row = pickerLayout(offeredTools(state).length) === "row";
      tabBar.hidden = row;
      const withTools = BUILD_TABS.filter((t) => offeredTools(state, t.tab).length > 0);
      if (!row && withTools.length > 0 && !withTools.some((t) => t.tab === ui.tab)) {
        ui.tab = withTools[0].tab;
      }
      for (const button of tabButtons) {
        button.hidden = !withTools.some((t) => t.tab === button.dataset.tab);
        button.setAttribute("aria-selected", String(button.dataset.tab === ui.tab));
      }
      for (const label of sections) {
        label.hidden = !row || offeredTools(state, label.dataset.section as BuildTab).length === 0;
      }
      for (const button of toolButtons) {
        const tool = button.dataset.tool as UiState["tool"];
        // Arrow-drawn tools (wall spikes, archers) show the way they'll face (R rotates).
        if (isBuildTool(tool) && ARROW_SYMBOLS[tool]) {
          const g = button.querySelector<HTMLElement>(".glyph")!;
          const arrow = glyphFor(tool, ui.facing);
          if (g.textContent !== arrow) g.textContent = arrow;
        }
        // Anything can be picked: what it costs depends on where it goes (an enclosure may
        // make it cheaper), and placing it checks the price there.
        button.classList.toggle("selected", tool === ui.tool);
        const tab = button.dataset.tab;
        // An items file can rule a kind out (not offered) or cap it (shows "2/5").
        const offered = !isBuildTool(tool) || allowed(state, tool);
        button.hidden = !offered || (!row && tab !== "all" && tab !== ui.tab);
        if (isBuildTool(tool)) {
          const count = button.querySelector<HTMLElement>(".limit")!;
          const text = limitLabel(state, ui.playerId, tool) ?? "";
          if (count.textContent !== text) count.textContent = text;
        }
      }
    },
  };
}
