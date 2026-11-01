import { describe, expect, it } from "vitest";
import { TICK_RATE } from "../../src/sim/config";
import { parseClientMessage, type ServerMessage } from "../../src/net/protocol";
import { sentStateOf, toClientState, toUpdate } from "../../src/net/snapshot";
import {
  advanceRoom,
  applyRoomCommand,
  createRoom,
  joinRoom,
  setRoomRole,
  startRoom,
} from "../../server/room";

function waitingRoom() {
  const sent: Record<number, ServerMessage[]> = {};
  const room = createRoom("ABCD", 7, (id, message) => (sent[id] ??= []).push(message));
  room.state.wave.countdown = Infinity;
  const host = joinRoom(room, "Def");
  const raider = joinRoom(room, "Raid");
  if (!host.ok || !raider.ok) throw new Error("couldn't join");
  const updates = (id: number) => (sent[id] ?? []).filter((m) => m.type === "update").length;
  return { room, host: host.playerId, raider: raider.playerId, updates };
}

describe("raider messages", () => {
  it("parses setRole and the raider commands, and rejects bad ones", () => {
    expect(parseClientMessage('{"type":"setRole","role":"raider"}')).toEqual({
      ok: true,
      message: { type: "setRole", role: "raider" },
    });
    expect(parseClientMessage('{"type":"setRole","role":"king"}').ok).toBe(false);
    const command = (c: object) =>
      parseClientMessage(JSON.stringify({ type: "command", seq: 1, command: c }));
    expect(command({ type: "steer", x: 3, y: 4 }).ok).toBe(true);
    expect(command({ type: "interact", x: 3, y: 4 }).ok).toBe(true);
    expect(command({ type: "sprint", on: true }).ok).toBe(true);
    expect(command({ type: "switchEnemy" }).ok).toBe(true);
    expect(command({ type: "switchEnemy", kind: "dwarf" }).ok).toBe(true);
    expect(command({ type: "switchEnemy", kind: "dragon" }).ok).toBe(false);
    expect(command({ type: "stopInteract" }).ok).toBe(true);
    expect(command({ type: "paintPath", x: 3, y: 4 }).ok).toBe(true);
    expect(command({ type: "paintPath", x: 3, y: 4, erase: true }).ok).toBe(true);
    expect(command({ type: "paintPath", x: 3, y: 4, erase: "yes" }).ok).toBe(false);
    expect(command({ type: "clearPaths" }).ok).toBe(true);
    expect(command({ type: "steer", x: -1, y: 4 }).ok).toBe(false);
    expect(command({ type: "sprint", on: "yes" }).ok).toBe(false);
    expect(command({ type: "debugRole", role: "raider" }).ok).toBe(false);
  });
});

describe("raider rooms", () => {
  it("roles are picked in the waiting room, and someone has to defend", () => {
    const { room, host, raider } = waitingRoom();
    expect(setRoomRole(room, raider, "raider").ok).toBe(true);
    expect(setRoomRole(room, host, "raider").ok).toBe(true);
    expect(startRoom(room, host)).toEqual({ ok: false, reason: "Someone has to defend" });
    setRoomRole(room, host, "defender");
    expect(startRoom(room, host).ok).toBe(true);
    expect(setRoomRole(room, raider, "defender").ok).toBe(false);
  });

  it("the raider gets an enemy, but clients aren't told which enemy anyone controls", () => {
    const { room, host, raider } = waitingRoom();
    setRoomRole(room, raider, "raider");
    startRoom(room, host);
    advanceRoom(room, (1000 / TICK_RATE) * 2);
    const sent = toClientState(room.state);
    const id = sent.players[raider].raid?.enemyId;
    const theirs = sent.enemies.find((e) => e.id === id)!;
    expect(theirs).toBeDefined();
    expect(Object.keys(theirs).sort()).toEqual(["hp", "id", "kind", "maxHp", "variant", "x", "y"]);
  });

  it("steering doesn't force an update; switching does", () => {
    const { room, host, raider, updates } = waitingRoom();
    setRoomRole(room, raider, "raider");
    startRoom(room, host);
    advanceRoom(room, (1000 / TICK_RATE) * 1);
    const before = updates(host);
    expect(applyRoomCommand(room, raider, 1, { type: "steer", x: 5, y: 5 }).ok).toBe(true);
    expect(updates(host)).toBe(before);
    for (let t = 0; t < TICK_RATE * 4; t++) advanceRoom(room, 1000 / TICK_RATE); // more roamers
    const later = updates(host);
    expect(applyRoomCommand(room, raider, 2, { type: "switchEnemy" }).ok).toBe(true);
    expect(updates(host)).toBe(later + 1);
  });

  it("painting a path doesn't force an update; updates carry the paths only once changed", () => {
    const { room, host, raider, updates } = waitingRoom();
    setRoomRole(room, raider, "raider");
    startRoom(room, host);
    const sent = sentStateOf(room.state);
    expect(toUpdate(room.state, sent).raidPaths).toBeUndefined();
    const before = updates(host);
    expect(applyRoomCommand(room, raider, 1, { type: "paintPath", x: 5, y: 5 }).ok).toBe(true);
    expect(updates(host)).toBe(before);
    expect(toUpdate(room.state, sent).raidPaths).toEqual([5 * room.state.width + 5]);
    expect(toUpdate(room.state, sent).raidPaths).toBeUndefined();
  });
});
