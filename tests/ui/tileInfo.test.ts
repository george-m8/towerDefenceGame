import { describe, expect, it } from "vitest";
import { spawnEnemy } from "../../src/sim/enemies";
import { spawnUnit } from "../../src/sim/units";
import { harvest, placeResource } from "../../src/sim/resources";
import { RESOURCES, STRUCTURES } from "../../src/sim/config";
import { createGame } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import type { Enemy } from "../../src/sim/types";
import { describeTile, hoverText, priceLine } from "../../src/ui/tileInfo";
import { createUiState } from "../../src/ui/state";
import { buildAt, ring } from "../sim/helpers";

function walledGame() {
  const state = createGame(1, { blankMap: true, fog: false });
  const keep = state.keeps[0];
  buildAt(state, ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1));
  buildAt(state, ring(10, 5, 14, 9));
  return state;
}

describe("enclosure hover info", () => {
  it("names the enclosure and its discount, inside and on the walls", () => {
    const state = walledGame();
    const keep = state.keeps[0];
    expect(describeTile(state, { x: keep.x - 1, y: keep.y - 1 })).toContain(
      "Inside the keep's walls: builds 50% off",
    );
    expect(describeTile(state, { x: 12, y: 7 })).toContain("Enclosed: builds 25% off");
    expect(describeTile(state, { x: 10, y: 5 })).toContain("Enclosed: builds 25% off"); // a wall
    expect(describeTile(state, { x: 30, y: 30 }).join("\n")).not.toContain("off");
  });
});

describe("priceLine", () => {
  it("shows the discounted price, or the full price outside", () => {
    const state = walledGame();
    const keep = state.keeps[0];
    expect(priceLine(state, "wall", { x: keep.x - 1, y: keep.y - 1 })).toBe(
      "Wall here: 3g (50% off)",
    );
    expect(priceLine(state, "archer", { x: 12, y: 7 })).toBe("Archer here: 19g (25% off)");
    expect(priceLine(state, "wall", { x: 30, y: 30 })).toBe("Wall here: 5g");
  });
});

