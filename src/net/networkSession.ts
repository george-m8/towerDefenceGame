// A Session backed by the game server: sends commands, draws what the server sends.
import type { Command, CommandResult, GameState, PlayerId } from "../sim/types";
import { tokenKey } from "./join";
import type { ClientMessage, ServerMessage } from "./protocol";
import type { Session } from "./session";
import { applyUpdate, fromClientState } from "./view";

export type JoinIntent =
  { mode: "create"; name: string } | { mode: "join"; room: string; name: string };

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

export interface NetworkSession extends Session {
  /** The room code, once welcomed. */
  readonly room: string | null;
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
): NetworkSession {
  let socket: WebSocketLike | null = null;
  let view: GameState | null = null;
  let playerId: PlayerId = 0;
  let room: string | null = intent.mode === "join" ? intent.room : null;
  let welcomed = false;
  let triedRejoin = false;
  let seq = 0;

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
    online: true,
    get status() {
      return welcomed && room ? `Room ${room}` : "Connecting...";
    },
    onResult: () => {},
    onError: () => {},
    onWelcome: () => {},
    send(command: Command) {
      if (command.type === "debugSpawn") return; // dev-only, never online
      if (!welcomed || socket?.readyState !== OPEN) {
        session.onResult({ ok: false, reason: "Not connected" });
        return;
      }
      send({ type: "command", seq: ++seq, command });
    },
    restart() {
      send({ type: "restart" });
    },
    frame() {},
    close() {
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
    } else if (intent.mode === "join") {
      send({ type: "join", room: intent.room, name: intent.name });
    } else {
      send({ type: "create", name: intent.name });
    }
  }

  function receive(message: ServerMessage) {
    switch (message.type) {
      case "welcome":
        view = fromClientState(message.state);
        playerId = message.playerId;
        room = message.room;
        welcomed = true;
        deps.storage.setItem(tokenKey(message.room), message.token);
        session.onWelcome(message.room);
        return;
      case "update":
        if (view) applyUpdate(view, message.update);
        return;
      case "result":
        session.onResult(message.result as CommandResult);
        return;
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
    socket = new deps.WebSocket(url);
    socket.onopen = hello;
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
