import { describe, expect, it } from "vitest";
import { BUILD_TIME, STRUCTURES } from "../../src/sim/config";
import { createGame } from "../../src/sim/game";
import {
  TOOLS,
  createUiState,
  hasBuildTools,
  tabForKey,
  toolsInTab,
  type BuildTab,
} from "../../src/ui/state";
import {
  allowed,
  heldTime,
  hudContent,
  hudStats,
  limitLabel,
  pickerCard,
  toggleHudStat,
} from "../../src/ui/hud";
import { newItems, withLimit } from "../../src/sim/itemsFile";
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
      time: null,
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

  it("shows how long building takes on the hovered tile", () => {
    const { state, ui } = setup();
    const keep = state.keeps[0];
    ui.tool = "wall";
    expect(hudContent(state, ui).time).toBeNull(); // off the map
    ui.hover = { x: keep.x - 1, y: keep.y };
    expect(hudContent(state, ui).time).toBe("0.0s");
    ui.hover = { x: keep.x - BUILD_TIME.fullDistance, y: keep.y };
    expect(hudContent(state, ui).time).toBe(`${BUILD_TIME.maxSeconds.toFixed(1)}s`);
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

describe("heldTime", () => {
  it("shows a new build time as it comes", () => {
    expect(heldTime(null, "wall", "2.0s")).toEqual({ tool: "wall", text: "2.0s" });
    expect(heldTime({ tool: "wall", text: "2.0s" }, "wall", "3.5s")).toEqual({
      tool: "wall",
      text: "3.5s",
    });
  });

  it("keeps the last time off the map while the same tool is selected", () => {
    const shown = { tool: "wall" as const, text: "2.0s" };
    expect(heldTime(shown, "wall", null)).toBe(shown);
  });

  it("drops it once another tool is picked", () => {
    const shown = { tool: "wall" as const, text: "2.0s" };
    expect(heldTime(shown, "cannon", null)).toBeNull();
    expect(heldTime(shown, "sell", null)).toBeNull();
    expect(heldTime(shown, null, null)).toBeNull();
  });
});

describe("build tabs", () => {
  const tools = (tab: BuildTab) => toolsInTab(tab).map((t) => t.tool);

  it("put each tool in its tab, with sell on every tab", () => {
    expect(tools("defence")).toEqual([
      "wall",
      "archer",
      "cannon",
      "catapult",
      "floorSpikes",
      "wallSpikes",
      "bridge",
      "watchtower",
      "gate",
      "guardhouse",
      "archeryPost",
      "paladinHall",
      "sell",
    ]);
    expect(tools("civic")).toEqual([
      "house",
      "shop",
      "farmhouse",
      "farmland",
      "timberYard",
      "mine",
      "foragerHut",
      "sell",
    ]);
    expect(tools("offence")).toEqual(["scoutCamp", "barracks", "archeryRange", "sell"]);
  });

  it("open on 1, 2 and 3, each with something to build", () => {
    expect(["Digit1", "Digit2", "Digit3"].map(tabForKey)).toEqual(["defence", "civic", "offence"]);
    expect(hasBuildTools("defence")).toBe(true);
    expect(hasBuildTools("civic")).toBe(true);
    expect(hasBuildTools("offence")).toBe(true);
  });

  it("only sell keeps a key; the old tool keys pick nothing", () => {
    expect(TOOLS.filter((t) => t.key).map((t) => [t.tool, t.key])).toEqual([["sell", "KeyX"]]);
    for (const code of ["Digit4", "Digit7", "Digit0", "KeyT", "KeyG", "KeyB"]) {
      expect(TOOLS.find((t) => t.key === code)).toBeUndefined();
    }
  });

  it("farmland and walls paint along a drag", () => {
    const paint = TOOLS.filter((t) => t.paintable).map((t) => t.tool);
    expect(paint).toContain("farmland");
    expect(paint).toContain("wall");
  });
});

describe("build limits in the picker", () => {
  it("shows nothing for an unlimited kind, and how many of the most for a limited one", () => {
    const items = withLimit(withLimit(newItems("x"), "archer", 3), "house", 0);
    const state = createGame(1, { blankMap: true, fog: false, items });
    expect(limitLabel(state, 1, "wall")).toBeNull();
    expect(limitLabel(state, 1, "archer")).toBe("0/3");
    buildAt(state, [{ x: 5, y: 5 }], "archer");
    state.structures[state.nextId - 1].owner = 1;
    expect(limitLabel(state, 1, "archer")).toBe("1/3");
    expect(limitLabel(state, 1, "house")).toBeNull();
    expect(allowed(state, "house")).toBe(false);
    expect(allowed(state, "archer")).toBe(true);
  });
});

describe("pickerCard", () => {
  it("gives a tower its glyph, name, cost, description, numbers, traits and hints", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const card = pickerCard(state, 1, "cannon");
    expect(card.title).toContain(STRUCTURES.cannon.name);
    expect(card.cost).toBe(`${STRUCTURES.cannon.cost}g`);
    expect(card.description).toBe(STRUCTURES.cannon.description);
    expect(card.numbers.join("\n")).toContain(`${STRUCTURES.cannon.tower.damage} dmg every`);
    expect(card.traits).toContain("Splash damage");
    expect(card.hints.join("\n")).toContain("off inside your keep's walls");
  });

  it("gives a spawner its unit, and a trap its damage", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(pickerCard(state, 1, "barracks").numbers.join("\n")).toContain(
      `up to ${STRUCTURES.barracks.spawner.quota} at once`,
    );
    expect(pickerCard(state, 1, "floorSpikes").numbers.join("\n")).toContain(
      `${STRUCTURES.floorSpikes.trap.damage} dmg every`,
    );
    expect(pickerCard(state, 1, "archer").hints).toContain("R to rotate");
  });

  it("shows a limit beside the cost", () => {
    const state = createGame(1, {
      blankMap: true,
      fog: false,
      items: withLimit(newItems("Few"), "cannon", 5),
    });
    expect(pickerCard(state, 1, "cannon").cost).toBe(`${STRUCTURES.cannon.cost}g · 0/5`);
  });
});
