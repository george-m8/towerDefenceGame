import { describe, expect, it } from "vitest";
import { ENEMY_KINDS, GRID_HEIGHT, GRID_WIDTH, type EnemyKind } from "../../src/sim/config";

describe("config", () => {
  it("uses the 153 x 102 grid from the spec", () => {
    expect(GRID_WIDTH).toBe(153);
    expect(GRID_HEIGHT).toBe(102);
  });

  it("names real kinds for every leader and band", () => {
    for (const kind of Object.values(ENEMY_KINDS) as EnemyKind[]) {
      if (kind.leader) expect(ENEMY_KINDS).toHaveProperty(kind.leader);
      if (kind.band) expect(ENEMY_KINDS).toHaveProperty(kind.band.kind);
    }
  });
});
