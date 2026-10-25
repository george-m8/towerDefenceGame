import { describe, expect, it } from "vitest";
import { ENEMY_KIND_ORDER, ENEMY_KINDS } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { createGame } from "../../src/sim/game";
import {
  discover,
  emptyJournal,
  entryLines,
  foundCount,
  loadJournal,
  saveJournal,
  variantSummary,
} from "../../src/ui/journal";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

/** A fogged game with one enemy beside the keep (in sight) and one far away (in fog). */
function foggyGame() {
  const state = createGame(1, { blankMap: true });
  const keep = state.keeps[0];
  state.wave.number = 3;
  return { state, near: { x: keep.x - 2, y: keep.y }, far: { x: 0, y: 0 } };
}

describe("discover", () => {
  it("unlocks a kind in sight with the current wave, but not one hidden in fog", () => {
    const { state, near, far } = foggyGame();
    spawnEnemy(state, near.x, near.y, { kind: "zerg" });
    spawnEnemy(state, far.x, far.y, { kind: "golem" });
    const journal = emptyJournal();
    expect(discover(journal, state, 1)).toEqual(["zerg"]);
    expect(journal.found).toEqual({ zerg: { firstSeenWave: 3 } });
  });

  it("returns each kind once, and several new kinds in roster order", () => {
    const { state, near } = foggyGame();
    spawnEnemy(state, near.x, near.y, { kind: "golem" });
    spawnEnemy(state, near.x, near.y, { kind: "goblin" });
    spawnEnemy(state, near.x, near.y, { kind: "goblin" });
    const journal = emptyJournal();
    expect(discover(journal, state, 1)).toEqual(["goblin", "golem"]);
    expect(discover(journal, state, 1)).toEqual([]);
  });

  it("records wave 1 for enemies seen before the first wave", () => {
    const { state, near } = foggyGame();
    state.wave.number = 0;
    spawnEnemy(state, near.x, near.y);
    const journal = emptyJournal();
    discover(journal, state, 1);
    expect(journal.found.goblin).toEqual({ firstSeenWave: 1 });
  });
});

describe("journal storage", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const journal = { found: { goblin: { firstSeenWave: 1 }, golem: { firstSeenWave: 12 } } };
    saveJournal(storage, journal);
    expect(loadJournal(storage)).toEqual(journal);
  });

  it("gives an empty journal for missing, blocked or corrupt storage", () => {
    expect(loadJournal(null)).toEqual(emptyJournal());
    expect(loadJournal(memoryStorage())).toEqual(emptyJournal());
    expect(loadJournal(blocked)).toEqual(emptyJournal());
    const corrupt = memoryStorage();
    corrupt.setItem("keep-journal", "{not json");
    expect(loadJournal(corrupt)).toEqual(emptyJournal());
    expect(() => saveJournal(blocked, emptyJournal())).not.toThrow();
  });

  it("drops unknown kinds and bad entries", () => {
    const storage = memoryStorage();
    storage.setItem(
      "keep-journal",
      JSON.stringify({
        found: {
          dragon: { firstSeenWave: 2 },
          zerg: { firstSeenWave: "x" },
          goblin: { firstSeenWave: 4 },
        },
      }),
    );
    expect(loadJournal(storage)).toEqual({ found: { goblin: { firstSeenWave: 4 } } });
  });
});

describe("entries", () => {
  it("describes variants in words", () => {
    const [grunt, runt, brute] = ENEMY_KINDS.goblin.variants;
    expect(variantSummary(runt)).toBe("runt (small): weaker, faster, hits softer");
    expect(variantSummary(brute)).toBe("brute (large): tougher, slower, hits harder");
    expect(variantSummary(grunt)).toBe("grunt: the standard one");
  });

  it("shows a found kind's details, and only a hint for a locked one", () => {
    const journal = { found: { goblin: { firstSeenWave: 3 } } };
    expect(entryLines("goblin", journal)).toEqual([
      "Goblin (g)",
      ENEMY_KINDS.goblin.description,
      "HP 20 · speed 1.5 · hits 5 every 1s · bounty 2",
      "Appears from wave 1 · first seen on wave 3",
      "grunt: the standard one",
      "runt (small): weaker, faster, hits softer",
      "brute (large): tougher, slower, hits harder",
    ]);
    expect(entryLines("golem", journal)).toEqual(["???", "Appears from wave 10"]);
  });

  it("leaves out the variant list for kinds with one variant", () => {
    const journal = { found: { zerg: { firstSeenWave: 3 } } };
    expect(entryLines("zerg", journal)).toHaveLength(4);
  });

  it("counts what's been found out of the whole roster", () => {
    const journal = { found: { goblin: { firstSeenWave: 1 }, zerg: { firstSeenWave: 3 } } };
    expect(foundCount(journal)).toBe(`2 of ${ENEMY_KIND_ORDER.length} found`);
  });

  it("gives every kind a description", () => {
    for (const kind of ENEMY_KIND_ORDER)
      expect(ENEMY_KINDS[kind].description.length).toBeGreaterThan(0);
  });
});
