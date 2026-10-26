import { describe, expect, it } from "vitest";
import {
  BUILDABLE_KINDS,
  ITEMS_FORMAT,
  ITEMS_VERSION,
  MAX_ITEM_LIMIT,
  newItems,
  parseItems,
  serializeItems,
  withLimit,
  type ItemsFile,
} from "../../src/sim/itemsFile";
import { TOOLS } from "../../src/ui/state";

const sample: ItemsFile = {
  format: ITEMS_FORMAT,
  version: ITEMS_VERSION,
  title: "Towers only",
  limits: { archer: 4, house: 0 },
};

describe("items files", () => {
  it("lists every structure the build picker offers, and nothing else", () => {
    const tools = TOOLS.map((t) => t.tool).filter((t) => t !== "sell");
    expect([...BUILDABLE_KINDS].sort()).toEqual([...tools].sort());
  });

  it("serialize then parse gives back the same file, extra fields included", () => {
    const withExtra = { ...sample, notes: "kept" };
    expect(parseItems(JSON.parse(serializeItems(withExtra)))).toEqual({ items: withExtra });
  });

  it("writes limits in the config's order, whatever order they were set in", () => {
    const text = serializeItems({ ...sample, limits: { house: 0, archer: 4 } });
    expect(text.indexOf('"archer"')).toBeLessThan(text.indexOf('"house"'));
    expect(text.endsWith("\n")).toBe(true);
  });

  it("starts with no limits", () => {
    expect(newItems("New").limits).toEqual({});
  });

  it.each([
    ["not an object", [], "not a JSON object"],
    ["the wrong format", { ...sample, format: "keep-defence-map" }, "isn't an items file"],
    ["a newer version", { ...sample, version: ITEMS_VERSION + 1 }, "newer than this game"],
    ["no version", { ...sample, version: undefined }, "version is missing"],
    ["no title", { ...sample, title: 3 }, "title is missing"],
    ["no limits", { ...sample, limits: [] }, "limits are missing"],
    ["an unknown kind", { ...sample, limits: { dragon: 1 } }, '"dragon" isn\'t something'],
    ["a ruin", { ...sample, limits: { ruin: 1 } }, '"ruin" isn\'t something'],
    ["a negative limit", { ...sample, limits: { archer: -1 } }, "whole number"],
    ["a fraction", { ...sample, limits: { archer: 1.5 } }, "whole number"],
    ["too big a limit", { ...sample, limits: { archer: MAX_ITEM_LIMIT + 1 } }, "whole number"],
  ])("refuses %s, saying why", (_, json, message) => {
    const result = parseItems(json);
    expect("error" in result && result.error).toContain(message);
  });

  it("withLimit sets, rounds, clamps and clears a kind's limit", () => {
    const empty = newItems("x");
    expect(withLimit(empty, "archer", 3).limits).toEqual({ archer: 3 });
    expect(withLimit(empty, "archer", 2.6).limits).toEqual({ archer: 3 });
    expect(withLimit(empty, "archer", 5000).limits).toEqual({ archer: MAX_ITEM_LIMIT });
    expect(withLimit(sample, "archer", undefined).limits).toEqual({ house: 0 });
    expect(sample.limits).toEqual({ archer: 4, house: 0 }); // unchanged
  });
});
