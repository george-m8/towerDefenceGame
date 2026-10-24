import { GRID_HEIGHT, GRID_WIDTH } from "./sim/config";
import { createRenderer } from "./render/canvas";
import { readJoinIntent, serverUrl, tokenKey, type PageIntent } from "./net/join";
import { createNetworkSession, type NetworkDeps } from "./net/networkSession";
import { createLocalSession, type Session } from "./net/session";
import { createPanel } from "./ui/panel";
import { bindInput } from "./ui/input";
import { createUiState, showMessage } from "./ui/state";
import { createGameOverDialog } from "./ui/gameOver";
import { createOnlinePanel } from "./ui/players";
import { createWaitingRoom } from "./ui/waitingRoom";
import { rememberedName, showStartScreen } from "./ui/startScreen";
import { showNotice } from "./ui/notice";
import type { Command, GameState } from "./sim/types";

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const ui = createUiState();
const storage = tabStorage();
let session: Session | null = null;
/** Online-only parts of the page, updated every frame. */
const onlineViews: { update(state: GameState | null): void }[] = [];

const dispatch = (command: Command) => session?.send(command);
const canvas = element<HTMLCanvasElement>("#map");
// Sized for the default map now, so the start screen has a window to sit in.
let renderer = createRenderer(canvas, GRID_WIDTH, GRID_HEIGHT);
let rendererSize = `${GRID_WIDTH}x${GRID_HEIGHT}`;
const panel = createPanel(element("#panel"), ui, dispatch);
const gameOver = createGameOverDialog(element("#game-over"), () => {
  session?.restart();
  ui.tool = null;
});
bindInput(canvas, ui, dispatch);

/** Starts playing: offline, or in a room on the game server. */
function startSession(intent: Exclude<PageIntent, { mode: "menu" }>) {
  if (intent.mode === "offline") {
    session = createLocalSession(Date.now() >>> 0);
  } else {
    const network = createNetworkSession(serverUrl(location), intent, {
      WebSocket: WebSocket as unknown as NetworkDeps["WebSocket"],
      storage,
      now: () => performance.now(),
    });
    // Keep the address shareable and reloadable: ?room=CODE (reloading rejoins with the token).
    network.onWelcome = (room) => history.replaceState(null, "", `?room=${room}`);
    network.onError = (reason) => showNotice(element("#notice"), reason);
    onlineViews.push(
      createOnlinePanel(element("#online"), network),
      createWaitingRoom(element("#waiting"), network),
    );
    session = network;
  }
  session.onResult = (result) => {
    if (!result.ok) showMessage(ui, result.reason);
  };
}

const intent = readJoinIntent(location.search);
if (intent.mode !== "menu") {
  startSession(intent);
} else if (intent.room && storage.getItem(tokenKey(intent.room))) {
  // A reload of a room this tab is already in: go straight back in as the same player.
  startSession({ mode: "join", room: intent.room, name: rememberedName() ?? "Player" });
} else {
  showStartScreen(element("#start"), { room: intent.room, onChoose: startSession });
}

function frame(now: number) {
  if (session) {
    session.frame(now);
    ui.playerId = session.playerId;
    const state = session.state;
    for (const view of onlineViews) view.update(state);
    if (state) {
      const size = `${state.width}x${state.height}`;
      if (size !== rendererSize) {
        renderer = createRenderer(canvas, state.width, state.height);
        rendererSize = size;
      }
      renderer.render(state, ui, session.pending);
      panel.update(state);
      gameOver.update(state);
    }
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
