import { describe, expect, it } from "vitest";
import {
  ENEMY,
  ENEMY_KINDS,
  STRUCTURES,
  TICK_RATE,
  type EnemyKindId,
  type MovementProfile,
} from "../../src/sim/config";
import { damageEnemy, spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, isWalkable, placeStructure, topAt } from "../../src/sim/grid";
import { distanceAt, nextStep } from "../../src/sim/pathfinding";
import type { Enemy, GameState } from "../../src/sim/types";
import {
  buildAt,
  column,
  createGameWithoutWaves,
  paintTerrain,
  ring,
  standsAtKeep,
} from "./helpers";

const ticksPerTile = TICK_RATE / ENEMY_KINDS.goblin.speed;

function run(state: GameState, ticks: number, each?: () => void) {
  for (let i = 0; i < ticks; i++) {
    tick(state);
    each?.();
  }
}

describe("enemy movement", () => {
  it("walks to the keep in the expected time and attacks it on arrival", () => {
    const state = createGameWithoutWaves();
    const start = { x: 0, y: state.keeps[0].y + 1 };
    const tiles = state.keeps[0].x - 1 - start.x; // straight line to the tile beside the keep
    const enemy = spawnEnemy(state, start.x, start.y);

    run(state, Math.floor((tiles - 1) * ticksPerTile));
    expect(state.keeps[0].hp).toBe(state.keeps[0].maxHp);

    run(state, Math.ceil(ticksPerTile));
    expect(state.keeps[0].hp).toBe(state.keeps[0].maxHp - ENEMY_KINDS.goblin.damage);
    expect({ x: enemy.x, y: enemy.y }).toEqual({ x: state.keeps[0].x - 1, y: start.y });
  });

  it("reroutes around a wall placed in its path and never walks through it", () => {
    const state = createGameWithoutWaves();
    const y = state.keeps[0].y + 1;
    spawnEnemy(state, 0, y);
    run(state, Math.ceil(2 * ticksPerTile));
    buildAt(state, [{ x: 10, y }]);

    // Long enough for the detour plus the walk to the keep, whatever the map size.
    run(state, Math.ceil(3 * state.keeps[0].x * ticksPerTile), () => {
      for (const e of state.enemies) {
        expect(topAt(state, Math.round(e.x), Math.round(e.y))).toBeUndefined();
      }
    });
    expect(state.enemies.every((e) => standsAtKeep(state, e))).toBe(true);
    expect(state.keeps[0].hp).toBeLessThan(state.keeps[0].maxHp);
  });

  it("ends the game when keep HP reaches 0, and stops ticking", () => {
    const state = createGameWithoutWaves();
    state.keeps[0].hp = ENEMY_KINDS.goblin.damage;
    spawnEnemy(state, state.keeps[0].x - 1, state.keeps[0].y);
    run(state, Math.ceil(2 * ticksPerTile));
    expect(state.keeps[0].hp).toBe(0);
    expect(state.gameOver).toBe(true);
    const frozen = state.tick;
    tick(state);
    expect(state.tick).toBe(frozen);
  });
});

describe("building near enemies", () => {
  it("rejects building on a tile an enemy is standing on or moving into", () => {
    const state = createGameWithoutWaves();
    const y = state.keeps[0].y + 1;
    spawnEnemy(state, 10, y);
    expect(applyCommand(state, 1, { type: "build", kind: "wall", x: 10, y })).toEqual({
      ok: false,
      reason: "An enemy is in the way",
    });
    tick(state); // now moving from (10, y) towards (11, y)
    expect(applyCommand(state, 1, { type: "build", kind: "wall", x: 11, y }).ok).toBe(false);
    expect(applyCommand(state, 1, { type: "build", kind: "wall", x: 12, y }).ok).toBe(true);
  });
});

