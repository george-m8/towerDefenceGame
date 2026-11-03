import { describe, expect, it } from "vitest";
import { TICK_RATE } from "../../src/sim/config";
import { shiftWorld } from "../../src/sim/flood";
import { tick } from "../../src/sim/game";
import { parseClientMessage } from "../../src/net/protocol";
import { sentStateOf, toClientState, toUpdate } from "../../src/net/snapshot";
import { applyUpdate, fromClientState } from "../../src/net/view";
import {
  applyRoomCommand,
  createRoom,
  joinRoom,
  restartRoom,
  startRoom,
  type Room,
} from "../../server/room";

/** A No looking back room, its messages dropped. */
function floodRoom(goal?: number, liquid?: "water"): Room {
  return createRoom("FLOD", 7, () => {}, "flood", "S", "always", { goal, liquid });
}

function join(room: Room, name: string) {
  const joined = joinRoom(room, name);
  if (!joined.ok) throw new Error(joined.reason);
  return joined.playerId;
}

describe("No looking back online", () => {
  it("can be asked for, with a goal, and takes planKing", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "create", name: "Ann", mode: "flood", goal: 500 })),
    ).toEqual({ ok: true, message: { type: "create", name: "Ann", mode: "flood", goal: 500 } });
    const command = { type: "planKing", x: 3, y: 4, queue: true };
    expect(parseClientMessage(JSON.stringify({ type: "command", seq: 1, command }))).toEqual({
      ok: true,
      message: { type: "command", seq: 1, command },
    });
  });

  it("gives each player a royal when the host starts, and again on restart", () => {
    const room = floodRoom(300);
    const ann = join(room, "Ann");
    const bo = join(room, "Bo");
    expect(room.state.flood!.royals).toEqual([]);
    expect(startRoom(room, ann)).toEqual({ ok: true });
    const titles = room.state.flood!.royals.map((r) => [r.owner, r.title]);
    expect(titles).toEqual([
      [ann, "king"],
      [bo, "queen"],
    ]);
    expect(room.state.flood!.goal).toBe(300);
    // Each leads their own.
    const queen = room.state.flood!.royals[1];
    const to = { x: queen.at.x + 2, y: queen.at.y };
    const result = applyRoomCommand(room, bo, 1, { type: "planKing", ...to });
    expect(result).toEqual({ ok: true });
    expect(queen.plan).toEqual([to]);
    room.state.gameOver = true;
    expect(restartRoom(room, 8)).toEqual({ ok: true });
    expect(room.state.flood!.royals.map((r) => r.owner)).toEqual([ann, bo]);
    expect(room.state.flood!.goal).toBe(300);
  });

  it("floods with water if the room was made so, and again on restart", () => {
    const room = floodRoom(undefined, "water");
    const ann = join(room, "Ann");
    startRoom(room, ann);
    expect(room.state.flood!.liquid).toBe("water");
    room.state.gameOver = true;
    expect(restartRoom(room, 8)).toEqual({ ok: true });
    expect(room.state.flood!.liquid).toBe("water");
    expect(floodRoom().state.flood!.liquid).toBe("lava");
  });

  it("keeps a client's map the same as the server's as the world moves on, sending just the new land", () => {
    const room = floodRoom();
    const ann = join(room, "Ann");
    startRoom(room, ann);
    const state = room.state;
    const sent = sentStateOf(state);
    const view = fromClientState(JSON.parse(JSON.stringify(toClientState(state))));
    for (let step = 0; step < 4; step++) {
      for (let i = 0; i < 7; i++) shiftWorld(state);
      for (let i = 0; i < TICK_RATE; i++) tick(state);
      const update = toUpdate(state, sent);
      // Far fewer tiles than the whole map: only what's new or changed.
      const terrain = update.tiles?.terrain?.length ?? 0;
      expect(terrain).toBeLessThan(state.width * state.height * 0.2);
      applyUpdate(view, JSON.parse(JSON.stringify(update)));
      expect(view.terrain).toEqual(state.terrain);
      expect(view.base).toEqual(state.base);
      expect(view.explored).toEqual(state.explored);
      expect(view.flood!.shifted).toBe(state.flood!.shifted);
      expect(view.flood!.royals.map((r) => r.at)).toEqual(state.flood!.royals.map((r) => r.at));
    }
    expect(view.flood!.edge).toEqual([]); // what only the server needs stays there
  });
});
