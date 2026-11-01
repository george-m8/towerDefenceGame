import { TICK_RATE } from "../sim/config";
import { tilesFromHome } from "../sim/journey";
import { distanceTravelled, tilesToGoal } from "../sim/flood";
import { nightsSurvived } from "../sim/clock";
import { starsFor, type LevelWin } from "../sim/levelFile";
import { playerName } from "../sim/players";
import type { GameState, PlayerId } from "../sim/types";

/**
 * The end of a game: the keep fallen (or, in PvP, who won), or a campaign level won, with its
 * stars. `onWon` hears a level's stars once, as the dialog opens; Levels goes back to the level
 * select screen.
 */
export function createGameOverDialog(
  root: HTMLElement,
  onRestart: () => void,
  level: { onWon: (stars: number) => void; onLevels: () => void } = {
    onWon: () => {},
    onLevels: () => {},
  },
) {
  root.innerHTML = `
    <div class="window dialog-window">
      <p class="dialog-title" data-field="title">The keep has fallen.</p>
      <p class="level-stars won-stars" data-field="stars" hidden></p>
      <p data-field="summary"></p>
      <div class="choices together">
        <button class="button" data-action="levels" hidden>Levels</button>
        <button class="button" data-action="restart">Restart</button>
      </div>
    </div>
  `;
  const title = root.querySelector<HTMLElement>('[data-field="title"]')!;
  const stars = root.querySelector<HTMLElement>('[data-field="stars"]')!;
  const summary = root.querySelector<HTMLElement>('[data-field="summary"]')!;
  const restart = root.querySelector<HTMLButtonElement>("[data-action=restart]")!;
  const levels = root.querySelector<HTMLButtonElement>("[data-action=levels]")!;
  restart.addEventListener("click", onRestart);
  levels.addEventListener("click", level.onLevels);

  return {
    /** `win`: the campaign level being played's win, if it is one. */
    update(state: GameState, playerId: PlayerId, win: LevelWin | null = null) {
      if (root.hidden === !state.gameOver) return;
      root.hidden = !state.gameOver;
      if (root.hidden) return;
      const seconds = Math.floor(state.tick / TICK_RATE);
      const time = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
      stars.hidden = true;
      levels.hidden = win === null;
      restart.textContent = "Restart";
      if (state.flood) {
        // Endless, the lava always wins in the end, and how far he got is the score; with a
        // goal, reaching the keep wins.
        const distance = distanceTravelled(state.flood);
        const tiles = `${distance} tile${distance === 1 ? "" : "s"}`;
        title.textContent = state.won ? "The king made it to the keep!" : "The lava took the king.";
        summary.textContent = state.won
          ? `He walked ${tiles} to it, in ${time}. Map seed ${state.seed}.`
          : state.flood.goal !== null
            ? `He got ${tiles}, ${tilesToGoal(state.flood)} short of the keep, in ${time}. Map seed ${state.seed}.`
            : `He got ${tiles}, in ${time}. Map seed ${state.seed}.`;
        return;
      }
      if (state.journey) {
        title.textContent = state.won ? "Home at last!" : "Your camp has fallen.";
        summary.textContent = state.won
          ? `Your camp made it home in ${time}. Map seed ${state.seed}.`
          : `It fell ${tilesFromHome(state)} tiles from home, after ${time}. Map seed ${state.seed}.`;
        return;
      }
      if (state.mode === "pvp") {
        title.textContent = state.winner === playerId ? "Victory!" : "Your keep has fallen.";
        const winner = state.winner !== null ? playerName(state, state.winner) : "Nobody";
        summary.textContent = `${winner} wins after ${time}. Map seed ${state.seed}.`;
        return;
      }
      if (!state.won && Object.values(state.players).some((p) => p.role === "raider")) {
        // With raiders, the keep falling is their win.
        const raiding = state.players[playerId]?.role === "raider";
        title.textContent = raiding
          ? "The keep has fallen. Raiders win!"
          : "The raiders took the keep.";
        summary.textContent = `Raiders win after ${time}. Map seed ${state.seed}.`;
        return;
      }
      if (state.won && win) {
        const keep = state.keeps[0];
        const won = starsFor(win, keep);
        title.textContent = "Level complete!";
        stars.hidden = false;
        stars.innerHTML = [1, 2, 3]
          .map((n) => `<span class="level-star${n <= won ? " won" : ""}">★</span>`)
          .join("");
        stars.setAttribute("aria-label", `${won} of 3 stars`);
        const health = Math.round((keep.hp / keep.maxHp) * 100);
        summary.textContent = `You held off all ${state.lastWave} waves in ${time}, with the keep at ${health}%.`;
        restart.textContent = "Play again";
        level.onWon(won);
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
