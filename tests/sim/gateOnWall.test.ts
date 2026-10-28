import { describe, expect, it } from "vitest";
import { refundFor } from "../../src/sim/economy";
import { priceAt } from "../../src/sim/enclosures";
import { applyCommand } from "../../src/sim/game";
import { baseAt, mountAt, placeStructure } from "../../src/sim/grid";
import { addPlayer } from "../../src/sim/players";
import { priceLine } from "../../src/ui/tileInfo";
import { createGameWithoutWaves, goldOf } from "./helpers";

const gateAt = (x: number, y: number) => ({ type: "build" as const, kind: "gate" as const, x, y });

describe("a gate on a wall", () => {
  it("replaces your wall, refunding it as if sold", () => {
    const state = createGameWithoutWaves();
    const wall = placeStructure(state, "wall", 10, 10, "N", 1);
    wall.paid = 5;
    wall.hp = wall.maxHp / 2;
    const refund = refundFor(wall);
    const price = priceAt(state, "gate", 10, 10, 1);
    const gold = goldOf(state);
    expect(applyCommand(state, 1, gateAt(10, 10))).toEqual({ ok: true });
    expect(goldOf(state)).toBe(gold + refund - price);
    expect(state.structures[wall.id]).toBeUndefined();
    const gate = baseAt(state, 10, 10)!;
    expect(gate.kind).toBe("gate");
    expect(gate.owner).toBe(1);
    expect(gate.buildLeft).toBeGreaterThan(0);
  });

  it("works on the keep's shared walls, as selling does", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "wall", 10, 10, "N", null);
    expect(applyCommand(state, 1, gateAt(10, 10))).toEqual({ ok: true });
    expect(baseAt(state, 10, 10)!.kind).toBe("gate");
  });

  it("replaces an unfinished wall, refunding what was paid", () => {
    const state = createGameWithoutWaves();
    applyCommand(state, 1, { type: "build", kind: "wall", x: 10, y: 10 });
    const wall = baseAt(state, 10, 10)!;
    expect(wall.buildLeft).toBeGreaterThan(0);
    const refund = refundFor(wall);
    const gold = goldOf(state);
    expect(applyCommand(state, 1, gateAt(10, 10))).toEqual({ ok: true });
    expect(goldOf(state)).toBe(gold + refund - priceAt(state, "gate", 10, 10, 1));
  });

  it("turns a whole painted row of walls", () => {
    const state = createGameWithoutWaves();
    for (let x = 10; x < 14; x++) placeStructure(state, "wall", x, 10, "N", 1);
    for (let x = 10; x < 14; x++) applyCommand(state, 1, gateAt(x, 10));
    for (let x = 10; x < 14; x++) expect(baseAt(state, x, 10)!.kind).toBe("gate");
  });

  it("is refused with a tower on the wall", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "wall", 10, 10, "N", 1);
    placeStructure(state, "archer", 10, 10, "N", 1);
    expect(applyCommand(state, 1, gateAt(10, 10))).toEqual({
      ok: false,
      reason: "Sell the tower first",
    });
    expect(mountAt(state, 10, 10)?.kind).toBe("archer");
  });

  it("is refused on a rival's wall", () => {
    const state = createGameWithoutWaves();
    const rival = addPlayer(state, "Bo");
    placeStructure(state, "wall", 10, 10, "N", rival);
    expect(applyCommand(state, 1, gateAt(10, 10))).toEqual({
      ok: false,
      reason: "That wall belongs to Bo",
    });
  });

  it("is refused on a ruin", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "ruin", 10, 10, "N", null);
    expect(applyCommand(state, 1, gateAt(10, 10))).toEqual({
      ok: false,
      reason: "Can't put a gate on a ruin",
    });
  });

  it("counts the refund towards the price", () => {
    const state = createGameWithoutWaves();
    const wall = placeStructure(state, "wall", 10, 10, "N", 1);
    wall.paid = 10;
    const price = priceAt(state, "gate", 10, 10, 1);
    state.players[1].gold = price - refundFor(wall);
    expect(applyCommand(state, 1, gateAt(10, 10))).toEqual({ ok: true });
    placeStructure(state, "wall", 12, 10, "N", 1).paid = 10;
    state.players[1].gold = price - refundFor(baseAt(state, 12, 10)!) - 1;
    expect(applyCommand(state, 1, gateAt(12, 10))).toEqual({
      ok: false,
      reason: "Not enough gold",
    });
  });

  it("leaves other kinds on a wall as before", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "wall", 10, 10, "N", 1);
    expect(applyCommand(state, 1, { type: "build", kind: "house", x: 10, y: 10 })).toEqual({
      ok: false,
      reason: "Tile is occupied",
    });
    placeStructure(state, "gate", 11, 10, "N", 1);
    expect(applyCommand(state, 1, gateAt(11, 10))).toEqual({
      ok: false,
      reason: "Tile is occupied",
    });
  });

  it("shows the wall's refund in the price line", () => {
    const state = createGameWithoutWaves();
    const wall = placeStructure(state, "wall", 10, 10, "N", 1);
    wall.paid = 10;
    expect(priceLine(state, "gate", { x: 10, y: 10 }, 1)).toContain(
      `wall refunds ${refundFor(wall)}g`,
    );
    expect(priceLine(state, "gate", { x: 20, y: 20 }, 1)).not.toContain("refunds");
    placeStructure(state, "wall", 12, 10, "N", null).paid = 0; // a free keep wall
    expect(priceLine(state, "gate", { x: 12, y: 10 }, 1)).not.toContain("refunds");
  });
});
