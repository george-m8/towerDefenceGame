// One room: a game, its players' tokens, its clock and its outgoing messages.
// Sending is injected and time is passed in, so tests drive a room by hand.
import { randomBytes } from "node:crypto";
import { STARTING_GOLD, TICK_RATE } from "../src/sim/config";
import { applyCommand, createGame, tick } from "../src/sim/game";
import { addPlayer, setConnected, updateVotes } from "../src/sim/players";
import type { Command, CommandResult, GameState, PlayerId } from "../src/sim/types";
import { uniqueName, type ServerMessage } from "../src/net/protocol";
import { toClientState, toUpdate } from "../src/net/snapshot";
import { MAX_PLAYERS, MAX_TICKS_PER_ADVANCE, UPDATE_EVERY_TICKS } from "./config";

const TICK_MS = 1000 / TICK_RATE;

export type SendFn = (playerId: PlayerId, message: ServerMessage) => void;

export interface Room {
  code: string;
  state: GameState;
  /** Secret per player, for rejoining. Never sent to anyone but its owner. */
  tokens: Record<PlayerId, string>;
  send: SendFn;
  accumulatorMs: number;
  ticksSinceUpdate: number;
  /** gridVersion as of the last update everyone received. */
  sentGridVersion: number;
}

export type JoinResult =
  { ok: true; playerId: PlayerId; token: string } | { ok: false; reason: string };
export type RejoinResult = { ok: true; playerId: PlayerId } | { ok: false; reason: string };

export function createRoom(code: string, seed: number, send: SendFn): Room {
  const state = createGame(seed, { players: [] });
  return {
    code,
    state,
    tokens: {},
    send,
    accumulatorMs: 0,
    ticksSinceUpdate: 0,
    sentGridVersion: state.gridVersion,
  };
}

/** Adds a new player (name made unique), welcomes them and tells everyone else. */
export function joinRoom(room: Room, name: string): JoinResult {
  const players = Object.values(room.state.players);
  if (players.length >= MAX_PLAYERS) return { ok: false, reason: "Room is full" };
  const playerId = addPlayer(
    room.state,
    uniqueName(
      players.map((p) => p.name),
      name,
    ),
  );
  const token = randomBytes(16).toString("hex");
  room.tokens[playerId] = token;
  welcome(room, playerId);
  broadcastUpdate(room);
  return { ok: true, playerId, token };
}

/** Reconnects the player holding `token`. */
export function rejoinRoom(room: Room, token: string): RejoinResult {
  const entry = Object.entries(room.tokens).find(([, t]) => t === token);
  if (!entry) return { ok: false, reason: "Unknown player" };
  const playerId = Number(entry[0]);
  setConnected(room.state, playerId, true);
  welcome(room, playerId);
  broadcastUpdate(room);
  return { ok: true, playerId };
}

/** The player's connection closed. They keep their gold and structures. */
export function leaveRoom(room: Room, playerId: PlayerId): void {
  setConnected(room.state, playerId, false);
  broadcastUpdate(room);
}

/** Runs a command as `playerId`, answers with its result, and shares any change. */
export function applyRoomCommand(
  room: Room,
  playerId: PlayerId,
  seq: number,
  command: Command,
): CommandResult {
  const result: CommandResult =
    command.type === "debugSpawn"
      ? { ok: false, reason: "Not allowed online" }
      : applyCommand(room.state, playerId, command);
  room.send(playerId, { type: "result", seq, result });
  if (result.ok) broadcastUpdate(room);
  return result;
}

/** Runs whole ticks for the elapsed time (scaled by game speed), sending updates on cadence. */
export function advanceRoom(room: Room, elapsedMs: number): void {
  const { state } = room;
  if (state.paused || state.gameOver) {
    room.accumulatorMs = 0;
    return;
  }
  room.accumulatorMs += elapsedMs * state.speed;
  const maxTicks = MAX_TICKS_PER_ADVANCE * state.speed;
  let ticks = 0;
  while (room.accumulatorMs >= TICK_MS && ticks < maxTicks) {
    tick(state);
    room.accumulatorMs -= TICK_MS;
    ticks++;
    if (++room.ticksSinceUpdate >= UPDATE_EVERY_TICKS) broadcastUpdate(room);
  }
  // Drop time we couldn't catch up on, so a stall never turns into a burst.
  if (ticks === maxTicks) room.accumulatorMs = 0;
}

/** After game over: a new game on a new seed, same players, ids, names and tokens, fresh gold. */
export function restartRoom(room: Room, seed: number): CommandResult {
  const old = room.state;
  if (!old.gameOver) return { ok: false, reason: "The game isn't over" };
  const state = createGame(seed, { players: [] });
  for (const player of Object.values(old.players)) {
    state.players[player.id] = {
      ...player,
      gold: STARTING_GOLD,
      votes: { pause: false, fastForward: false },
    };
  }
  state.nextPlayerId = old.nextPlayerId;
  updateVotes(state);
  room.state = state;
  room.accumulatorMs = 0;
  room.ticksSinceUpdate = 0;
  room.sentGridVersion = state.gridVersion;
  for (const player of Object.values(state.players)) {
    if (player.connected) welcome(room, player.id);
  }
  return { ok: true };
}

function welcome(room: Room, playerId: PlayerId) {
  room.send(playerId, {
    type: "welcome",
    room: room.code,
    playerId,
    token: room.tokens[playerId],
    state: toClientState(room.state),
  });
}

/** Sends everyone connected the latest update. */
function broadcastUpdate(room: Room) {
  const message: ServerMessage = {
    type: "update",
    update: toUpdate(room.state, room.sentGridVersion),
  };
  room.sentGridVersion = room.state.gridVersion;
  room.ticksSinceUpdate = 0;
  for (const player of Object.values(room.state.players)) {
    if (player.connected) room.send(player.id, message);
  }
}
