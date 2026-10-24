// Per-socket handling: parse messages, route them to rooms, and send rooms' messages back.
import type { WebSocket } from "ws";
import type { PlayerId } from "../src/sim/types";
import { parseClientMessage, type ClientMessage, type ServerMessage } from "../src/net/protocol";
import { applyRoomCommand, joinRoom, leaveRoom, rejoinRoom, restartRoom, type Room } from "./room";
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

  const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
  const sit = (room: Room) => (playerId: PlayerId) => {
    seat = { room, playerId };
    hub.sockets.set(key(room.code, playerId), socket);
  };

  socket.on("message", (data) => {
    const parsed = parseClientMessage(data.toString());
    if (!parsed.ok) return send({ type: "error", reason: parsed.error });
    route(parsed.message);
  });

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
      case "restart": {
        if (!seat) return send({ type: "error", reason: "Join a room first" });
        const result = restartRoom(seat.room, randomSeed());
        if (!result.ok) send({ type: "error", reason: result.reason });
        return;
      }
    }
  }
}

function key(code: string, playerId: PlayerId): string {
  return `${code}:${playerId}`;
}
