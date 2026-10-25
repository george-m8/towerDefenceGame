import { describe, expect, it } from "vitest";
import { borderColour, borderTrace } from "../../src/render/buildBorder";
import { BUILD_BORDER_LONG } from "../../src/render/palette";

describe("borderTrace", () => {
  it("is empty when building takes no time", () => {
    expect(borderTrace(0)).toEqual([]);
  });

  it("runs clockwise from the top middle", () => {
    expect(borderTrace(0.125)).toEqual([
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(borderTrace(0.25)).toEqual([
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
    ]);
  });

  it("stops part way along a side", () => {
    expect(borderTrace(0.5).at(-1)).toEqual({ x: 0.5, y: 1 });
    expect(borderTrace(0.75).at(-1)).toEqual({ x: 0, y: 0.5 });
  });

  it("goes all the way round at the full time, and no further", () => {
    const full = borderTrace(1);
    expect(full).toHaveLength(6);
    expect(full.at(-1)).toEqual(full[0]);
    expect(borderTrace(1.5)).toEqual(full);
  });
});

describe("borderColour", () => {
  it("is white up to a long wait", () => {
    expect(borderColour(0.1)).toBe("rgb(255, 255, 255)");
    expect(borderColour(BUILD_BORDER_LONG)).toBe("rgb(255, 255, 255)");
  });

  it("turns more orange towards the longest wait", () => {
    const halfway = borderColour((BUILD_BORDER_LONG + 1) / 2);
    expect(halfway).toBe("rgb(255, 188, 128)");
    expect(borderColour(1)).toBe("rgb(255, 120, 0)");
  });
});
