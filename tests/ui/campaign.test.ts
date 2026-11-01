import { describe, expect, it } from "vitest";
import { LEVEL_SLOTS, levelSlots, loadProgress, recordStars } from "../../src/ui/campaign";

function memory(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("campaign progress", () => {
  it("starts with no stars, and survives blocked or garbled storage", () => {
    expect(loadProgress(memory(), "Ann")).toEqual({});
    expect(loadProgress(null, "Ann")).toEqual({});
    expect(loadProgress(memory({ "keep-defence-campaign": "{nope" }), "Ann")).toEqual({});
    const odd = JSON.stringify({ Ann: { a: 2, b: "3", c: 0, d: 7, e: 1.5 } });
    expect(loadProgress(memory({ "keep-defence-campaign": odd }), "Ann")).toEqual({ a: 2, d: 3 });
  });

  it("keeps each player's best stars per level", () => {
    const storage = memory();
    recordStars(storage, "Ann", "a", 2);
    recordStars(storage, "Ann", "a", 1);
    recordStars(storage, "Bo", "a", 3);
    expect(recordStars(storage, "Ann", "b", 9)).toEqual({ a: 2, b: 3 });
    expect(loadProgress(storage, "Ann")).toEqual({ a: 2, b: 3 });
    expect(loadProgress(storage, "Bo")).toEqual({ a: 3 });
  });
});

describe("levelSlots", () => {
  it("fills the grid, with only the first level open to start with", () => {
    const slots = levelSlots(["a", "b"], {});
    expect(slots).toHaveLength(LEVEL_SLOTS);
    expect(slots[0]).toEqual({ name: "a", unlocked: true, stars: 0 });
    expect(slots[1]).toEqual({ name: "b", unlocked: false, stars: 0 });
    expect(slots.slice(2).every((s) => s.name === null && !s.unlocked)).toBe(true);
  });

  it("opens each level once the one before has a star", () => {
    const slots = levelSlots(["a", "b", "c"], { a: 1, b: 3 });
    expect(slots.map((s) => [s.unlocked, s.stars])).toEqual([
      [true, 1],
      [true, 3],
      [true, 0],
      ...Array(LEVEL_SLOTS - 3).fill([false, 0]),
    ]);
  });

  it("grows past the grid when there are more levels than slots", () => {
    const names = Array.from({ length: LEVEL_SLOTS + 2 }, (_, i) => `l${i}`);
    expect(levelSlots(names, {})).toHaveLength(LEVEL_SLOTS + 2);
  });
});
