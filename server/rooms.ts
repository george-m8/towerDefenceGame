// All rooms on this server, by code.
import { randomInt } from "node:crypto";
import type { PlayerId } from "../src/sim/types";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type ServerMessage } from "../src/net/protocol";
import { EMPTY_ROOM_TTL_MS } from "./config";
import { advanceRoom, createRoom, type Room } from "./room";

/** Delivers a room's message to one player's socket. */
export type DeliverFn = (code: string, playerId: PlayerId, message: ServerMessage) => void;

export interface Registry {
  rooms: Map<string, Room>;
  deliver: DeliverFn;
}

export function createRegistry(deliver: DeliverFn): Registry {
  return { rooms: new Map(), deliver };
}

/** A new room with an unused code and a random seed. */
export function openRoom(registry: Registry): Room {
  let code: string;
  do code = randomCode();
  while (registry.rooms.has(code));
  const room = createRoom(code, randomSeed(), (playerId, message) =>
    registry.deliver(code, playerId, message),
  );
  registry.rooms.set(code, room);
  return room;
}

export function findRoom(registry: Registry, code: string): Room | undefined {
  return registry.rooms.get(code);
}

/** Advances every room, and deletes rooms nobody has been connected to for EMPTY_ROOM_TTL_MS. */
export function advanceAll(registry: Registry, elapsedMs: number): void {
  for (const room of registry.rooms.values()) {
    const occupied = Object.values(room.state.players).some((p) => p.connected);
    room.emptyMs = occupied ? 0 : room.emptyMs + elapsedMs;
    if (room.emptyMs >= EMPTY_ROOM_TTL_MS) registry.rooms.delete(room.code);
    else advanceRoom(room, elapsedMs);
  }
}

export function randomSeed(): number {
  return randomInt(0, 2 ** 32 - 1);
}

function randomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
