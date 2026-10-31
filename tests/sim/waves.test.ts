import { goldOf } from "./helpers";
import { describe, expect, it } from "vitest";
import {
  ENEMY_KINDS,
  TICK_RATE,
  WAVES,
  bandOf,
  type EnemyKind,
  type EnemyKindId,
} from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { pickWaveGroup, sendWaveEarly, waveThreatBudget } from "../../src/sim/waves";
import { isDebugCommand, type GameState } from "../../src/sim/types";

const countdownTicks = WAVES.countdownSeconds * TICK_RATE;
const intervalTicks = WAVES.spawnIntervalSeconds * TICK_RATE;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

describe("wave formulas", () => {
  it("wave N has a threat budget of 5 + 3N (one goblin is 1 threat)", () => {
    expect(waveThreatBudget(1)).toBe(8);
    expect(waveThreatBudget(5)).toBe(20);
    expect(waveThreatBudget(20)).toBe(65);
  });
});

describe("the stopgap mix", () => {
  /** The groups a wave would spawn (a leader first, then its band), drawn as spawning draws them. */
  function groups(state: GameState, wave: number): EnemyKindId[][] {
    const all: EnemyKindId[][] = [];
    let left = waveThreatBudget(wave);
    for (let g = pickWaveGroup(state, wave, left); g; g = pickWaveGroup(state, wave, left)) {
      all.push(g);
      left -= threatOf(g);
    }
    return all;
  }
  const compose = (state: GameState, wave: number) => groups(state, wave).flat();
  const threatOf = (kinds: EnemyKindId[]) =>
    kinds.reduce((sum, kind) => sum + ENEMY_KINDS[kind].threat, 0);

  it("makes waves 1 and 2 today's 8 and 11 goblins", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(compose(state, 1)).toEqual(Array(8).fill("goblin"));
    expect(compose(state, 2)).toEqual(Array(11).fill("goblin"));
  });

  it("never sends a kind before its first wave, or more threat than the budget", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const seen = new Set<EnemyKindId>();
    for (let wave = 1; wave <= 30; wave++) {
      const kinds = compose(state, wave);
      for (const kind of kinds) expect(ENEMY_KINDS[kind].firstWave).toBeLessThanOrEqual(wave);
      const threat = kinds.reduce((sum, kind) => sum + ENEMY_KINDS[kind].threat, 0);
      expect(threat).toBeLessThanOrEqual(waveThreatBudget(wave) + 1e-9);
      kinds.forEach((kind) => seen.add(kind));
    }
    expect(seen.size).toBe(Object.keys(ENEMY_KINDS).length); // every kind turns up by wave 30
  });

  it("draws leaders with a band of the right size, and only when the smallest band fits", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    let leaders = 0;
    for (let wave = 1; wave <= 30; wave++) {
      for (const [first, ...rest] of groups(state, wave)) {
        const band = bandOf(first);
        if (!band) {
          expect(rest).toEqual([]);
          continue;
        }
        leaders++;
        expect(rest.every((kind) => kind === band.kind)).toBe(true);
        expect(rest.length).toBeGreaterThanOrEqual(band.min);
        expect(rest.length).toBeLessThanOrEqual(band.max);
      }
    }
    expect(leaders).toBeGreaterThan(0);

    const chief = ENEMY_KINDS.barbarianChief;
    const justShort = chief.threat + 2 * ENEMY_KINDS.barbarian.threat - 1;
    for (let i = 0; i < 200; i++) {
      expect(pickWaveGroup(state, 30, justShort)?.[0]).not.toBe("barbarianChief");
    }
  });

  it("spawns each band on its leader's tile, following it", () => {
    const state = createGame(3, { blankMap: true, fog: false });
    state.wanderChance = 0;
    state.wave.number = 14;
    sendWaveEarly(state, 1);
    const spawned = new Map<number, { x: number; y: number }>();
    while (state.wave.threatLeft > 0) {
      tick(state);
      for (const e of state.enemies) if (!spawned.has(e.id)) spawned.set(e.id, { x: e.x, y: e.y });
    }
    const members = state.enemies.filter((e) => e.leaderId !== null);
    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      const leader = state.enemies.find((e) => e.id === member.leaderId)!;
      expect((ENEMY_KINDS[member.kind] as EnemyKind).leader).toBe(leader.kind);
      expect(spawned.get(member.id)).toEqual(spawned.get(leader.id));
    }
  });

  it("composes the same wave from the same seed", () => {
    const a = createGame(9, { blankMap: true, fog: false });
    const b = createGame(9, { blankMap: true, fog: false });
    expect(compose(a, 12)).toEqual(compose(b, 12));
  });
});

