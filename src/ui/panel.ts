// The game's buttons in the HUD, beside the tool: Pause, fast forward and (by day, with enemies
// at night) Skip to night: votes in co-op. Also the Keys panel (in the sidebar with Map and Info,
// shown from View), and the status line at the top of the map: the last message (a refused
// build...) or that the game is paused.
import type { Command, GameState } from "../sim/types";
import type { Action } from "./controls";
import { keyText } from "./keyLabels";
import type { UiState } from "./state";
import { canSkipToNight, hasVoted, voteLabel } from "./votes";

/** The Keys panel's list: what each action is called there. */
const HELP: [Action, string][] = [
  ["pause", "pause"],
  ["fastForward", "fast"],
  ["rotate", "rotate"],
  ["rotateBack", "rotate back"],
  ["toggleSell", "sell"],
  ["debugMenu", "debug"],
  ["journal", "journal"],
  ["cancel", "cancel"],
];

/** The Keys panel's first line for the device in use: buttons, then how to point and move. */
export function helpLine(ui: UiState): string {
  const key = (action: Action) => keyText(ui, action);
  const buttons = HELP.filter(([action]) => key(action)).map(([a, what]) => `${key(a)} ${what}`);
  const scheme = ui.schemes[ui.device];
  if (scheme.device === "keyboard") {
    buttons.push("drag to paint", "WASD or arrows move", "wheel or +/- zoom");
  } else {
    const { cursorStick, panStick } = scheme.feel;
    buttons.push(
      `${key("place")} place or pick (hold to paint)`,
      `${key("menu")} build menu`,
      `${cursorStick} stick point`,
      `d-pad a tile at a time (in the menu, both: items and tabs)`,
      `${panStick} stick move`,
      `${key("zoomOut")}/${key("zoomIn")} zoom`,
    );
  }
  return buttons.join(" · ");
}

export function createPanel(
  elements: { actions: HTMLElement; keys: HTMLElement; status: HTMLElement },
  ui: UiState,
  dispatch: (command: Command) => void,
) {
  const { actions: root, keys, status } = elements;
  root.innerHTML = `
    <div class="hud-box hud-segment">
      <button class="hud-action" data-action="pause">||</button>
      <button class="hud-action" data-action="fastForward">&gt;&gt;</button>
      <button class="hud-action" data-action="skipToNight" title="Ready for enemies: skip the rest of the day to the evening" hidden></button>
    </div>
  `;
  keys.innerHTML = `
    <p class="help" data-field="keys"></p>
    <p class="help">Shaded: cheaper building inside walls</p>
  `;
  const keysLine = keys.querySelector<HTMLElement>('[data-field="keys"]')!;
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  const fastForwardButton = root.querySelector<HTMLButtonElement>('[data-action="fastForward"]')!;
  const skipButton = root.querySelector<HTMLButtonElement>('[data-action="skipToNight"]')!;

  // Drop focus after a click so Space only ever toggles pause, never re-presses a button.
  root.addEventListener("click", (e) => {
    (e.target as HTMLElement).closest("button")?.blur();
  });
  pauseButton.addEventListener("click", () => dispatch({ type: "togglePause" }));
  fastForwardButton.addEventListener("click", () => dispatch({ type: "toggleFastForward" }));
  skipButton.addEventListener("click", () => dispatch({ type: "voteSkipToNight" }));

  return {
    update(state: GameState) {
      // With several players these are votes: show yours, and how many have voted.
      // Symbols, like fast forward's: || to pause, > to play again.
      pauseButton.textContent = state.paused ? ">" : voteLabel(state, "pause", "||");
      // "(Space)" after a title, or nothing on a device that doesn't bind it.
      const keyHint = (action: Action) => (keyText(ui, action) ? ` (${keyText(ui, action)})` : "");
      const pauseKey = keyText(ui, "pause");
      pauseButton.title = `${state.paused ? "Resume" : "Pause"}${keyHint("pause")}`;
      fastForwardButton.title = `Fast forward${keyHint("fastForward")}`;
      const help = helpLine(ui);
      if (keysLine.textContent !== help) keysLine.textContent = help;
      pauseButton.classList.toggle(
        "selected",
        !state.paused && hasVoted(state, ui.playerId, "pause"),
      );
      fastForwardButton.textContent = voteLabel(state, "fastForward", ">>");
      fastForwardButton.classList.toggle("selected", hasVoted(state, ui.playerId, "fastForward"));
      skipButton.hidden = !canSkipToNight(state);
      skipButton.textContent = voteLabel(state, "skipToNight", "Skip to night");
      skipButton.classList.toggle("selected", hasVoted(state, ui.playerId, "skipToNight"));
      const message =
        performance.now() < ui.messageUntil
          ? ui.message
          : state.paused
            ? pauseKey
              ? `PAUSED - press ${pauseKey}`
              : "PAUSED"
            : "";
      status.textContent = message;
      status.hidden = message === "";
    },
  };
}
