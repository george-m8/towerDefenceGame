import { TICK_RATE } from "./sim/config";
import { applyCommand, createGame, tick } from "./sim/game";
import { createRenderer } from "./render/canvas";
import { createPanel } from "./ui/panel";
import { bindInput } from "./ui/input";
import { createUiState } from "./ui/state";
import { createGameOverDialog } from "./ui/gameOver";
import type { Command } from "./sim/types";

const TICK_MS = 1000 / TICK_RATE;
// Cap catch-up after the tab was in the background, so we never spiral.
const MAX_TICKS_PER_FRAME = 5;

let state = createGame(Date.now() >>> 0);
const ui = createUiState();
const canvas = document.querySelector<HTMLCanvasElement>("#map")!;
const renderer = createRenderer(canvas, state.width, state.height);
const dispatch = (command: Command) => applyCommand(state, command);
const panel = createPanel(document.querySelector<HTMLElement>("#panel")!, ui, dispatch);
const gameOver = createGameOverDialog(document.querySelector<HTMLElement>("#game-over")!, () => {
  state = createGame(Date.now() >>> 0);
  ui.tool = null;
});
bindInput(canvas, ui, dispatch);

let lastTime = performance.now();
let accumulator = 0;

function frame(now: number) {
  accumulator += (now - lastTime) * state.speed;
  lastTime = now;
  const maxTicks = MAX_TICKS_PER_FRAME * state.speed;
  let ticks = 0;
  while (accumulator >= TICK_MS && ticks < maxTicks) {
    tick(state);
    accumulator -= TICK_MS;
    ticks++;
  }
  if (ticks === maxTicks) accumulator = 0;

  renderer.render(state, ui);
  panel.update(state);
  gameOver.update(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
