import { describe, expect, it } from "vitest";
import { PVP, STRUCTURES, TICK_RATE, UNIT_KINDS } from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { enclosureOwnerAt, priceAt } from "../../src/sim/enclosures";
import { IN_SIGHT, UNEXPLORED, isExplored, tierAt } from "../../src/sim/fog";
import { baseAt, mountAt, placeStructure } from "../../src/sim/grid";
import { spawnUnit } from "../../src/sim/units";
import type { GameState, StructureKind } from "../../src/sim/types";
import { ring } from "./helpers";

/** A blank PvP map: Ann (1) has the left keep, Bo (2) the right one. */
function pvp(): GameState {
  return createGame(1, { blankMap: true, mode: "pvp", players: ["Ann", "Bo"] });
}

function build(state: GameState, player: number, kind: StructureKind, x: number, y: number) {
  return applyCommand(state, player, { type: "build", kind, x, y, facing: "E" });
}

const [left, right] = [0, 1];

describe("a PvP game", () => {
  it("has a keep per player, no spawn and no waves", () => {
    const state = pvp();
    expect(state.keeps.map((k) => k.owner)).toEqual([1, 2]);
    expect(state.keeps[left].x).toBeLessThan(state.width / 2);
    expect(state.keeps[right].x).toBeGreaterThan(state.width / 2);
    expect(state.keeps.every((k) => k.hp === PVP.keepHp)).toBe(true);
    expect(state.spawnTiles).toEqual([]);
    for (let i = 0; i < 60 * TICK_RATE; i++) tick(state);
    expect(state.enemies).toEqual([]);
    expect(state.wave.number).toBe(0);
    expect(applyCommand(state, 1, { type: "sendWave" })).toEqual({
      ok: false,
      reason: "No waves in PvP",
    });
  });

  it("generates a playable map with both keeps on open ground", () => {
    const state = createGame(7, { mode: "pvp", players: ["Ann", "Bo"] });
    for (const keep of state.keeps) {
      expect(state.terrain[keep.y * state.width + keep.x - 2]).toBe("ground");
    }
  });
});

describe("fog in PvP", () => {
  it("each player sees around their own keep, not the rival's", () => {
    const state = pvp();
    const [a, b] = state.keeps;
    expect(tierAt(state, a.x, a.y - 3, 1)).toBe(IN_SIGHT);
    expect(tierAt(state, a.x, a.y - 3, 2)).toBe(UNEXPLORED);
    expect(tierAt(state, b.x, b.y - 3, 2)).toBe(IN_SIGHT);
    expect(tierAt(state, b.x, b.y - 3, 1)).toBe(UNEXPLORED);
  });

  it("what you build reveals land for you only", () => {
    const state = pvp();
    const a = state.keeps[left];
    const x = a.x + 14;
    expect(build(state, 1, "watchtower", x, a.y)).toEqual({ ok: true });
    expect(isExplored(state, x + 8, a.y, 1)).toBe(true);
    expect(isExplored(state, x + 8, a.y, 2)).toBe(false);
  });

  it("you can't build on land only your rival has seen", () => {
    const state = pvp();
    const b = state.keeps[right];
    expect(build(state, 1, "wall", b.x - 3, b.y)).toEqual({
      ok: false,
      reason: "Can't build on unexplored land",
    });
  });
});

describe("enclosures in PvP", () => {
  it("land walled in by a player is theirs: the rival can't build inside, and gets no discount", () => {
    const state = pvp();
    const b = state.keeps[right];
    // Bo walls off a pocket in front of his keep, away from it.
    const walls = ring(b.x - 8, b.y - 2, b.x - 4, b.y + 2);
    for (const p of walls) placeStructure(state, "wall", p.x, p.y, "N", 2);
    const inside = { x: b.x - 6, y: b.y };
    expect(enclosureOwnerAt(state, inside.x, inside.y)).toBe(2);
    // Even if Ann can see it, she can't build there.
    state.explored = state.explored.map((bits) => bits | (1 << 1));
    expect(build(state, 1, "wall", inside.x, inside.y)).toEqual({
      ok: false,
      reason: "That's inside Bo's walls",
    });
    expect(priceAt(state, "wall", inside.x, inside.y, 1)).toBe(STRUCTURES.wall.cost);
    expect(priceAt(state, "wall", inside.x, inside.y, 2)).toBeLessThan(STRUCTURES.wall.cost);
    expect(build(state, 2, "wall", inside.x, inside.y)).toEqual({ ok: true });
  });

  it("open land is no-man's land, and your own keep's enclosure is yours", () => {
    const state = pvp();
    const a = state.keeps[left];
    expect(enclosureOwnerAt(state, a.x + 10, a.y)).toBe(0);
    for (const p of ring(a.x - 2, a.y - 2, a.x + a.size + 1, a.y + a.size + 1)) {
      placeStructure(state, "wall", p.x, p.y, "N", 1);
    }
    expect(enclosureOwnerAt(state, a.x - 2, a.y)).toBe(1); // the ring itself
    expect(priceAt(state, "archer", a.x - 2, a.y, 1)).toBe(
      Math.round(STRUCTURES.archer.cost * 0.5),
    );
  });
});

