// The game's buttons in the HUD, beside the tool: Pause, fast forward and (by day, with enemies
// at night) Skip to night: votes in co-op. Also the Keys panel (in the sidebar with Map and Info,
// shown from View), and the status line at the top of the map: the last message (a refused
// build...) or that the game is paused.
import type { Command, GameState } from "../sim/types";
import type { UiState } from "./state";
import { canSkipToNight, hasVoted, voteLabel } from "./votes";

export function createPanel(
  elements: { actions: HTMLElement; keys: HTMLElement; status: HTMLElement },
  ui: UiState,
  dispatch: (command: Command) => void,
) {
  const { actions: root, keys, status } = elements;
  root.innerHTML = `
    <div class="hud-box hud-segment">
      <button class="hud-action" data-action="pause" title="Pause (Space)">||</button>
      <button class="hud-action" data-action="fastForward" title="Fast forward (F)">&gt;&gt;</button>
      <button class="hud-action" data-action="skipToNight" title="Ready for enemies: skip the rest of the day to the evening" hidden></button>
    </div>
  `;
  keys.innerHTML = `
    <p class="help">Space pause · F fast · R rotate · \` debug · J journal · Esc cancel · drag to paint · WASD or arrows move · wheel or +/- zoom</p>
    <p class="help">Shaded: cheaper building inside walls</p>
  `;
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
      pauseButton.title = state.paused ? "Resume (Space)" : "Pause (Space)";
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
            ? "PAUSED - press Space"
            : "";
      status.textContent = message;
      status.hidden = message === "";
    },
  };
}