describe("wandering", () => {
  it("steps sideways off the path when the wander roll succeeds, never backwards", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGameWithoutWaves(seed);
      state.wanderChance = 1;
      const y = state.keeps[0].y + 1;
      const enemy = spawnEnemy(state, 5, y);
      expect(nextStep(state, enemy.x, enemy.y)).toEqual({ x: 6, y }); // path heads east
      tick(state);
      expect(enemy.tx).toBe(5);
      expect(Math.abs(enemy.ty - y)).toBe(1);
    }
  });

  it("never wanders into a structure", () => {
    const state = createGameWithoutWaves();
    state.wanderChance = 1;
    const y = state.keeps[0].y + 1;
    // Walls on both sides, so the only open tiles are forward and back: it must go forward.
    buildAt(state, [
      { x: 5, y: y - 1 },
      { x: 5, y: y + 1 },
    ]);
    const enemy = spawnEnemy(state, 5, y);
    tick(state);
    expect({ x: enemy.tx, y: enemy.ty }).toEqual({ x: 6, y });
  });

  it("does not wander away from a structure it is attacking", () => {
    const state = createGameWithoutWaves();
    state.wanderChance = 1;
    const k = state.keeps[0];
    buildAt(state, ring(k.x - 1, k.y - 1, k.x + k.size, k.y + k.size));
    const enemy = spawnEnemy(state, k.x - 2, k.y + 1);
    run(state, 3 * TICK_RATE);
    expect({ x: enemy.x, y: enemy.y }).toEqual({ x: k.x - 2, y: k.y + 1 });
    expect(topAt(state, k.x - 1, k.y + 1)!.hp).toBeLessThan(STRUCTURES.wall.maxHp);
  });

  it("never steps straight back onto the tile it just left", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGameWithoutWaves(seed);
      state.wanderChance = 0.5;
      const enemy = spawnEnemy(state, 2, state.keeps[0].y + 1);
      const tiles = [`${enemy.x},${enemy.y}`];
      // Until it reaches the keep, where it stays to attack (the walk plus detours, with room to spare).
      const k = state.keeps[0];
      for (let t = 0; t < 3 * k.x * ticksPerTile && k.hp === k.maxHp; t++) {
        tick(state);
        const target = `${enemy.tx},${enemy.ty}`;
        if (target !== tiles[tiles.length - 1]) tiles.push(target);
      }
      for (let i = 2; i < tiles.length; i++) expect(tiles[i]).not.toBe(tiles[i - 2]);
    }
  });

  it("with the default chance, enemies still reach the keep", () => {
    const state = createGameWithoutWaves();
    state.wanderChance = ENEMY.wanderChance;
    for (let i = 0; i < 10; i++) spawnEnemy(state, 0, state.keeps[0].y + 1);
    // Wandering adds detours: allow three times the straight walk, whatever the map size.
    run(state, Math.ceil(3 * state.keeps[0].x * ticksPerTile));
    expect(state.enemies).toHaveLength(10);
    expect(state.enemies.every((e) => standsAtKeep(state, e))).toBe(true);
    expect(state.keeps[0].hp).toBeLessThan(state.keeps[0].maxHp);
  });
});

describe("breaking through", () => {
  const hitsToBreakWall = Math.ceil(STRUCTURES.wall.maxHp / ENEMY_KINDS.goblin.damage);

  it("attacks only the structure on the cheapest route when the keep is enclosed", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const walls = ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size);
    buildAt(state, walls);
    const y = keep.y + 1;
    spawnEnemy(state, keep.x - 3, y); // two tiles from the ring's left side
    const target = { x: keep.x - 1, y };

    // Walk 1 tile (the first hit lands on the arrival tick), then all but the last hit.
    run(state, Math.ceil(ticksPerTile) + (hitsToBreakWall - 1) * TICK_RATE - 1);
    expect(topAt(state, target.x, target.y)?.hp).toBe(ENEMY_KINDS.goblin.damage);
    const damaged = walls.filter((p) => {
      const s = topAt(state, p.x, p.y);
      return s && s.hp < s.maxHp;
    });
    expect(damaged).toEqual([target]);

    run(state, TICK_RATE);
    expect(topAt(state, target.x, target.y)).toBeUndefined();

    // The enemy continues through the gap to the keep.
    run(state, Math.ceil(3 * ticksPerTile));
    expect(state.enemies.every((e) => standsAtKeep(state, e))).toBe(true);
    expect(state.keeps[0].hp).toBeLessThan(state.keeps[0].maxHp);
  });

  it("never damages structures when an open route exists", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    // Enclose the keep except for one gap on the far (right) side.
    const gap = { x: keep.x + keep.size, y: keep.y + 1 };
    const walls = ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size).filter(
      (p) => p.x !== gap.x || p.y !== gap.y,
    );
    buildAt(state, walls);
    spawnEnemy(state, 0, keep.y + 1);
    // Long enough to walk round to the gap on the far side, whatever the map size.
    run(state, Math.ceil(3 * keep.x * ticksPerTile));
    expect(state.keeps[0].hp).toBeLessThan(state.keeps[0].maxHp);
    for (const p of walls) {
      const s = topAt(state, p.x, p.y)!;
      expect(s.hp).toBe(s.maxHp);
    }
  });
});

