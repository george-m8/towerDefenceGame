import { describe, expect, it } from "vitest";
import { KEEP_WALLS } from "../../src/sim/config";
import { discountAt } from "../../src/sim/enclosures";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { baseAt } from "../../src/sim/grid";
import { gateSide, ringTiles } from "../../src/sim/keepWalls";
import { spawnEnemy } from "../../src/sim/enemies";
import { standsAtKeep } from "./helpers";

describe("the keep's starting walls", () => {
  it("ring the keep a courtyard out, with one gate", () => {
    const state = createGame(1, { fog: false });
    const keep = state.keeps[0];
    const ring = ringTiles(keep);
    expect(ring).toHaveLength((keep.size + 2 * (KEEP_WALLS.courtyard + 1)) * 4 - 4);
    const kinds = ring.map((p) => baseAt(state, p.x, p.y)?.kind);
    expect(kinds.filter((k) => k === "gate")).toHaveLength(1);
    expect(kinds.filter((k) => k === "wall")).toHaveLength(ring.length - 1);
    // The courtyard is open, and gets the keep's discount.
    expect(baseAt(state, keep.x - 1, keep.y)).toBeUndefined();
    expect(discountAt(state, keep.x - 1, keep.y)).toBe(0.5);
  });

  it("put the gate on the side facing the spawn", () => {
    const state = createGame(1, { fog: false });
    const keep = state.keeps[0];
    expect(gateSide(state, keep)).toBe("W"); // the spawn is along the left edge
    const mid = keep.y + Math.floor(keep.size / 2);
    expect(baseAt(state, keep.x - KEEP_WALLS.courtyard - 1, mid)?.kind).toBe("gate");
  });

  it("were free, so selling one pays nothing", () => {
    const state = createGame(1, { fog: false });
    const keep = state.keeps[0];
    const wall = { x: keep.x - 2, y: keep.y - 2 };
    const gold = state.players[1].gold;
    expect(applyCommand(state, 1, { type: "sell", ...wall })).toEqual({ ok: true });
    expect(state.players[1].gold).toBe(gold);
  });

  it("let enemies in through the gate to reach the keep", () => {
    const state = createGame(1, { fog: false });
    state.wave.countdown = Infinity;
    state.wanderChance = 0;
    const p = state.spawnTiles[0];
    const enemy = spawnEnemy(state, p.x, p.y, { hp: 10_000 });
    for (let i = 0; i < 400 * 20 && !standsAtKeep(state, enemy); i++) tick(state);
    expect(standsAtKeep(state, enemy)).toBe(true);
    for (const t of ringTiles(state.keeps[0])) {
      const base = baseAt(state, t.x, t.y);
      if (base?.kind === "wall") expect(base.hp).toBe(base.maxHp); // walked in, didn't break in
    }
  });

  it("belong to each keep's player in PvP, facing the middle", () => {
    const state = createGame(1, { mode: "pvp", players: ["Ann", "Bo"], fog: false });
    const [left, right] = state.keeps;
    expect(gateSide(state, left)).toBe("E");
    expect(gateSide(state, right)).toBe("W");
    for (const keep of state.keeps) {
      for (const p of ringTiles(keep)) expect(baseAt(state, p.x, p.y)?.owner).toBe(keep.owner);
    }
  });

  it("aren't on the blank test map", () => {
    const state = createGame(1, { blankMap: true });
    const keep = state.keeps[0];
    expect(ringTiles(keep).some((p) => baseAt(state, p.x, p.y))).toBe(false);
  });
});
