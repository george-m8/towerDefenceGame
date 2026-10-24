import { TICK_RATE } from "./sim/config";
import { applyCommand, createGame, tick } from "./sim/game";
import { createRenderer } from "./render/canvas";
import { createPanel } from "./ui/panel";
import { bindInput } from "./ui/input";

const TICK_MS = 1000 / TICK_RATE;
// Cap catch-up after the tab was in the background, so we never spiral.
const MAX_TICKS_PER_FRAME = 5;

const state = createGame(Date.now() >>> 0);
const renderer = createRenderer(
  document.querySelector<HTMLCanvasElement>("#map")!,
  state.width,
  state.height,
);
const panel = createPanel(document.querySelector<HTMLElement>("#panel")!);
bindInput((command) => applyCommand(state, command));

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

  renderer.render(state);
  panel.update(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
