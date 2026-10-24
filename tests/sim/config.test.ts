import { describe, expect, it } from "vitest";
import { GRID_HEIGHT, GRID_WIDTH } from "../../src/sim/config";

describe("config", () => {
  it("uses the 153 x 102 grid from the spec", () => {
    expect(GRID_WIDTH).toBe(153);
    expect(GRID_HEIGHT).toBe(102);
  });
});
