import { describe, expect, it } from "vitest";
import {
  inputsFromLimit,
  limitFromInputs,
  readItemsText,
  summary,
} from "../../src/editor/itemsEditor";
import { MAX_ITEM_LIMIT, newItems, serializeItems, withLimit } from "../../src/sim/itemsFile";

describe("a row's inputs", () => {
  it.each([
    [false, "", 0],
    [false, "5", 0],
    [true, "", undefined],
    [true, "  ", undefined],
    [true, "0", undefined],
    [true, "-3", undefined],
    [true, "abc", undefined],
    [true, "4", 4],
    [true, "2.4", 2],
    [true, "100000", MAX_ITEM_LIMIT],
  ])("allowed %s with max %j is a limit of %s", (allowed, max, limit) => {
    expect(limitFromInputs(allowed, max)).toBe(limit);
  });

  it("shows a limit back as the inputs (blank for no limit)", () => {
    expect(inputsFromLimit(undefined)).toEqual({ allowed: true, max: "" });
    expect(inputsFromLimit(0)).toEqual({ allowed: false, max: "" });
    expect(inputsFromLimit(3)).toEqual({ allowed: true, max: "3" });
  });
});

describe("summary", () => {
  it("says what the file does", () => {
    const none = newItems("x");
    expect(summary(none)).toBe("Everything can be built, as many as you like");
    expect(summary(withLimit(none, "archer", 2))).toBe("1 limited");
    expect(summary(withLimit(withLimit(none, "archer", 2), "house", 0))).toBe(
      "1 limited, 1 not allowed",
    );
    expect(summary(withLimit(none, "house", 0))).toBe("1 not allowed");
  });
});

describe("opening an items file from disk", () => {
  it("reads it, or says why not", () => {
    const items = withLimit(newItems("Disk"), "cannon", 1);
    expect(readItemsText(serializeItems(items))).toEqual({ items });
    expect(readItemsText("nope")).toEqual({ error: "it isn't an items file (not JSON)" });
  });
});
