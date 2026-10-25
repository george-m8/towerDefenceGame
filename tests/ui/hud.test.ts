import { describe, expect, it } from "vitest";
import { STRUCTURES } from "../../src/sim/config";
import { createGame } from "../../src/sim/game";
import { createUiState } from "../../src/ui/state";
import { hudContent, hudStats, toggleHudStat } from "../../src/ui/hud";
import { statList } from "../../src/ui/stats";
import { buildAt, ring } from "../sim/helpers";

function setup() {
  const state = createGame(1, { blankMap: true, fog: false });
  const ui = createUiState();
  return { state, ui };
}

describe("hudContent", () => {
  it("shows your gold, and no tool when none is selected", () => {
    const { state, ui } = setup();
    expect(hudContent(state, ui)).toEqual({
      tool: null,
      cost: null,
      short: false,
      gold: state.players[1].gold,
    });
  });

  it("shows the tool and its full price off the map or on open ground", () => {
    const { state, ui } = setup();
    ui.tool = "cannon";
    expect(hudContent(state, ui)).toMatchObject({
      tool: { glyph: "C", name: "Cannon" },
      cost: `${STRUCTURES.cannon.cost}g`,
    });
    ui.hover = { x: 30, y: 30 };
    expect(hudContent(state, ui).cost).toBe(`${STRUCTURES.cannon.cost}g`);
  });

  it("shows the discounted price inside an enclosure", () => {
    const { state, ui } = setup();
    const keep = state.keeps[0];
    buildAt(state, ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1));
    ui.tool = "wall";
    ui.hover = { x: keep.x - 1, y: keep.y - 1 };
    expect(hudContent(state, ui).cost).toBe("3g (50% off)");
  });

  it("marks a price you can't afford", () => {
    const { state, ui } = setup();
    ui.tool = "catapult";
    state.players[1].gold = STRUCTURES.catapult.cost - 1;
    expect(hudContent(state, ui).short).toBe(true);
    state.players[1].gold = STRUCTURES.catapult.cost;
    expect(hudContent(state, ui).short).toBe(false);
  });

  it("shows what selling pays on the tile under the cursor", () => {
    const { state, ui } = setup();
    buildAt(state, [{ x: 20, y: 20 }]);
    ui.tool = "sell";
    expect(hudContent(state, ui)).toMatchObject({ tool: { name: "Sell" }, cost: null });
    ui.hover = { x: 20, y: 20 };
    expect(hudContent(state, ui).cost).toBe(`+${Math.floor(STRUCTURES.wall.cost / 2)}g`);
  });

  it("points arrow-drawn tools the way they'll face", () => {
    const { state, ui } = setup();
    ui.tool = "archer";
    ui.facing = "E";
    expect(hudContent(state, ui).tool?.glyph).toBe("→");
  });
});

describe("the stat boxes", () => {
  it("show gold by default, and every stat turned on, in the menu's order", () => {
    const { state, ui } = setup();
    expect(hudStats(state, ui)).toEqual([{ id: "gold", label: "Gold", value: "250" }]);
    toggleHudStat(ui, "seed");
    toggleHudStat(ui, "keep");
    expect(hudStats(state, ui).map((s) => s.id)).toEqual(["gold", "keep", "seed"]);
    toggleHudStat(ui, "gold");
    expect(hudStats(state, ui).map((s) => s.id)).toEqual(["keep", "seed"]);
  });

  it("always keep one on", () => {
    const { state, ui } = setup();
    toggleHudStat(ui, "gold");
    expect(ui.hudStats).toEqual(["gold"]);
    expect(hudStats(state, ui).map((s) => s.id)).toEqual(["gold"]);
  });

  it("leave out stats the game doesn't have (waves in PvP), falling back to gold", () => {
    const state = createGame(1, { blankMap: true, mode: "pvp", players: ["Ann", "Bo"] });
    const ui = createUiState();
    ui.hudStats = ["wave"];
    expect(hudStats(state, ui).map((s) => s.id)).toEqual(["gold"]);
    ui.hudStats = ["wave", "rival"];
    expect(hudStats(state, ui).map((s) => s.id)).toEqual(["rival"]);
  });
});

describe("statList", () => {
  it("lists the waves in Endless, and the rival and mode in PvP", () => {
    const endless = createGame(1, { blankMap: true });
    expect(statList(endless, 1).map((s) => s.id)).toEqual([
      "gold",
      "income",
      "keep",
      "wave",
      "next",
      "seed",
    ]);
    const pvp = createGame(1, { blankMap: true, mode: "pvp", players: ["Ann", "Bo"] });
    expect(statList(pvp, 1).map((s) => s.id)).toEqual([
      "gold",
      "income",
      "keep",
      "rival",
      "mode",
      "seed",
    ]);
  });
});

describe("infinite money (debug)", () => {
  it("shows gold as ∞ and never short", () => {
    const { state, ui } = setup();
    state.players[1].gold = 0;
    state.debug.infiniteGold = true;
    ui.tool = "catapult";
    expect(hudContent(state, ui).short).toBe(false);
    expect(hudStats(state, ui)[0]).toMatchObject({ id: "gold", value: "∞" });
  });
});
