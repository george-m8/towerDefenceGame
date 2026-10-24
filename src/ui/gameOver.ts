import { TICK_RATE } from "../sim/config";
import type { GameState } from "../sim/types";

export function createGameOverDialog(root: HTMLElement, onRestart: () => void) {
  root.innerHTML = `
    <div class="window dialog-window">
      <p class="dialog-title">The keep has fallen.</p>
      <p data-field="summary"></p>
      <button class="button" data-action="restart">Restart</button>
    </div>
  `;
  const summary = root.querySelector<HTMLElement>('[data-field="summary"]')!;
  root.querySelector("[data-action=restart]")!.addEventListener("click", onRestart);

  return {
    update(state: GameState) {
      if (root.hidden === !state.gameOver) return;
      root.hidden = !state.gameOver;
      const seconds = Math.floor(state.tick / TICK_RATE);
      summary.textContent = `You survived ${Math.floor(seconds / 60)}m ${seconds % 60}s.`;
    },
  };
}
