// A Session backed by the game server: sends commands, draws what the server sends.
import type { MapSize } from "../sim/config";
import type { Command, CommandResult, GameMode, GameState, PlayerId } from "../sim/types";
import { isDebugCommand } from "../sim/types";
import { tokenKey } from "./join";
import type { ClientMessage, LobbyInfo, ServerMessage } from "./protocol";
import type { PendingBuild, Session } from "./session";
import {
  applyUpdate,
  fromClientState,
  interpolateEnemies,
  interpolateUnits,
  interpolationFraction,
  type Movers,
} from "./view";

export type JoinIntent =
  | { mode: "create"; name: string; game?: GameMode; size?: MapSize }
  | { mode: "join"; room: string; name: string };

/** The parts of the browser WebSocket API we use (the `ws` package matches it in tests). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface NetworkDeps {
  WebSocket: new (url: string) => WebSocketLike;
  storage: Pick<Storage, "getItem" | "setItem">;
  now: () => number;
}

/** Waits between reconnect attempts: 0.5, 1, 2, 4, then 5 seconds. */
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 5000];
/** The server closes a connection with this when the same player connects again elsewhere. */
const REPLACED_CODE = 4000;

export interface NetworkSession extends Session {
  /** The room code, once welcomed. */
  readonly room: string | null;
  /** The waiting room's state, once welcomed. */
  readonly lobby: LobbyInfo | null;
  /** Host only: start the game for everyone. */
  start(): void;
  /** Called with errors the player should see (e.g. an unknown room). */
  onError: (reason: string) => void;
  /** Called after each welcome (first join, rejoin or restart). */
  onWelcome: (room: string) => void;
  close(): void;
}

const OPEN = 1;

export function createNetworkSession(
  url: string,
  intent: JoinIntent,
  deps: NetworkDeps,
  /** `fog: false` (the ?fog=off dev switch) starts the game without fog, if we're the host. */
  options: { fog?: boolean } = {},
): NetworkSession {
  let socket: WebSocketLike | null = null;
  let view: GameState | null = null;
  let playerId: PlayerId = 0;
  let room: string | null = intent.mode === "join" ? intent.room : null;
  let welcomed = false;
  let lobby: LobbyInfo | null = null;
  let triedRejoin = false;
  let seq = 0;
  let closedByUs = false;
  let replaced = false;
  let reconnects = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Enemies and units from the two most recent ticks we heard about, for smoothing. */
  let previous: { movers: Movers; at: number } | null = null;
  let newest: { movers: Movers; at: number; tick: number } | null = null;
  /** Builds in flight by seq; `confirmed` ones are cleared once the next update has them. */
  const pending = new Map<number, PendingBuild & { confirmed: boolean }>();

  const session: NetworkSession = {
    get state() {
      return view;
    },
    get playerId() {
      return playerId;
    },
    get room() {
      return room;
    },
    get lobby() {
      return lobby;
    },
    start() {
      send(options.fog === false ? { type: "start", fog: false } : { type: "start" });
    },
    online: true,
    get status() {
      if (replaced) return "Opened in another tab";
      if (reconnects > 0) return "Reconnecting...";
      return welcomed && room ? `Room ${room}` : "Connecting...";
    },
    get pending() {
      return [...pending.values()];
    },
    onResult: () => {},
    onError: () => {},
    onWelcome: () => {},
    send(command: Command) {
      if (command.type === "debugSpawn") return; // dev-only, never online
      if (isDebugCommand(command)) {
        session.onResult({ ok: false, reason: "Debug options are offline only" });
        return;
      }
      if (!welcomed || socket?.readyState !== OPEN) {
        session.onResult({ ok: false, reason: "Not connected" });
        return;
      }
      seq++;
      if (command.type === "build") {
        const { kind, x, y, facing } = command;
        pending.set(seq, { kind, x, y, facing, confirmed: false });
      }
      send({ type: "command", seq, command });
    },
    restart() {
      send({ type: "restart" });
    },
    frame(now: number) {
      // Draw enemies and units one update behind, blending the two most recent ticks.
      if (!view || !previous || !newest) return;
      const t = interpolationFraction(previous.at, newest.at, now);
      view.enemies = interpolateEnemies(previous.movers.enemies, newest.movers.enemies, t);
      view.units = interpolateUnits(previous.movers.units, newest.movers.units, t);
    },
    close() {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    },
  };

  function send(message: ClientMessage) {
    if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
  }

  /** The first message on a connection: rejoin if this tab has a token for the room. */
  function hello() {
    const token = room ? deps.storage.getItem(tokenKey(room)) : null;
    if (room && token && !triedRejoin) {
      triedRejoin = true;
      send({ type: "rejoin", room, token });
    } else if (room) {
      // Joining by link, or back after a drop whose token no longer works.
      send({ type: "join", room, name: intent.name });
    } else {
      const create = intent.mode === "create" ? intent : null;
      send({
        type: "create",
        name: intent.name,
        ...(create?.game ? { mode: create.game } : {}),
        ...(create?.size ? { size: create.size } : {}),
      });
    }
  }

  function receive(message: ServerMessage) {
    switch (message.type) {
      case "welcome":
        view = fromClientState(message.state);
        playerId = message.playerId;
        room = message.room;
        lobby = message.lobby;
        welcomed = true;
        reconnects = 0;
        previous = newest = null;
        pending.clear();
        deps.storage.setItem(tokenKey(message.room), message.token);
        session.onWelcome(message.room);
        return;
      case "update": {
        if (!view) return;
        const { update } = message;
        lobby = message.lobby;
        const movers = applyUpdate(view, update);
        const at = deps.now();
        // Updates sent straight after a command repeat the same tick: refresh, don't shift.
        if (newest && newest.tick !== update.tick)
          previous = { movers: newest.movers, at: newest.at };
        newest = { movers, at, tick: update.tick };
        previous ??= { movers, at };
        for (const [s, build] of pending) if (build.confirmed) pending.delete(s);
        return;
      }
      case "result": {
        const build = pending.get(message.seq);
        // A refused build disappears now; an accepted one stays until the update shows it.
        if (build && message.result.ok) build.confirmed = true;
        else pending.delete(message.seq);
        session.onResult(message.result as CommandResult);
        return;
      }
      case "error":
        // A stale token (e.g. the room was restarted elsewhere): join as a new player instead.
        if (!welcomed && triedRejoin && message.reason === "Unknown player") {
          hello();
          return;
        }
        session.onError(message.reason);
        return;
    }
  }

  function connect() {
    triedRejoin = false;
    socket = new deps.WebSocket(url);
    socket.onopen = hello;
    socket.onclose = (event) => {
      if (closedByUs) return;
      if (event.code === REPLACED_CODE) {
        replaced = true;
        return;
      }
      // Dropped: try again, backing off, and rejoin with this tab's token.
      const delay = RECONNECT_DELAYS_MS[Math.min(reconnects, RECONNECT_DELAYS_MS.length - 1)];
      reconnects++;
      reconnectTimer = setTimeout(connect, delay);
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return; // not ours; ignore
      }
      if (message && typeof message === "object" && "type" in message) receive(message);
    };
  }

  connect();
  return session;
}
