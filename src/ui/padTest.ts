// The controller test (Debug menu): a small picture of the pad in use, laid out like one, with
// every button in its own face (B A Y X on a Switch pad) lighting up while it's held, how far
// the triggers are pulled, where the sticks are, and what the last button pressed does here.
// For checking a pad is read the way SPEC-controllers.md expects.
import { buttonActions, padDevice, type Action, type PadScheme, type Schemes } from "./controls";
import { buttonsDown, type PadSnapshot } from "./gamepad";
import type { UiState } from "./state";

/** Where each standard-mapping button sits in the picture: [row, column] of a 7x4 grid. */
const LAYOUT: [number, number][] = [
  [4, 6], // south
  [3, 7], // east
  [3, 5], // west
  [2, 6], // north
  [1, 2], // left bumper
  [1, 6], // right bumper
  [1, 1], // left trigger
  [1, 7], // right trigger
  [2, 3], // select
  [2, 5], // start
  [4, 3], // left stick press
  [4, 5], // right stick press
  [2, 2], // d-pad up
  [4, 2], // d-pad down
  [3, 1], // d-pad left
  [3, 3], // d-pad right
  [3, 4], // home
];

/** A Switch pad numbers its face buttons by label, so they sit elsewhere: A right, B bottom, X top, Y left. */
const SWITCH_FACES: [number, number][] = [
  [3, 7],
  [4, 6],
  [2, 6],
  [3, 5],
];

export interface PadTestCell {
  index: number;
  text: string;
  name: string;
  row: number;
  column: number;
  down: boolean;
  /** How far it's pressed, 0..1 (triggers are analog). */
  value: number;
  actions: Action[];
}

/** Every button the picture shows, with its face on this pad and whether it's held. */
export function padTestCells(scheme: PadScheme, pad: PadSnapshot): PadTestCell[] {
  const down = buttonsDown(pad);
  const layout = scheme.device === "switch" ? [...SWITCH_FACES, ...LAYOUT.slice(4)] : LAYOUT;
  return layout.map(([row, column], index) => {
    const face = scheme.faces[index] ?? { text: `#${index}`, name: `Button ${index}` };
    return {
      index,
      text: face.text,
      name: face.name,
      row,
      column,
      down: down[index] ?? false,
      value: pad.buttons[index]?.value ?? 0,
      actions: buttonActions(scheme, index),
    };
  });
}

/** The first connected pad, and its scheme. */
function connectedPad(schemes: Schemes): { pad: Gamepad; scheme: PadScheme } | null {
  const pads =
    typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
  // Some browsers keep a pad's slot after it disconnects, marked not connected.
  const pad = [...pads].find((p): p is Gamepad => p !== null && p.connected !== false);
  return pad ? { pad, scheme: schemes[padDevice(pad.id)] } : null;
}

/**
 * Why no pad shows: browsers only hand pads to a secure page (https or localhost), and only
 * once a button has been pressed while the page has focus, again after every reload.
 */
export function noPadHint(secure: boolean, lastEvent: string): string {
  if (!secure) return "No controller: pads need https or localhost, not a LAN address";
  const hint = "No controller: press a button with this tab focused";
  return lastEvent ? `${hint} (last: ${lastEvent})` : hint;
}

export function createPadTest(root: HTMLElement, ui: UiState) {
  root.innerHTML = `
    <p class="pad-test-name" data-field="name"></p>
    <div class="pad-test-grid" data-field="grid"></div>
    <div class="pad-test-sticks">
      <span class="pad-test-stick"><i data-stick="left"></i></span>
      <span class="pad-test-stick"><i data-stick="right"></i></span>
    </div>
    <p class="pad-test-last" data-field="last"></p>
    <p class="pad-test-last" data-field="mapping"></p>
  `;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const grid = field("grid");
  const sticks = [...root.querySelectorAll<HTMLElement>("[data-stick]")];
  /** The cells by button index, rebuilt when a different family of pad is plugged in. */
  let cells: HTMLElement[] = [];
  let shownScheme: PadScheme | null = null;
  let wasDown: boolean[] = [];
  let last = "";
  /** The browser's last word on pads coming and going, for when one goes missing. */
  let lastEvent = "";
  window.addEventListener("gamepadconnected", (e) => {
    lastEvent = `connected ${e.gamepad.id}`;
  });
  window.addEventListener("gamepaddisconnected", (e) => {
    lastEvent = `disconnected ${e.gamepad.id}`;
  });

  return {
    /** Shown while switched on (Debug menu); reads the pad each frame while it is. */
    update() {
      root.hidden = !ui.showPadTest;
      if (!ui.showPadTest) return;
      const found = connectedPad(ui.schemes);
      if (!found) {
        field("name").textContent = noPadHint(window.isSecureContext, lastEvent);
        field("last").textContent = "";
        field("mapping").textContent = "";
        grid.hidden = true;
        return;
      }
      const { pad, scheme } = found;
      grid.hidden = false;
      const name = `${scheme.name} · ${pad.id}`;
      if (field("name").textContent !== name) field("name").textContent = name;
      const state = padTestCells(scheme, pad);
      if (scheme !== shownScheme) {
        shownScheme = scheme;
        cells = state.map((c) => {
          const cell = document.createElement("span");
          cell.className = "pad-test-button";
          cell.textContent = c.text;
          cell.title = `${c.name} (button ${c.index})`;
          cell.style.gridArea = `${c.row} / ${c.column}`;
          return cell;
        });
        grid.replaceChildren(...cells);
      }
      for (const c of state) {
        const cell = cells[c.index];
        cell.classList.toggle("down", c.down);
        // Triggers fill from the bottom as they're pulled.
        cell.style.setProperty("--pull", `${Math.round(c.value * 100)}%`);
        if (c.down && !wasDown[c.index]) {
          const does = c.actions.length > 0 ? c.actions.join(", ") : "nothing here";
          last = `${c.text} (button ${c.index}): ${does}`;
        }
      }
      wasDown = state.map((c) => c.down);
      field("last").textContent = last || "Press a button";
      // Without the standard mapping the buttons could be anywhere, so the game ignores them.
      field("mapping").textContent =
        pad.mapping === "standard"
          ? ""
          : `Mapping "${pad.mapping}": not standard, so the game ignores this pad`;
      sticks.forEach((dot, i) => {
        const [x, y] = [pad.axes[i * 2] ?? 0, pad.axes[i * 2 + 1] ?? 0];
        dot.style.left = `${50 + x * 50}%`;
        dot.style.top = `${50 + y * 50}%`;
        dot.parentElement!.classList.toggle("down", state[10 + i]?.down ?? false);
      });
    },
  };
}
