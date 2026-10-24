import { TICK_RATE } from "./sim/config";
import { applyCommand, createGame, tick } from "./sim/game";
import { createRenderer } from "./render/canvas";
import { createPanel } from "./ui/panel";
import { bindInput } from "./ui/input";
import { createUiState } from "./ui/state";
import { createGameOverDialog } from "./ui/gameOver";

const TICK_MS = 1000 / TICK_RATE;
// Cap catch-up after the tab was in the background, so we never spiral.
const MAX_TICKS_PER_FRAME = 5;

let state = createGame(Date.now() >>> 0);
const ui = createUiState();
const canvas = document.querySelector<HTMLCanvasElement>("#map")!;
const renderer = createRenderer(canvas, state.width, state.height);
const panel = createPanel(document.querySelector<HTMLElement>("#panel")!, ui);
const gameOver = createGameOverDialog(document.querySelector<HTMLElement>("#game-over")!, () => {
  state = createGame(Date.now() >>> 0);
  ui.tool = null;
});
bindInput(canvas, ui, (command) => applyCommand(state, command));

let lastTime = performance.now();
let accumulator = 0;

function frame(now: number) {
  accumulator += now - lastTime;
  lastTime = now;
  let ticks = 0;
  while (accumulator >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
    tick(state);
    accumulator -= TICK_MS;
    ticks++;
  }
  if (ticks === MAX_TICKS_PER_FRAME) accumulator = 0;

  renderer.render(state, ui);
  panel.update(state);
  gameOver.update(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