describe("fog hover info", () => {
  it("says Unexplored, and hides enemies on land out of sight", () => {
    const state = createGame(1, { blankMap: true });
    const keep = state.keeps[0];
    expect(describeTile(state, { x: 0, y: 0 })).toEqual(["Unexplored"]);
    const seen = { x: keep.x + keep.size + 15, y: keep.y };
    state.enemies.push({ ...enemyAt(seen.x, seen.y) });
    const lines = describeTile(state, seen);
    expect(lines).toContain("Out of sight: enemies here aren't shown");
    expect(lines.join("\n")).not.toContain("Goblin");
    const near = { x: keep.x + keep.size + 1, y: keep.y };
    state.enemies.push({ ...enemyAt(near.x, near.y) });
    expect(describeTile(state, near).join("\n")).toContain("Goblin grunt, HP 20 / 20");
  });

  it("names an enemy's kind and variant, or just the kind when it has one variant", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const brute = spawnEnemy(state, 5, 5, { kind: "goblin", variant: 2 });
    brute.hp = 17.2;
    spawnEnemy(state, 6, 5, { kind: "zerg" });
    expect(describeTile(state, { x: 5, y: 5 })).toContain(`Goblin brute, HP 18 / ${brute.maxHp}`);
    expect(describeTile(state, { x: 6, y: 5 })).toContain("Zerg, HP 6 / 6");
  });

  it("says what an enemy is doing: sprinting, digging, or with its chief or thane", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    spawnEnemy(state, 5, 5, { kind: "dwarfBomber" }).mode = "sprinting";
    spawnEnemy(state, 6, 5, { kind: "digger" }).mode = "digging";
    const chief = spawnEnemy(state, 7, 5, { kind: "barbarianChief" });
    spawnEnemy(state, 8, 5, { kind: "barbarian", leader: chief });
    const thane = spawnEnemy(state, 9, 5, { kind: "dwarfThane" });
    spawnEnemy(state, 10, 5, { kind: "dwarf", leader: thane });

    expect(describeTile(state, { x: 5, y: 5 })).toContain("Dwarf bomber, HP 18 / 18, sprinting");
    expect(describeTile(state, { x: 6, y: 5 })).toContain("Digger, HP 20 / 20, digging");
    expect(describeTile(state, { x: 7, y: 5 }).join("\n")).not.toContain("with its");
    expect(describeTile(state, { x: 8, y: 5 })).toContain(
      "Barbarian raider, HP 30 / 30, with its chief",
    );
    expect(describeTile(state, { x: 10, y: 5 }).join("\n")).toMatch(
      /Dwarf warrior, HP \d+ \/ \d+, with its thane/,
    );
  });

  it("names a unit, its owner and its HP, but only in sight", () => {
    const state = createGame(1, { blankMap: true, fog: false, players: ["Ann"] });
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    unit.hp = 24;
    expect(describeTile(state, { x: 5, y: 5 })).toContain("Militia (Ann's), HP 24 / 30");

    // In PvP a rival's unit is only shown to its own side (it's in fog for the other).
    const pvp = createGame(1, { blankMap: true, mode: "pvp", players: ["Ann", "Bo"] });
    const p = { x: pvp.keeps[1].x - 2, y: pvp.keeps[1].y };
    spawnUnit(pvp, "militia", 2, p.x, p.y);
    expect(describeTile(pvp, p, 2)).toContain("Militia (Bo's), HP 30 / 30");
    expect(describeTile(pvp, p, 1).join("\n")).not.toContain("Militia");
  });

  it("says how much each resource has left and what it's worth", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    placeResource(state, 5, 5, "tree", 30);
    harvest(state, 5, 5, (RESOURCES.tree.seconds * 12) / 30, 1); // 12g taken
    placeResource(state, 6, 5, "goldRock", 60);
    harvest(state, 6, 5, RESOURCES.goldRock.seconds / 3, 1); // 20g taken
    placeResource(state, 7, 5, "berries", 20);
    expect(describeTile(state, { x: 5, y: 5 })).toContain("Tree - 18 of 30g of timber left");
    expect(describeTile(state, { x: 6, y: 5 })).toContain(
      "Gold-veined rock - 40 of 60g of ore left",
    );
    expect(describeTile(state, { x: 7, y: 5 })).toContain("Berry bush - 20 of 20g of berries left");
  });

  it("says whether a worker is working, walking or idle", () => {
    const state = createGame(1, { blankMap: true, fog: false, players: ["Ann"] });
    placeResource(state, 6, 5, "tree", 30);
    spawnUnit(state, "lumberjack", 1, 5, 5);
    const walker = spawnUnit(state, "miner", 1, 5, 8)!;
    walker.x = 5.5; // between tiles
    spawnUnit(state, "forager", 1, 5, 11);
    expect(describeTile(state, { x: 5, y: 5 })).toContain(
      "Lumberjack (Ann's), HP 15 / 15, chopping",
    );
    expect(describeTile(state, { x: 6, y: 8 }).join("\n")).toMatch(
      /Miner \(Ann's\), HP 18 \/ 18, walking/,
    );
    expect(describeTile(state, { x: 5, y: 11 })).toContain(
      "Forager (Ann's), HP 12 / 12, idle: nothing to gather",
    );
  });

  it("says how many fields a farmhouse counts and what it earns, and which farmhouse a field is for", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const { goldPerField, intervalSeconds, maxFields } = STRUCTURES.farmhouse.farm;
    placeStructure(state, "farmhouse", 10, 10, "N", 1);
    for (const x of [11, 12, 13]) placeStructure(state, "farmland", x, 10, "N", 1);
    placeStructure(state, "farmland", 20, 10, "N", 1);

    expect(describeTile(state, { x: 10, y: 10 })).toContain(
      `Farmhouse - 3 of ${maxFields} fields, +${3 * goldPerField}g every ${intervalSeconds}s`,
    );
    expect(describeTile(state, { x: 12, y: 10 })).toContain(
      "Farmland - counts for the farmhouse at 10, 10",
    );
    expect(describeTile(state, { x: 20, y: 10 })).toContain("Farmland - not joined to a farmhouse");
  });

  it("says whether a guard is guarding, fighting, chasing or returning", () => {
    const state = createGame(1, { blankMap: true, fog: false, players: ["Ann"] });
    spawnUnit(state, "paladin", 1, 5, 5);
    spawnUnit(state, "paladin", 1, 5, 10);
    spawnEnemy(state, 6, 10).speed = 0;
    const chaser = spawnUnit(state, "swordsman", 1, 20, 5)!;
    chaser.x = 20.5;
    spawnEnemy(state, 23, 5).speed = 0;
    const walker = spawnUnit(state, "archer", 1, 30, 5)!;
    walker.x = 30.5;

    const line = (x: number, y: number) => describeTile(state, { x, y }).join("\n");
    expect(line(5, 5)).toContain("Paladin (Ann's), HP 120 / 120, guarding");
    expect(line(5, 10)).toContain("Paladin (Ann's), HP 120 / 120, fighting");
    expect(line(21, 5)).toContain("Swordsman (Ann's), HP 60 / 60, chasing");
    expect(line(31, 5)).toContain("Archer (Ann's), HP 35 / 35, returning");
  });

  it("says what scouts, soldiers and rangers are doing", () => {
    const state = createGame(1, { blankMap: true, fog: false, players: ["Ann"] });
    const camp = placeStructure(state, "scoutCamp", 10, 10, "E", 1);
    spawnUnit(state, "scout", 1, 11, 10, camp.id); // waiting at its door
    const out = spawnUnit(state, "scout", 1, 20, 10, camp.id)!;
    out.x = 20.5;
    spawnUnit(state, "soldier", 1, 30, 10);
    spawnEnemy(state, 31, 10).speed = 0;
    spawnUnit(state, "soldier", 1, 30, 20); // the goblin above is in sight: hunting
    const line = (x: number, y: number) => describeTile(state, { x, y }).join("\n");

    expect(line(11, 10)).toContain("Scout (Ann's), HP 20 / 20, waiting: nothing left to explore");
    expect(line(21, 10)).toContain("Scout (Ann's), HP 20 / 20, scouting");
    expect(line(30, 10)).toContain("Soldier (Ann's), HP 70 / 70, fighting");
    expect(line(30, 20)).toContain("Soldier (Ann's), HP 70 / 70, hunting");

    const pvp = createGame(1, { blankMap: true, fog: false, mode: "pvp", players: ["Ann", "Bo"] });
    const k = pvp.keeps[1];
    spawnUnit(pvp, "ranger", 1, k.x - 10, k.y);
    expect(describeTile(pvp, { x: k.x - 10, y: k.y }, 1).join("\n")).toContain("besieging");

    const fogged = createGame(1, { blankMap: true, players: ["Ann"] });
    const { x, y } = { x: fogged.keeps[0].x - 2, y: fogged.keeps[0].y };
    spawnUnit(fogged, "soldier", 1, x, y);
    expect(describeTile(fogged, { x, y }).join("\n")).toContain("patrolling");
  });

  it("the price line says why you can't build on unexplored land", () => {
    const state = createGame(1, { blankMap: true });
    expect(priceLine(state, "wall", { x: 0, y: 0 })).toBe("Wall: can't build on unexplored land");
  });
});

function enemyAt(x: number, y: number): Enemy {
  return {
    id: 1,
    x,
    y,
    tx: x,
    ty: y,
    px: x,
    py: y,
    hp: 20,
    maxHp: 20,
    bounty: 1,
    killedBy: null,
    kind: "goblin",
    variant: 0,
    speed: 1.5,
    damage: 5,
    attackInterval: 20,
    attackCooldown: 0,
    abilityCooldown: 0,
    mode: "walking",
    targetId: null,
    leaderId: null,
  };
}

describe("hoverText", () => {
  it("is empty off the map, the tile's details on it, with the selected tool's price first", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const ui = createUiState();
    expect(hoverText(state, ui)).toBe("");
    ui.hover = { x: 30, y: 30 };
    expect(hoverText(state, ui)).toBe("Open ground");
    ui.tool = "wall";
    expect(hoverText(state, ui)).toBe("Wall here: 5g\nOpen ground");
  });
});