describe("damageEnemy", () => {
  it("records who struck the killing blow, not who hit first", () => {
    const state = createGameWithoutWaves();
    const enemy = spawnEnemy(state, 5, 5, { hp: 10 });
    damageEnemy(enemy, 6, 1);
    expect(enemy.killedBy).toBeNull();
    damageEnemy(enemy, 4, 2);
    expect(enemy.hp).toBe(0);
    expect(enemy.killedBy).toBe(2);
  });

  it("ignores hits on an enemy that is already dead", () => {
    const state = createGameWithoutWaves();
    const enemy = spawnEnemy(state, 5, 5, { hp: 10 });
    damageEnemy(enemy, 15, 1);
    damageEnemy(enemy, 15, 2);
    expect(enemy.hp).toBe(-5);
    expect(enemy.killedBy).toBe(1);
  });
});

describe("enemy kinds", () => {
  it("spawns a goblin grunt with today's numbers by default", () => {
    const state = createGameWithoutWaves();
    const enemy = spawnEnemy(state, 5, 5);
    expect(enemy.kind).toBe("goblin");
    expect(ENEMY_KINDS.goblin.variants[enemy.variant].name).toBe("grunt");
    expect(enemy).toMatchObject({ hp: 20, maxHp: 20, speed: 1.5, damage: 5, bounty: 2 });
    expect(enemy.attackInterval).toBe(TICK_RATE);
  });

  it("scales HP and bounty with the wave it spawns in", () => {
    const state = createGameWithoutWaves();
    const enemy = spawnEnemy(state, 5, 5, { wave: 6 });
    expect(enemy.maxHp).toBe(Math.round(20 * (1 + 0.15 * 5)));
    expect(enemy.bounty).toBe(3);
  });

  it("keeps the stats it spawned with when config changes later", () => {
    const state = createGameWithoutWaves();
    const enemy = spawnEnemy(state, 5, 5);
    const original = ENEMY_KINDS.goblin.speed;
    ENEMY_KINDS.goblin.speed = 10;
    try {
      expect(enemy.speed).toBe(original);
    } finally {
      ENEMY_KINDS.goblin.speed = original;
    }
  });

  it("moves at its own speed", () => {
    const state = createGameWithoutWaves();
    const y = state.keeps[0].y + 1;
    const slow = spawnEnemy(state, 0, y);
    const fast = spawnEnemy(state, 0, y);
    fast.speed = slow.speed * 2;
    run(state, 2 * TICK_RATE); // 3 tiles at 1.5 tiles per second
    expect(slow.x).toBeCloseTo(3);
    expect(fast.x).toBeCloseTo(6);
  });
});

describe("the roster", () => {
  const ROSTER = [
    ["goblin", "g", 20, 1.5, 5, 1.0, 2],
    ["zerg", "z", 6, 1.8, 2, 0.6, 1],
    ["wolfRider", "w", 14, 3.0, 4, 0.8, 3],
    ["barbarian", "b", 30, 1.8, 4, 0.6, 3],
    ["dwarf", "d", 45, 1.0, 8, 1.2, 4],
    ["barbarianChief", "B", 90, 1.2, 8, 0.5, 10],
    ["dwarfThane", "D", 120, 0.9, 14, 1.2, 12],
    ["golem", "G", 250, 0.6, 40, 3.0, 20],
  ] as const;

  it.each(ROSTER)(
    "%s (%s) has its spec stats",
    (kind, glyph, hp, speed, damage, interval, bounty) => {
      expect(ENEMY_KINDS[kind]).toMatchObject({
        glyph,
        hp,
        speed,
        damage,
        attackInterval: interval,
        bounty,
      });
    },
  );

  it("scales every kind's HP and bounty by wave", () => {
    const state = createGameWithoutWaves();
    const golem = spawnEnemy(state, 5, 5, { kind: "golem", wave: 11 });
    expect(golem.maxHp).toBe(Math.round(250 * 2.5));
    expect(golem.bounty).toBe(22);
    expect(golem.attackInterval).toBe(3 * TICK_RATE);
  });

  /** Wall damage after `ticks`, for an enemy starting next to the wall: hits on ticks 1, 1 + I, 1 + 2I... */
  function wallDamageAfter(kind: EnemyKindId, ticks: number) {
    const state = createGameWithoutWaves();
    const k = state.keeps[0];
    buildAt(state, ring(k.x - 1, k.y - 1, k.x + k.size, k.y + k.size));
    spawnEnemy(state, k.x - 2, k.y + 1, { kind, hp: 1e6 });
    run(state, ticks);
    return STRUCTURES.wall.maxHp - (topAt(state, k.x - 1, k.y + 1)?.hp ?? 0); // destroyed = all of it
  }

  it("hits a wall in the way with its own damage and interval", () => {
    expect(wallDamageAfter("golem", 3 * TICK_RATE)).toBe(40); // one hit
    expect(wallDamageAfter("golem", 3 * TICK_RATE + 1)).toBe(Math.min(80, STRUCTURES.wall.maxHp)); // the second lands 3 s later
    expect(wallDamageAfter("zerg", 0.6 * 2 * TICK_RATE + 1)).toBe(6); // three hits, 0.6 s apart
  });

  it("a wolf rider covers ground twice as fast as a goblin", () => {
    const state = createGameWithoutWaves();
    const y = state.keeps[0].y + 1;
    const goblin = spawnEnemy(state, 0, y);
    const wolf = spawnEnemy(state, 0, y, { kind: "wolfRider" });
    run(state, 2 * TICK_RATE);
    expect(wolf.x).toBeCloseTo(2 * goblin.x);
  });
});

