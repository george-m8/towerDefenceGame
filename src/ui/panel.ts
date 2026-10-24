import { SELL_REFUND, STRUCTURES, TICK_RATE } from "../sim/config";
import { incomePerMinute } from "../sim/economy";
import type { Command, CommandResult, GameState } from "../sim/types";
import { GLYPHS } from "../render/palette";
import { TOOLS, isBuildTool, showMessage, type UiState } from "./state";

export function createPanel(
  root: HTMLElement,
  ui: UiState,
  dispatch: (command: Command) => CommandResult,
) {
  root.innerHTML = `
    <dl class="stats">
      <dt>Gold</dt><dd data-stat="gold"></dd>
      <dt>Income</dt><dd data-stat="income"></dd>
      <dt>Keep</dt><dd data-stat="keep"></dd>
      <dt>Wave</dt><dd data-stat="wave"></dd>
      <dt>Next</dt><dd data-stat="next"></dd>
    </dl>
    <div class="actions">
      <button class="button" data-action="sendWave">Send wave</button>
      <button class="button" data-action="pause">Pause</button>
    </div>
    <h2 class="section">Build</h2>
    <div class="tools">
      ${TOOLS.map(
        (t) => `
        <button class="tool" data-tool="${t.tool}">
          <span class="glyph">${isBuildTool(t.tool) ? GLYPHS[t.tool] : "$"}</span>
          <span class="name">${isBuildTool(t.tool) ? STRUCTURES[t.tool].name : "Sell"}</span>
          <span class="cost">${isBuildTool(t.tool) ? `${STRUCTURES[t.tool].cost}g` : `${SELL_REFUND * 100}%`}</span>
          <kbd>${t.label}</kbd>
        </button>`,
      ).join("")}
    </div>
    <p class="status" data-stat="status"></p>
  `;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-stat="${name}"]`)!;
  const gold = field("gold");
  const income = field("income");
  const keep = field("keep");
  const wave = field("wave");
  const next = field("next");
  const status = field("status");
  const sendWaveButton = root.querySelector<HTMLButtonElement>('[data-action="sendWave"]')!;
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  const toolButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-tool]")];

  sendWaveButton.addEventListener("click", () => {
    const result = dispatch({ type: "sendWave" });
    if (!result.ok) showMessage(ui, result.reason);
  });
  pauseButton.addEventListener("click", () => dispatch({ type: "togglePause" }));
  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool as UiState["tool"];
      ui.tool = ui.tool === tool ? null : tool;
    });
  }

  return {
    update(state: GameState) {
      gold.textContent = String(state.gold);
      income.textContent = `+${incomePerMinute(state)}/min`;
      keep.textContent = `${state.keep.hp} / ${state.keep.maxHp}`;
      wave.textContent = String(state.wave.number);
      const spawning = state.wave.toSpawn > 0;
      next.textContent = spawning ? "incoming!" : `${Math.ceil(state.wave.countdown / TICK_RATE)}s`;
      sendWaveButton.disabled = spawning || state.gameOver;
      pauseButton.textContent = state.paused ? "Resume" : "Pause";
      for (const button of toolButtons) {
        button.classList.toggle("selected", button.dataset.tool === ui.tool);
      }
      if (performance.now() < ui.messageUntil) status.textContent = ui.message;
      else status.textContent = state.paused ? "PAUSED - press Space" : "";
    },
  };
}
