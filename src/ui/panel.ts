import { STRUCTURES } from "../sim/config";
import type { GameState } from "../sim/types";
import { GLYPHS } from "../render/palette";
import { TOOLS, type UiState } from "./state";

export function createPanel(root: HTMLElement, ui: UiState) {
  root.innerHTML = `
    <dl class="stats">
      <dt>Gold</dt><dd data-stat="gold"></dd>
      <dt>Keep</dt><dd data-stat="keep"></dd>
      <dt>Tick</dt><dd data-stat="tick"></dd>
    </dl>
    <h2 class="section">Build</h2>
    <div class="tools">
      ${TOOLS.map(
        (t) => `
        <button class="tool" data-tool="${t.tool}">
          <span class="glyph">${GLYPHS[t.tool]}</span>
          <span class="name">${STRUCTURES[t.tool].name}</span>
          <span class="cost">${STRUCTURES[t.tool].cost}g</span>
          <kbd>${t.label}</kbd>
        </button>`,
      ).join("")}
    </div>
    <p class="status" data-stat="status"></p>
  `;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-stat="${name}"]`)!;
  const gold = field("gold");
  const keep = field("keep");
  const tickCount = field("tick");
  const status = field("status");
  const toolButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-tool]")];

  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool as UiState["tool"];
      ui.tool = ui.tool === tool ? null : tool;
    });
  }

  return {
    update(state: GameState) {
      gold.textContent = String(state.gold);
      keep.textContent = `${state.keep.hp} / ${state.keep.maxHp}`;
      tickCount.textContent = String(state.tick);
      for (const button of toolButtons) {
        button.classList.toggle("selected", button.dataset.tool === ui.tool);
      }
      if (performance.now() < ui.messageUntil) status.textContent = ui.message;
      else status.textContent = state.paused ? "PAUSED - press Space" : "";
    },
  };
}