describe("towers in PvP", () => {
  /** Ann's cannon with Bo's wall in range, both placed directly. */
  function siege() {
    const state = pvp();
    const a = state.keeps[left];
    const cannon = placeStructure(state, "cannon", a.x + 10, a.y, "E", 1);
    const wall = placeStructure(state, "wall", a.x + 13, a.y, "N", 2);
    wall.paid = 5;
    return { state, cannon, wall };
  }

  it("fire at the rival's structures", () => {
    const { state, wall } = siege();
    for (let i = 0; i < 3 * TICK_RATE; i++) tick(state);
    expect(wall.hp).toBeLessThan(wall.maxHp);
    expect(state.effects.length + state.cues.length).toBeGreaterThan(0);
  });

  it("never fire at their own side's structures", () => {
    const state = pvp();
    const a = state.keeps[left];
    placeStructure(state, "cannon", a.x + 10, a.y, "E", 1);
    const own = placeStructure(state, "wall", a.x + 13, a.y, "N", 1);
    for (let i = 0; i < 5 * TICK_RATE; i++) tick(state);
    expect(own.hp).toBe(own.maxHp);
  });

  it("hit the wall before the tower on it, and pay a bounty for wrecking it", () => {
    const { state, wall } = siege();
    const archer = placeStructure(state, "archer", wall.x, wall.y, "W", 2);
    const gold = state.players[1].gold;
    for (let i = 0; i < 30 * TICK_RATE && baseAt(state, wall.x, wall.y); i++) tick(state);
    expect(baseAt(state, wall.x, wall.y)).toBeUndefined();
    expect(mountAt(state, wall.x, wall.y)).toBeUndefined(); // fell with its wall
    expect(archer.hp).toBeGreaterThan(0);
    expect(state.players[1].gold).toBeGreaterThan(gold);
  });

  it("knock down the rival keep, and the last keep standing wins", () => {
    const state = pvp();
    const b = state.keeps[right];
    placeStructure(state, "catapult", b.x - 6, b.y + 1, "E", 1);
    b.hp = 30;
    for (let i = 0; i < 20 * TICK_RATE && !state.gameOver; i++) tick(state);
    expect(b.hp).toBe(0);
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe(1);
  });
});

describe("PvP towers and units", () => {
  const militiaHp = UNIT_KINDS.militia.hp;

  it("a rival archer shoots a unit in its arc before a wall in its arc", () => {
    const state = pvp();
    const a = state.keeps[left];
    placeStructure(state, "archer", a.x + 10, a.y, "E", 1);
    const wall = placeStructure(state, "wall", a.x + 12, a.y, "N", 2);
    const unit = spawnUnit(state, "militia", 2, a.x + 14, a.y)!;

    tick(state);

    expect(unit.hp).toBe(militiaHp - STRUCTURES.archer.tower!.damage);
    expect(wall.hp).toBe(wall.maxHp);
  });

  it("a rival cannon's splash hurts every unit in the blast", () => {
    const state = pvp();
    const a = state.keeps[left];
    placeStructure(state, "cannon", a.x + 10, a.y, "E", 1);
    const first = spawnUnit(state, "militia", 2, a.x + 13, a.y)!;
    const second = spawnUnit(state, "militia", 2, a.x + 13, a.y + 1)!;

    for (let i = 0; i < TICK_RATE && first.hp === militiaHp; i++) tick(state);

    expect(first.hp).toBe(militiaHp - STRUCTURES.cannon.tower!.damage);
    expect(second.hp).toBe(militiaHp - STRUCTURES.cannon.tower!.damage);
  });

  it("towers never shoot their own side's units, and Endless towers never shoot units", () => {
    const state = pvp();
    const a = state.keeps[left];
    placeStructure(state, "archer", a.x + 10, a.y, "E", 1);
    const own = spawnUnit(state, "militia", 1, a.x + 12, a.y)!;

    const endless = createGame(1, { blankMap: true, fog: false, players: ["Ann", "Bo"] });
    endless.wave.countdown = Infinity;
    placeStructure(endless, "archer", 10, 10, "E", 1);
    const friend = spawnUnit(endless, "militia", 2, 12, 10)!;

    for (let i = 0; i < 3 * TICK_RATE; i++) {
      tick(state);
      tick(endless);
    }

    expect(own.hp).toBe(militiaHp);
    expect(friend.hp).toBe(militiaHp);
  });
});