describe("attacking the keep", () => {
  it("stands next to the keep and hits it once per interval instead of vanishing", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const enemy = spawnEnemy(state, keep.x - 1, keep.y);
    tick(state);
    expect(keep.hp).toBe(keep.maxHp - enemy.damage);
    run(state, enemy.attackInterval - 1);
    expect(keep.hp).toBe(keep.maxHp - enemy.damage);
    tick(state);
    expect(keep.hp).toBe(keep.maxHp - 2 * enemy.damage);
    expect(state.enemies).toEqual([enemy]);
    expect({ x: enemy.x, y: enemy.y }).toEqual({ x: keep.x - 1, y: keep.y });
  });

  it("stops hitting once killed", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const enemy = spawnEnemy(state, keep.x - 1, keep.y);
    tick(state);
    damageEnemy(enemy, enemy.hp, 1);
    run(state, 5 * TICK_RATE);
    expect(state.enemies).toHaveLength(0);
    expect(keep.hp).toBe(keep.maxHp - enemy.damage);
  });

  it("can be shot by a tower while it stands at the keep", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    placeStructure(state, "archer", keep.x - 3, keep.y, "E", 1);
    spawnEnemy(state, keep.x - 1, keep.y);
    run(state, 10 * TICK_RATE);
    expect(state.enemies).toHaveLength(0);
    expect(keep.hp).toBeGreaterThan(0);
  });

  it("starts the keep at 300 HP", () => {
    const state = createGameWithoutWaves();
    expect(state.keeps[0].maxHp).toBe(300);
  });
});

