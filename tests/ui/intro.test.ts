import { describe, expect, it } from "vitest";
import { TAGLINES, pickTagline } from "../../src/ui/intro";

describe("pickTagline", () => {
  it("includes the requested taglines", () => {
    expect(TAGLINES).toEqual(
      expect.arrayContaining([
        "Build and fight with friends",
        "Keep it together",
        "Keep on trucking",
      ]),
    );
  });

  it("picks across the whole list, including both ends", () => {
    expect(pickTagline(() => 0)).toBe(TAGLINES[0]);
    expect(pickTagline(() => 0.999999)).toBe(TAGLINES[TAGLINES.length - 1]);
    const seen = new Set(Array.from({ length: 100 }, (_, i) => pickTagline(() => i / 100)));
    expect(seen.size).toBe(TAGLINES.length);
  });
});
