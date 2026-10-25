import { goldOf } from "./helpers";
import { describe, expect, it } from "vitest";
import { ENEMY_KINDS, TICK_RATE, WAVES, type EnemyKindId } from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { pickWaveKind, waveThreatBudget } from "../../src/sim/waves";
import type { GameState } from "../../src/sim/types";

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
  /** The kinds a wave would spawn, drawn the way spawning draws them. */
  function compose(state: GameState, wave: number): EnemyKindId[] {
    const kinds: EnemyKindId[] = [];
    let left = waveThreatBudget(wave);
    for (let kind = pickWaveKind(state, wave, left); kind; kind = pickWaveKind(state, wave, left)) {
      kinds.push(kind);
      left -= ENEMY_KINDS[kind].threat;
    }
    return kinds;
  }

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