describe("variants", () => {
  function variantIndex(kind: EnemyKindId, name: string) {
    return ENEMY_KINDS[kind].variants.findIndex((v) => v.name === name);
  }

  it("has the spec's variants, standard first", () => {
    const names = (kind: EnemyKindId) => ENEMY_KINDS[kind].variants.map((v) => v.name);
    expect(names("goblin")).toEqual(["grunt", "runt", "brute"]);
    expect(names("zerg")).toEqual(["drone"]);
    expect(names("wolfRider")).toEqual(["raider", "scout"]);
    expect(names("barbarian")).toEqual(["raider", "berserker"]);
    expect(names("dwarf")).toEqual(["warrior", "miner", "ironclad"]);
    expect(names("barbarianChief")).toEqual(["warlord"]);
    expect(names("dwarfThane")).toEqual(["thane"]);
    expect(names("golem")).toEqual(["stone", "iron"]);
    for (const kind of Object.keys(ENEMY_KINDS) as EnemyKindId[]) {
      expect(ENEMY_KINDS[kind].variants[0]).toMatchObject({
        hp: 1,
        speed: 1,
        damage: 1,
        size: "normal",
      });
    }
  });

  it("applies the variant's multipliers on top of kind and wave", () => {
    const state = createGameWithoutWaves();
    const brute = spawnEnemy(state, 5, 5, {
      kind: "goblin",
      variant: variantIndex("goblin", "brute"),
      wave: 3,
    });
    expect(brute.maxHp).toBe(Math.round(20 * 1.4 * 1.3));
    expect(brute.speed).toBeCloseTo(1.5 * 0.9);
    expect(brute.damage).toBe(7); // 6.5, rounded to whole damage
  });

  it("always hits for whole damage, so HP never shows fractions", () => {
    const state = createGameWithoutWaves();
    for (const kind of Object.keys(ENEMY_KINDS) as EnemyKindId[]) {
      ENEMY_KINDS[kind].variants.forEach((_, variant) => {
        expect(Number.isInteger(spawnEnemy(state, 5, 5, { kind, variant }).damage)).toBe(true);
      });
    }
  });

  it("rolls the same variants for the same seed", () => {
    const roll = () => {
      const state = createGameWithoutWaves(7);
      return Array.from(
        { length: 50 },
        () => spawnEnemy(state, 5, 5, { variant: "random" }).variant,
      );
    };
    expect(roll()).toEqual(roll());
    expect(new Set(roll()).size).toBe(3);
  });

  it("rolls each variant in proportion to its weight", () => {
    const state = createGameWithoutWaves();
    const counts = [0, 0, 0];
    const rolls = 10_000;
    for (let i = 0; i < rolls; i++)
      counts[spawnEnemy(state, 5, 5, { variant: "random" }).variant]++;
    state.enemies = [];
    const variants = ENEMY_KINDS.goblin.variants;
    const total = variants.reduce((sum, v) => sum + v.weight, 0);
    variants.forEach((v, i) =>
      expect(Math.abs(counts[i] / rolls - v.weight / total)).toBeLessThan(0.02),
    );
  });
});

describe("wandering and terrain", () => {
  it("never wanders sideways onto rock or water", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = createGameWithoutWaves(seed);
      state.wanderChance = 1;
      const y = state.keeps[0].y + 1;
      paintTerrain(state, [{ x: 5, y: y - 1 }], "rock");
      paintTerrain(state, [{ x: 5, y: y + 1 }], "river");
      const enemy = spawnEnemy(state, 5, y);
      tick(state);
      expect({ x: enemy.tx, y: enemy.ty }).toEqual({ x: 6, y });
    }
  });

  it("keeps every enemy on crossable ground on generated maps", () => {
    for (let seed = 1; seed <= 3; seed++) {
      const state = createGame(seed, { fog: false });
      state.wanderChance = 0.5;
      state.wave.countdown = 1;
      for (let t = 0; t < 40 * TICK_RATE && !state.gameOver; t++) {
        tick(state);
        for (const e of state.enemies) expect(isWalkable(state, e.tx, e.ty)).toBe(true);
      }
    }
  });
});

describe("breachers", () => {
  it("a dwarf breaks through a long wall line while a goblin walks round it", () => {
    const damagedBy = (kind: EnemyKindId) => {
      const state = createGameWithoutWaves();
      const keep = state.keeps[0];
      const wallX = keep.x - 4;
      buildAt(state, column(state, wallX, [0]));
      spawnEnemy(state, wallX - 2, keep.y + 1, { kind, hp: 1e6 });
      run(state, 30 * TICK_RATE);
      return column(state, wallX, [0]).filter((p) => {
        const wall = topAt(state, p.x, p.y);
        return !wall || wall.hp < wall.maxHp;
      }).length;
    };
    expect(damagedBy("dwarf")).toBeGreaterThan(0);
    expect(damagedBy("goblin")).toBe(0);
  });

  it("dwarves, thanes and golems breach; the rest follow", () => {
    const breachers = (Object.keys(ENEMY_KINDS) as EnemyKindId[]).filter(
      (k) => ENEMY_KINDS[k].profile === "breacher",
    );
    expect(breachers.sort()).toEqual(["dwarf", "dwarfThane", "golem"]);
  });
});

describe("marines", () => {
  it("are marines and marine captains, with the spec's stats", () => {
    expect(ENEMY_KINDS.marine).toMatchObject({
      glyph: "m",
      hp: 25,
      speed: 1.4,
      damage: 5,
      profile: "marine",
      firstWave: 7,
    });
    expect(ENEMY_KINDS.marineCaptain).toMatchObject({
      glyph: "M",
      hp: 60,
      speed: 1.2,
      damage: 10,
      profile: "marine",
      firstWave: 11,
    });
  });

  it("stop a bridge being built on the river tile they're in", () => {
    const state = createGameWithoutWaves();
    paintTerrain(state, [{ x: 5, y: 5 }], "river");
    spawnEnemy(state, 5, 5, { kind: "marine" });
    expect(canBuild(state, 1, "bridge", 5, 5)).toEqual({
      ok: false,
      reason: "An enemy is in the way",
    });
  });
});

