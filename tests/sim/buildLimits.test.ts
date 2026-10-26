import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../../src/sim/game";
import { canBuild, ownedCount } from "../../src/sim/grid";
import { newItems, withLimit } from "../../src/sim/itemsFile";

/** A blank game where archers are capped at 2 and houses can't be built. */
function limited(players?: string[]) {
  const items = withLimit(withLimit(newItems("Test"), "archer", 2), "house", 0);
  const state = createGame(1, { blankMap: true, fog: false, items, players });
  state.debug.infiniteGold = true;
  return state;
}

describe("build limits from an items file", () => {
  it("a game without one has no limits", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(state.limits).toEqual({});
  });

  it("copies the file's limits into the game", () => {
    expect(limited().limits).toEqual({ archer: 2, house: 0 });
  });

  it("refuses a kind with a limit of 0 anywhere", () => {
    const state = limited();
    expect(canBuild(state, 1, "house", 5, 5)).toEqual({
      ok: false,
      reason: "House: not allowed in this game",
    });
  });

  it("allows up to the limit, then refuses, and selling one frees a place", () => {
    const state = limited();
    expect(applyCommand(state, 1, { type: "build", kind: "archer", x: 5, y: 5 })).toEqual({
      ok: true,
    });
    expect(applyCommand(state, 1, { type: "build", kind: "archer", x: 7, y: 5 })).toEqual({
      ok: true,
    });
    expect(ownedCount(state, 1, "archer")).toBe(2);
    const third = applyCommand(state, 1, { type: "build", kind: "archer", x: 9, y: 5 });
    expect(third).toMatchObject({ ok: false, reason: expect.stringContaining("limit reached (2") });
    expect(applyCommand(state, 1, { type: "sell", x: 5, y: 5 })).toEqual({ ok: true });
    expect(applyCommand(state, 1, { type: "build", kind: "archer", x: 9, y: 5 })).toEqual({
      ok: true,
    });
  });

  it("leaves other kinds unlimited", () => {
    const state = limited();
    for (let x = 2; x < 30; x++) {
      expect(applyCommand(state, 1, { type: "build", kind: "wall", x, y: 3 })).toEqual({
        ok: true,
      });
    }
  });

  it("counts each player's own structures", () => {
    const state = limited(["Ann", "Bo"]);
    applyCommand(state, 1, { type: "build", kind: "archer", x: 5, y: 5 });
    applyCommand(state, 1, { type: "build", kind: "archer", x: 7, y: 5 });
    expect(canBuild(state, 1, "archer", 9, 5).ok).toBe(false);
    expect(canBuild(state, 2, "archer", 9, 5).ok).toBe(true);
  });
});
