// One room: a game, its players' tokens, its clock and its outgoing messages.
// Sending is injected and time is passed in, so tests drive a room by hand.
import { randomBytes } from "node:crypto";
import { STARTING_GOLD, TICK_RATE } from "../src/sim/config";
import { applyCommand, assignKeeps, createGame, tick } from "../src/sim/game";
import { addPlayer, setConnected, updateVotes } from "../src/sim/players";
import type { Command, CommandResult, GameMode, GameState, PlayerId } from "../src/sim/types";
import { uniqueName, type LobbyInfo, type ServerMessage } from "../src/net/protocol";
import { toClientState, toUpdate } from "../src/net/snapshot";
import { MAX_PLAYERS, MAX_TICKS_PER_ADVANCE, PVP_PLAYERS, UPDATE_EVERY_TICKS } from "./config";

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
  /** How long nobody has been connected; the registry deletes the room after a while. */
  emptyMs: number;
  /** False while in the waiting room: no ticks, no commands, until the host starts. */
  started: boolean;
  /** Fog of war, as the host started the game with; restarts keep it. */
  fog: boolean;
}

export type JoinResult =
  { ok: true; playerId: PlayerId; token: string } | { ok: false; reason: string };
export type RejoinResult = { ok: true; playerId: PlayerId } | { ok: false; reason: string };

export function createRoom(
  code: string,
  seed: number,
  send: SendFn,
  mode: GameMode = "endless",
): Room {
  const state = createGame(seed, { players: [], mode });
  return {
    code,
    state,
    tokens: {},
    send,
    accumulatorMs: 0,
    ticksSinceUpdate: 0,
    sentGridVersion: state.gridVersion,
    emptyMs: 0,
    started: false,
    fog: true,
  };
}

/** The connected player with the lowest id: they can start the game. */
export function hostOf(room: Room): PlayerId | null {
  const connected = Object.values(room.state.players).filter((p) => p.connected);
  return connected.length > 0 ? Math.min(...connected.map((p) => p.id)) : null;
}

/**
 * The host leaves the waiting room and starts the game for everyone, with fog of war unless
 * `fog` is false (the dev switch). Starting twice does nothing.
 */
export function startRoom(room: Room, playerId: PlayerId, fog = true): CommandResult {
  if (room.started) return { ok: true };
  if (playerId !== hostOf(room)) return { ok: false, reason: "Only the host can start" };
  if (room.state.mode === "pvp") {
    const players = Object.values(room.state.players);
    if (players.length !== PVP_PLAYERS || players.some((p) => !p.connected)) {
      return { ok: false, reason: "PvP needs two players" };
    }
    assignKeeps(room.state);
  }
  room.started = true;
  room.fog = fog;
  room.state.fog = fog;
  room.accumulatorMs = 0;
  broadcastUpdate(room);
  return { ok: true };
}

/**
 * Adds a new player (name made unique), welcomes them and tells everyone else.
 * `attach` runs once the id is known, before any message is sent (to route their socket).
 */
export function joinRoom(
  room: Room,
  name: string,
  attach?: (playerId: PlayerId) => void,
): JoinResult {
  const players = Object.values(room.state.players);
  const max = room.state.mode === "pvp" ? PVP_PLAYERS : MAX_PLAYERS;
  if (players.length >= max) return { ok: false, reason: "Room is full" };
  const playerId = addPlayer(
    room.state,
    uniqueName(
      players.map((p) => p.name),
      name,
    ),
  );
  const token = randomBytes(16).toString("hex");
  room.tokens[playerId] = token;
  attach?.(playerId);
  welcome(room, playerId);
  broadcastUpdate(room);
  return { ok: true, playerId, token };
}

/** Reconnects the player holding `token`. `attach` works as in joinRoom. */
export function rejoinRoom(
  room: Room,
  token: string,
  attach?: (playerId: PlayerId) => void,
): RejoinResult {
  const entry = Object.entries(room.tokens).find(([, t]) => t === token);
  if (!entry) return { ok: false, reason: "Unknown player" };
  const playerId = Number(entry[0]);
  attach?.(playerId);
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
  const result: CommandResult = !room.started
    ? { ok: false, reason: "The game hasn't started" }
    : command.type === "debugSpawn"
      ? { ok: false, reason: "Not allowed online" }
      : applyCommand(room.state, playerId, command);
  room.send(playerId, { type: "result", seq, result });
  if (result.ok) broadcastUpdate(room);
  return result;
}

/** Runs whole ticks for the elapsed time (scaled by game speed), sending updates on cadence. */
export function advanceRoom(room: Room, elapsedMs: number): void {
  const { state } = room;
  if (!room.started || state.paused || state.gameOver) {
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
    // Later calls stop at the top once the game is over, so the ending must go out now.
    if (state.gameOver) {
      broadcastUpdate(room);
      break;
    }
    if (++room.ticksSinceUpdate >= UPDATE_EVERY_TICKS) broadcastUpdate(room);
  }
  // Drop time we couldn't catch up on, so a stall never turns into a burst.
  if (ticks === maxTicks) room.accumulatorMs = 0;
}

/** After game over: a new game on a new seed, same players, ids, names and tokens, fresh gold. */
export function restartRoom(room: Room, seed: number): CommandResult {
  const old = room.state;
  if (!old.gameOver) return { ok: false, reason: "The game isn't over" };
  const state = createGame(seed, { players: [], fog: room.fog, mode: old.mode });
  for (const player of Object.values(old.players)) {
    state.players[player.id] = {
      ...player,
      gold: STARTING_GOLD,
      votes: { pause: false, fastForward: false },
    };
  }
  state.nextPlayerId = old.nextPlayerId;
  if (state.mode === "pvp") assignKeeps(state);
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
    lobby: lobbyInfo(room),
  });
}

function lobbyInfo(room: Room): LobbyInfo {
  return { started: room.started, host: hostOf(room), mode: room.state.mode };
}

/** Sends everyone connected the latest update. */
function broadcastUpdate(room: Room) {
  const message: ServerMessage = {
    type: "update",
    update: toUpdate(room.state, room.sentGridVersion),
    lobby: lobbyInfo(room),
  };
  room.sentGridVersion = room.state.gridVersion;
  room.ticksSinceUpdate = 0;
  for (const player of Object.values(room.state.players)) {
    if (player.connected) room.send(player.id, message);
  }
}
