import { describe, expect, it } from "vitest";
import { TICK_RATE } from "../../src/sim/config";
import { tick } from "../../src/sim/game";
import { launchRaft } from "../../src/sim/rafts";
import { sentStateOf, toClientState, toUpdate } from "../../src/net/snapshot";
import { applyUpdate, fromClientState } from "../../src/net/view";
import { createRoom, joinRoom, startRoom } from "../../server/room";

describe("Rafts online", () => {
  it("plays co-op, each with their own gold, and keeps a client's rafts and flood the server's", () => {
    const room = createRoom("RAFT", 7, () => {}, "rafts", "S");
    const ann = joinRoom(room, "Ann");
    const bo = joinRoom(room, "Bo");
    if (!ann.ok || !bo.ok) throw new Error("couldn't join");
    expect(startRoom(room, ann.playerId)).toEqual({ ok: true });
    const state = room.state;
    expect(state.mode).toBe("rafts");
    expect(state.players[ann.playerId].gold).toBeGreaterThan(0);
    state.players[ann.playerId].gold += 100;
    expect(state.players[bo.playerId].gold).not.toBe(state.players[ann.playerId].gold);
    const sent = sentStateOf(state);
    const view = fromClientState(JSON.parse(JSON.stringify(toClientState(state))));
    state.wave.countdown = Infinity;
    for (let s = 0; s < 30; s++) {
      for (let i = 0; i < TICK_RATE; i++) tick(state);
      if (s === 25) launchRaft(state, ["goblin", "goblin"], { wave: 1 });
      applyUpdate(view, JSON.parse(JSON.stringify(toUpdate(state, sent))));
    }
    expect(view.terrain).toEqual(state.terrain);
    expect(view.rafts!.boats.map((r) => [r.x, r.y])).toEqual(
      state.rafts!.boats.map((r) => [r.x, r.y]),
    );
    expect(view.rafts!.boats).toHaveLength(1);
  });
});
