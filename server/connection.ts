// Per-socket handling: parse messages, route them to rooms, and send rooms' messages back.
import type { WebSocket } from "ws";
import type { PlayerId } from "../src/sim/types";
import { parseClientMessage, type ClientMessage, type ServerMessage } from "../src/net/protocol";
import {
  applyRoomCommand,
  joinRoom,
  leaveRoom,
  rejoinRoom,
  restartRoom,
  startRoom,
  type Room,
} from "./room";
import { MAX_MESSAGES_PER_SECOND } from "./config";
import { createRegistry, findRoom, openRoom, randomSeed, type Registry } from "./rooms";

export interface Hub {
  registry: Registry;
  /** The open socket for each `${code}:${playerId}`. */
  sockets: Map<string, WebSocket>;
}

export function createHub(): Hub {
  const sockets = new Map<string, WebSocket>();
  const registry = createRegistry((code, playerId, message) => {
    const socket = sockets.get(key(code, playerId));
    if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  });
  return { registry, sockets };
}

/** Wires one socket into the hub for its lifetime. */
export function handleConnection(hub: Hub, socket: WebSocket): void {
  let seat: { room: Room; playerId: PlayerId } | null = null;

  const limiter = createRateLimiter();

  const send = (message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };
  const sit = (room: Room) => (playerId: PlayerId) => {
    seat = { room, playerId };
    const k = key(room.code, playerId);
    // Rejoining from a new connection replaces the old one.
    const previous = hub.sockets.get(k);
    hub.sockets.set(k, socket);
    previous?.close(4000, "Replaced by a new connection");
  };

  socket.on("message", (data) => {
    const verdict = limiter.take();
    if (verdict === "warn") send({ type: "error", reason: "Too many messages" });
    if (verdict !== "ok") return;
    try {
      const parsed = parseClientMessage(data.toString());
      if (!parsed.ok) return send({ type: "error", reason: parsed.error });
      route(parsed.message);
    } catch (error) {
      // One bad message must never take the server down.
      console.error("Error handling message:", error);
      send({ type: "error", reason: "Server error" });
    }
  });

  // Protocol errors (e.g. an oversized message) close the socket; without a listener they'd crash.
  socket.on("error", (error) => console.warn("Socket error:", error.message));

  socket.on("close", () => {
    if (!seat) return;
    const k = key(seat.room.code, seat.playerId);
    // A newer connection may already have taken this seat over.
    if (hub.sockets.get(k) !== socket) return;
    hub.sockets.delete(k);
    leaveRoom(seat.room, seat.playerId);
  });

  function route(message: ClientMessage) {
    switch (message.type) {
      case "create":
      case "join":
      case "rejoin": {
        if (seat) return send({ type: "error", reason: "Already in a room" });
        const room =
          message.type === "create" ? openRoom(hub.registry) : findRoom(hub.registry, message.room);
        if (!room) return send({ type: "error", reason: "No room with that code" });
        const result =
          message.type === "rejoin"
            ? rejoinRoom(room, message.token, sit(room))
            : joinRoom(room, message.name, sit(room));
        if (!result.ok) send({ type: "error", reason: result.reason });
        return;
      }
      case "command":
        if (!seat) return send({ type: "error", reason: "Join a room first" });
        applyRoomCommand(seat.room, seat.playerId, message.seq, message.command);
        return;
      case "start": {
        if (!seat) return send({ type: "error", reason: "Join a room first" });
        const result = startRoom(seat.room, seat.playerId);
        if (!result.ok) send({ type: "error", reason: result.reason });
        return;
      }
      case "restart": {
        if (!seat) return send({ type: "error", reason: "Join a room first" });
        const result = restartRoom(seat.room, randomSeed());
        if (!result.ok) send({ type: "error", reason: result.reason });
        return;
      }
    }
  }
}

/**
 * A token bucket: MAX_MESSAGES_PER_SECOND messages at once, refilling at that rate.
 * Over the limit, messages are dropped, with at most one "warn" per second.
 */
function createRateLimiter(now: () => number = () => performance.now()) {
  let tokens = MAX_MESSAGES_PER_SECOND;
  let last = now();
  let lastWarning = -Infinity;
  return {
    take(): "ok" | "warn" | "drop" {
      const t = now();
      tokens = Math.min(
        MAX_MESSAGES_PER_SECOND,
        tokens + ((t - last) / 1000) * MAX_MESSAGES_PER_SECOND,
      );
      last = t;
      if (tokens >= 1) {
        tokens--;
        return "ok";
      }
      if (t - lastWarning < 1000) return "drop";
      lastWarning = t;
      return "warn";
    },
  };
}

function key(code: string, playerId: PlayerId): string {
  return `${code}:${playerId}`;
}