describe("wave schedule", () => {
  it("starts wave 1 after the first countdown", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    run(state, countdownTicks - 1);
    expect(state.wave.number).toBe(0);
    tick(state);
    expect(state.wave.number).toBe(1);
    expect(state.enemies).toHaveLength(1);
    const [first] = state.enemies;
    expect(state.spawnTiles).toContainEqual({ x: first.x, y: first.y });
  });

  it("staggers spawns and gives them the wave's HP and bounty", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    run(state, countdownTicks);
    run(state, intervalTicks);
    expect(state.enemies).toHaveLength(2);
    run(state, intervalTicks * (waveThreatBudget(1) - 2));
    expect(state.enemies).toHaveLength(waveThreatBudget(1));
    for (const e of state.enemies) {
      const variant = ENEMY_KINDS.goblin.variants[e.variant];
      expect(e.kind).toBe("goblin");
      expect(e.maxHp).toBe(Math.round(ENEMY_KINDS.goblin.hp * variant.hp));
      expect(e.bounty).toBe(ENEMY_KINDS.goblin.bounty);
    }
    // Variants are rolled: over a few waves' worth, more than one turns up.
    expect(new Set(state.enemies.map((e) => e.variant)).size).toBeGreaterThan(1);
  });

  it("starts the next countdown once spawning finishes, then the next wave", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    run(state, countdownTicks); // wave 1 starts, first enemy spawned
    run(state, intervalTicks * (waveThreatBudget(1) - 1)); // last enemy spawned
    expect(state.wave.threatLeft).toBe(0);
    run(state, countdownTicks - 1);
    expect(state.wave.number).toBe(1);
    tick(state);
    expect(state.wave.number).toBe(2);
  });
});

describe("send wave early", () => {
  it("starts the next wave now and pays 1 gold per full second skipped", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    run(state, TICK_RATE * 5 + 7); // 14.65s left
    const gold = goldOf(state);
    expect(applyCommand(state, 1, { type: "sendWave" })).toEqual({ ok: true });
    expect(goldOf(state)).toBe(gold + 14 * WAVES.earlySendGoldPerSecond);
    expect(state.wave.number).toBe(1);
    tick(state);
    expect(state.enemies).toHaveLength(1);
  });

  it("is rejected while a wave is still spawning", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    applyCommand(state, 1, { type: "sendWave" });
    expect(applyCommand(state, 1, { type: "sendWave" })).toEqual({
      ok: false,
      reason: "Wave still spawning",
    });
  });
});

describe("a campaign level's last wave", () => {
  /** A level game whose last wave (2) has just finished spawning. */
  function lastWaveIn(): GameState {
    const state = createGame(3, { blankMap: true, fog: false, lastWave: 2 });
    state.wave.number = 1;
    sendWaveEarly(state, 1);
    while (state.wave.threatLeft > 0) tick(state);
    return state;
  }

  it("is the last: no wave comes after it, and none can be sent early", () => {
    const state = lastWaveIn();
    expect(state.wave.number).toBe(2);
    expect(sendWaveEarly(state, 1)).toEqual({ ok: false, reason: "That was the last wave" });
    state.debug.infiniteKeep = true;
    run(state, countdownTicks * 2);
    expect(state.wave.number).toBe(2);
  });

  it("wins once every enemy of it is dead, with the keep standing", () => {
    const state = lastWaveIn();
    expect(state.enemies.length).toBeGreaterThan(0);
    tick(state);
    expect(state.won).toBe(false);
    state.enemies = [];
    tick(state);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(true);
  });

  it("isn't won if the keep falls", () => {
    const state = lastWaveIn();
    state.enemies = [];
    state.keeps[0].hp = 0;
    tick(state);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(false);
  });

  it("isn't there in other games: the waves go on", () => {
    const state = createGame(3, { blankMap: true, fog: false });
    expect(state.lastWave).toBeNull();
    state.wave.number = 40;
    expect(sendWaveEarly(state, 1).ok).toBe(true);
  });

  it("can be skipped with debugWin, which wins the level there and then", () => {
    const state = createGame(3, { blankMap: true, fog: false, lastWave: 5 });
    expect(isDebugCommand({ type: "debugWin" })).toBe(true);
    expect(applyCommand(state, 1, { type: "debugWin" })).toEqual({ ok: true });
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(true);
    expect(applyCommand(state, 1, { type: "debugWin" }).ok).toBe(false);
    const endless = createGame(3, { blankMap: true, fog: false });
    expect(applyCommand(endless, 1, { type: "debugWin" }).ok).toBe(false);
    expect(endless.gameOver).toBe(false);
  });
});
