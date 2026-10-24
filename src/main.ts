import { createRenderer } from "./render/canvas";
import { readJoinIntent, serverUrl } from "./net/join";
import { createNetworkSession, type NetworkDeps } from "./net/networkSession";
import { createLocalSession, type Session } from "./net/session";
import { createPanel } from "./ui/panel";
import { bindInput } from "./ui/input";
import { createUiState, showMessage } from "./ui/state";
import { createGameOverDialog } from "./ui/gameOver";
import { createOnlinePanel } from "./ui/players";
import { showNotice } from "./ui/notice";
import type { Command } from "./sim/types";

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const ui = createUiState();
const intent = readJoinIntent(location.search, (question) => window.prompt(question));
let online: ReturnType<typeof createOnlinePanel> | null = null;
let session: Session;

if (intent.mode === "offline") {
  session = createLocalSession(Date.now() >>> 0);
} else {
  const network = createNetworkSession(serverUrl(location), intent, {
    WebSocket: WebSocket as unknown as NetworkDeps["WebSocket"],
    storage: tabStorage(),
    now: () => performance.now(),
  });
  // Keep the address shareable and reloadable: ?room=CODE (reloading rejoins with the token).
  network.onWelcome = (room) => history.replaceState(null, "", `?room=${room}`);
  network.onError = (reason) => showNotice(element("#notice"), reason);
  online = createOnlinePanel(element("#online"), network);
  session = network;
}

session.onResult = (result) => {
  if (!result.ok) showMessage(ui, result.reason);
};

const dispatch = (command: Command) => session.send(command);
const canvas = element<HTMLCanvasElement>("#map");
let renderer: ReturnType<typeof createRenderer> | null = null;
const panel = createPanel(element("#panel"), ui, dispatch);
const gameOver = createGameOverDialog(element("#game-over"), () => {
  session.restart();
  ui.tool = null;
});
bindInput(canvas, ui, dispatch);

function frame(now: number) {
  session.frame(now);
  ui.playerId = session.playerId;
  const state = session.state;
  online?.update(state);
  if (state) {
    // Online, the map size is only known once the server has welcomed us.
    renderer ??= createRenderer(canvas, state.width, state.height);
    renderer.render(state, ui, session.pending);
    panel.update(state);
    gameOver.update(state);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** sessionStorage (per tab, so each tab is its own player), or memory if it's unavailable. */
function tabStorage(): NetworkDeps["storage"] {
  try {
    sessionStorage.getItem("probe");
    return sessionStorage;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };
  }
}
