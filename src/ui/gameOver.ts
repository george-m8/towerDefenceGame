import { TICK_RATE } from "../sim/config";
import { nightsSurvived } from "../sim/clock";
import { playerName } from "../sim/players";
import type { GameState, PlayerId } from "../sim/types";

export function createGameOverDialog(root: HTMLElement, onRestart: () => void) {
  root.innerHTML = `
    <div class="window dialog-window">
      <p class="dialog-title" data-field="title">The keep has fallen.</p>
      <p data-field="summary"></p>
      <button class="button" data-action="restart">Restart</button>
    </div>
  `;
  const title = root.querySelector<HTMLElement>('[data-field="title"]')!;
  const summary = root.querySelector<HTMLElement>('[data-field="summary"]')!;
  root.querySelector("[data-action=restart]")!.addEventListener("click", onRestart);

  return {
    update(state: GameState, playerId: PlayerId) {
      if (root.hidden === !state.gameOver) return;
      root.hidden = !state.gameOver;
      const seconds = Math.floor(state.tick / TICK_RATE);
      const time = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
      if (state.mode === "pvp") {
        title.textContent = state.winner === playerId ? "Victory!" : "Your keep has fallen.";
        const winner = state.winner !== null ? playerName(state, state.winner) : "Nobody";
        summary.textContent = `${winner} wins after ${time}. Map seed ${state.seed}.`;
        return;
      }
      title.textContent = "The keep has fallen.";
      summary.textContent = endlessSummary(state, time);
    },
  };
}

/** How an Endless game went: the nights survived (with enemies at night) and the wave reached. */
export function endlessSummary(state: GameState, time: string): string {
  const seed = `Map seed ${state.seed}.`;
  if (state.enemiesCome !== "night") {
    return `You reached wave ${state.wave.number} and held out for ${time}. ${seed}`;
  }
  const nights = nightsSurvived(state);
  return `You survived ${nights} night${nights === 1 ? "" : "s"} (reached wave ${state.wave.number}) and held out for ${time}. ${seed}`;
}