describe("bands", () => {
  /** A tile in the keep's row, `dx` tiles to its left: enemies there walk straight east. */
  function lane(state: GameState, dx: number) {
    return { x: state.keeps[0].x - dx, y: state.keeps[0].y + 1 };
  }

  /** A wall across the whole map `dx` tiles left of the keep, open only at the top row. */
  function barrier(state: GameState, dx: number, hp: number) {
    const x = state.keeps[0].x - dx;
    buildAt(state, column(state, x, [0]));
    for (const s of Object.values(state.structures)) s.hp = s.maxHp = hp;
    return () => Object.values(state.structures).reduce((sum, s) => sum + s.hp, 0);
  }

  const distance = (state: GameState, e: Enemy, profile: MovementProfile) =>
    distanceAt(state, e.tx, e.ty, profile);

  it("barbarians follow chiefs and dwarves follow thanes", () => {
    expect(ENEMY_KINDS.barbarian.leader).toBe("barbarianChief");
    expect(ENEMY_KINDS.dwarf.leader).toBe("dwarfThane");
    expect(ENEMY_KINDS.barbarianChief.band).toEqual({ kind: "barbarian", min: 2, max: 4 });
    expect(ENEMY_KINDS.dwarfThane.band).toEqual({ kind: "dwarf", min: 2, max: 3 });
  });

  it("a member waits rather than get more than 1 tile ahead of its leader", () => {
    const state = createGameWithoutWaves();
    const start = lane(state, 17);
    const chief = spawnEnemy(state, start.x - 3, start.y, { kind: "barbarianChief" });
    const member = spawnEnemy(state, start.x, start.y, { kind: "barbarian", leader: chief });

    run(state, 20);
    expect(member.x).toBe(start.x);

    run(state, 20);
    for (let i = 0; i < 200; i++) {
      tick(state);
      expect(distance(state, member, "follower")).toBeGreaterThanOrEqual(
        distance(state, chief, "follower") - 1,
      );
    }
    expect(member.x).toBeGreaterThan(start.x);
  });

  it("a member more than 4 tiles behind moves at 1.3x speed", () => {
    const state = createGameWithoutWaves();
    const start = lane(state, 20);
    const chief = spawnEnemy(state, start.x + 6, start.y, { kind: "barbarianChief" });
    const member = spawnEnemy(state, start.x, start.y, { kind: "barbarian", leader: chief });

    tick(state);

    expect(member.x - start.x).toBeCloseTo((1.3 * ENEMY_KINDS.barbarian.speed) / TICK_RATE);
  });

  it("members use the leader's profile and pile in on the wall it breaks", () => {
    const withBand = createGameWithoutWaves();
    const bandHp = barrier(withBand, 5, 300);
    const thane = spawnEnemy(withBand, lane(withBand, 10).x, lane(withBand, 10).y, {
      kind: "dwarfThane",
    });
    const member = spawnEnemy(withBand, thane.x, thane.y, { kind: "barbarian", leader: thane });

    const alone = createGameWithoutWaves();
    const aloneHp = barrier(alone, 5, 300);
    spawnEnemy(alone, thane.x, thane.y, { kind: "dwarfThane" });

    run(withBand, 300);
    run(alone, 300);

    expect(Math.abs(member.y - thane.y)).toBeLessThanOrEqual(1); // didn't walk round
    expect(bandHp()).toBeLessThan(aloneHp());
  });

  it("members carry on alone with their own profile when the leader dies", () => {
    const state = createGameWithoutWaves();
    barrier(state, 5, 300);
    const p = lane(state, 10);
    const thane = spawnEnemy(state, p.x, p.y, { kind: "dwarfThane" });
    const member = spawnEnemy(state, p.x, p.y, { kind: "barbarian", leader: thane });
    run(state, 5);

    damageEnemy(thane, thane.hp, 1);
    run(state, 40);

    expect(member.leaderId).toBeNull();
    const at = { x: Math.round(member.x), y: Math.round(member.y) };
    run(state, 200);
    expect(member.y).toBeLessThan(at.y); // heading for the gap at the top, like any barbarian
  });
});
