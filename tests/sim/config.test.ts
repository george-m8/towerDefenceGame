import { describe, expect, it } from "vitest";
import { GRID_HEIGHT, GRID_WIDTH } from "../../src/sim/config";

describe("config", () => {
  it("uses the 108 x 72 grid from the spec", () => {
    expect(GRID_WIDTH).toBe(108);
    expect(GRID_HEIGHT).toBe(72);
  });
});
