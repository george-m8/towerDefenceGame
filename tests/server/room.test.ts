import { describe, expect, it } from "vitest";
import { STARTING_GOLD, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import type { ServerMessage } from "../../src/net/protocol";
import {
  advanceRoom,
  applyRoomCommand,
  createRoom,
  joinRoom,
  leaveRoom,
  rejoinRoom,
  hostOf,
  restartRoom,
  startRoom,
  type Room,
} from "../../server/room";
import { MAX_PLAYERS } from "../../server/config";

const TICK_MS = 1000 / TICK_RATE;

/** A room whose messages are collected per player instead of sent. Already started unless `waiting`. */
function testRoom({ waiting = false } = {}) {
  const sent: Record<number, ServerMessage[]> = {};
  const room = createRoom("ABCD", 7, (id, message) => (sent[id] ??= []).push(message));
  room.state.wave.countdown = Infinity; // keep waves out of the way
  room.started = !waiting;
  const last = (id: number) => sent[id].at(-1)!;
  const ofType = <T extends ServerMessage["type"]>(id: number, type: T) =>
    (sent[id] ?? []).filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  return { room, sent, last, ofType };
}

/** Open ground beside the keep: in sight, so it can be built on through the fog. */
function nearKeep(room: Room) {
  return { x: room.state.keep.x - 2, y: room.state.keep.y };
}

function join(room: Room, name: string) {
  const joined = joinRoom(room, name);
  if (!joined.ok) throw new Error(joined.reason);
  return joined;
}

describe("joining", () => {
  it("a new room has no players until someone joins", () => {
    const { room } = testRoom();
    expect(Object.keys(room.state.players)).toEqual([]);
  });

  it("joining adds a player, sends them a welcome with a token, and tells the others", () => {
    const { room, ofType } = testRoom();
    const ann = join(room, "Ann");
    const bo = join(room, "Ann");
    expect(ann.playerId).toBe(1);
    expect(bo.playerId).toBe(2);
    expect(room.state.players[2].name).toBe("Ann 2");
    const welcome = ofType(2, "welcome").at(-1);
    expect(welcome).toMatchObject({ type: "welcome", room: "ABCD", playerId: 2, token: bo.token });
    expect(bo.token).toMatch(/^[0-9a-f]{32}$/);
    expect(bo.token).not.toBe(ann.token);
    expect(ofType(1, "update").at(-1)?.update.players[2].name).toBe("Ann 2");
  });

  it("never sends tokens or rng state to anyone", () => {
    const { room, sent } = testRoom();
    const ann = join(room, "Ann");
    const bo = join(room, "Bo");
    const text = JSON.stringify(sent);
    expect(text).not.toContain("rngState");
    expect(JSON.stringify(sent[1])).not.toContain(bo.token);
    expect(JSON.stringify(sent[2])).not.toContain(ann.token);
  });

  it("refuses a player beyond the room size", () => {
    const { room } = testRoom();
    for (let i = 0; i < MAX_PLAYERS; i++) join(room, `P${i}`);
    expect(joinRoom(room, "Late")).toEqual({ ok: false, reason: "Room is full" });
  });

  it("a player who left can rejoin with their token as the same player", () => {
    const { room, ofType } = testRoom();
    const ann = join(room, "Ann");
    applyRoomCommand(room, ann.playerId, 1, { type: "build", kind: "wall", ...nearKeep(room) });
    leaveRoom(room, ann.playerId);
    expect(room.state.players[1].connected).toBe(false);
    expect(rejoinRoom(room, ann.token)).toEqual({ ok: true, playerId: 1 });
    expect(room.state.players[1].connected).toBe(true);
    expect(ofType(1, "welcome").at(-1)).toMatchObject({ playerId: 1, token: ann.token });
    expect(room.state.players[1].gold).toBe(STARTING_GOLD - STRUCTURES.wall.cost);
  });

  it("rejects an unknown token", () => {
    const { room } = testRoom();
    join(room, "Ann");
    expect(rejoinRoom(room, "nope")).toEqual({ ok: false, reason: "Unknown player" });
  });
});

describe("commands", () => {
  it("apply as the sending player and are answered with their seq", () => {
    const { room, ofType } = testRoom();
    join(room, "Ann");
    const bo = join(room, "Bo");
    applyRoomCommand(room, bo.playerId, 42, { type: "build", kind: "wall", ...nearKeep(room) });
    expect(ofType(2, "result").at(-1)).toEqual({ type: "result", seq: 42, result: { ok: true } });
    const wall = Object.values(room.state.structures).find((s) => s.kind === "wall");
    expect(wall?.owner).toBe(2);
    // Everyone gets an update straight away, with the changed grid.
    expect(ofType(1, "update").at(-1)?.update.base).toBeDefined();
  });

  it("debugSpawn is rejected online", () => {
    const { room, last } = testRoom();
    const ann = join(room, "Ann");
    applyRoomCommand(room, ann.playerId, 1, { type: "debugSpawn", count: 200 } as never);
    expect(last(1)).toEqual({
      type: "result",
      seq: 1,
      result: { ok: false, reason: "Not allowed online" },
    });
    expect(room.state.enemies).toEqual([]);
  });

  it("a rejected command sends no update", () => {
    const { room, ofType } = testRoom();
    const ann = join(room, "Ann");
    const updates = ofType(1, "update").length;
    applyRoomCommand(room, ann.playerId, 1, { type: "sell", ...nearKeep(room) });
    expect(ofType(1, "update").length).toBe(updates);
  });
});

describe("time", () => {
  it("ticks for elapsed time and sends an update every 2 ticks", () => {
    const { room, ofType } = testRoom();
    join(room, "Ann");
    const before = ofType(1, "update").length;
    advanceRoom(room, TICK_MS);
    expect(room.state.tick).toBe(1);
    expect(ofType(1, "update").length).toBe(before);
    advanceRoom(room, TICK_MS);
    expect(room.state.tick).toBe(2);
    expect(ofType(1, "update").length).toBe(before + 1);
    expect(ofType(1, "update").at(-1)?.update.tick).toBe(2);
  });

  it("carries leftover time between calls", () => {
    const { room } = testRoom();
    join(room, "Ann");
    advanceRoom(room, TICK_MS * 0.6);
    advanceRoom(room, TICK_MS * 0.6);
    expect(room.state.tick).toBe(1);
  });

  it("runs faster while fast-forwarding and not at all while paused", () => {
    const { room } = testRoom();
    const ann = join(room, "Ann");
    applyRoomCommand(room, ann.playerId, 1, { type: "toggleFastForward" });
    advanceRoom(room, TICK_MS * 2);
    expect(room.state.tick).toBe(4);
    applyRoomCommand(room, ann.playerId, 2, { type: "togglePause" });
    advanceRoom(room, TICK_MS * 10);
    expect(room.state.tick).toBe(4);
  });

  it("caps catch-up after a long stall", () => {
    const { room } = testRoom();
    join(room, "Ann");
    advanceRoom(room, 60_000);
    expect(room.state.tick).toBeLessThanOrEqual(5);
    advanceRoom(room, TICK_MS);
    expect(room.state.tick).toBeLessThanOrEqual(6);
  });

  it("an empty room doesn't tick", () => {
    const { room } = testRoom();
    advanceRoom(room, TICK_MS * 10);
    expect(room.state.tick).toBe(0);
  });
});

describe("restart", () => {
  it("is refused until the game is over", () => {
    const { room } = testRoom();
    join(room, "Ann");
    expect(restartRoom(room, 99)).toEqual({ ok: false, reason: "The game isn't over" });
  });

  it("starts a new game keeping players, names and tokens, with fresh gold", () => {
    const { room, last } = testRoom();
    const ann = join(room, "Ann");
    const bo = join(room, "Bo");
    applyRoomCommand(room, bo.playerId, 1, { type: "build", kind: "wall", ...nearKeep(room) });
    leaveRoom(room, bo.playerId);
    room.state.gameOver = true;

    expect(restartRoom(room, 99)).toEqual({ ok: true });
    expect(room.state.seed).toBe(99);
    expect(room.state.gameOver).toBe(false);
    expect(room.state.players[2]).toMatchObject({
      name: "Bo",
      gold: STARTING_GOLD,
      connected: false,
    });
    expect(Object.values(room.state.structures).every((s) => s.owner === null)).toBe(true);
    expect(last(1)).toMatchObject({ type: "welcome", playerId: 1, token: ann.token });
    expect(rejoinRoom(room, bo.token)).toEqual({ ok: true, playerId: 2 });
    expect(join(room, "Cy").playerId).toBe(3);
  });
});

describe("waiting room", () => {
  it("a new room is waiting: it doesn't tick and refuses commands", () => {
    const { room, ofType } = testRoom({ waiting: true });
    const ann = join(room, "Ann");
    advanceRoom(room, 1000);
    expect(room.state.tick).toBe(0);
    applyRoomCommand(room, ann.playerId, 1, { type: "build", kind: "wall", ...nearKeep(room) });
    expect(ofType(1, "result").at(-1)?.result).toEqual({
      ok: false,
      reason: "The game hasn't started",
    });
  });

  it("the host is the lowest-id connected player, and passes on when they leave", () => {
    const { room } = testRoom({ waiting: true });
    expect(hostOf(room)).toBeNull();
    const ann = join(room, "Ann");
    const bo = join(room, "Bo");
    expect(hostOf(room)).toBe(ann.playerId);
    leaveRoom(room, ann.playerId);
    expect(hostOf(room)).toBe(bo.playerId);
  });

  it("only the host can start, and then the game runs", () => {
    const { room, ofType } = testRoom({ waiting: true });
    const ann = join(room, "Ann");
    const bo = join(room, "Bo");
    expect(startRoom(room, bo.playerId)).toEqual({ ok: false, reason: "Only the host can start" });
    expect(room.started).toBe(false);
    expect(startRoom(room, ann.playerId)).toEqual({ ok: true });
    expect(room.started).toBe(true);
    expect(ofType(2, "update").at(-1)?.lobby).toEqual({ started: true, host: 1 });
    advanceRoom(room, TICK_MS);
    expect(room.state.tick).toBe(1);
    expect(startRoom(room, ann.playerId)).toEqual({ ok: true }); // a second start does nothing
  });

  it("welcomes and updates carry the lobby info", () => {
    const { room, ofType } = testRoom({ waiting: true });
    join(room, "Ann");
    join(room, "Bo");
    expect(ofType(2, "welcome").at(-1)?.lobby).toEqual({ started: false, host: 1 });
    expect(ofType(1, "update").at(-1)?.lobby).toEqual({ started: false, host: 1 });
  });

  it("restart starts the new game straight away", () => {
    const { room } = testRoom();
    join(room, "Ann");
    room.state.gameOver = true;
    restartRoom(room, 5);
    expect(room.started).toBe(true);
  });

  it("the host can start without fog (the dev switch), and restarts keep it", () => {
    const { room } = testRoom({ waiting: true });
    const ann = join(room, "Ann");
    expect(room.state.fog).toBe(true);
    expect(startRoom(room, ann.playerId, false)).toEqual({ ok: true });
    expect(room.state.fog).toBe(false);
    room.state.gameOver = true;
    restartRoom(room, 5);
    expect(room.state.fog).toBe(false);
  });
});
