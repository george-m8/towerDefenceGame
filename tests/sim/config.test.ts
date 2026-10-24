import { describe, expect, it } from "vitest";
import { GRID_HEIGHT, GRID_WIDTH } from "../../src/sim/config";

describe("config", () => {
  it("uses the 48 x 32 grid from the spec", () => {
    expect(GRID_WIDTH).toBe(48);
    expect(GRID_HEIGHT).toBe(32);
  });
});
