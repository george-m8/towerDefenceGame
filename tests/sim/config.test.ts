import { describe, expect, it } from "vitest";
import { GRID_HEIGHT, GRID_WIDTH } from "../../src/sim/config";

describe("config", () => {
  it("uses the 216 x 144 grid from the spec", () => {
    expect(GRID_WIDTH).toBe(216);
    expect(GRID_HEIGHT).toBe(144);
  });
});
