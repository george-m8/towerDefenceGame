import { createRenderer } from "./render/canvas";
import { createLocalSession, type Session } from "./net/session";
import { createPanel } from "./ui/panel";
import { bindInput } from "./ui/input";
import { createUiState, showMessage } from "./ui/state";
import { createGameOverDialog } from "./ui/gameOver";
import type { Command } from "./sim/types";

const session: Session = createLocalSession(Date.now() >>> 0);
const ui = createUiState();
ui.playerId = session.playerId;
session.onResult = (result) => {
  if (!result.ok) showMessage(ui, result.reason);
};

const dispatch = (command: Command) => session.send(command);
const canvas = document.querySelector<HTMLCanvasElement>("#map")!;
const state = session.state!;
const renderer = createRenderer(canvas, state.width, state.height);
const panel = createPanel(document.querySelector<HTMLElement>("#panel")!, ui, dispatch);
const gameOver = createGameOverDialog(document.querySelector<HTMLElement>("#game-over")!, () => {
  session.restart();
  ui.tool = null;
});
bindInput(canvas, ui, dispatch);

function frame(now: number) {
  session.frame(now);
  const current = session.state;
  if (current) {
    renderer.render(current, ui);
    panel.update(current);
    gameOver.update(current);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
