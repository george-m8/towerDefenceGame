import { describe, expect, it } from "vitest";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, topAt } from "../../src/sim/grid";
import { getFlowField } from "../../src/sim/pathfinding";
import { toClientState, toUpdate } from "../../src/net/snapshot";
import {
  applyUpdate,
  fromClientState,
  interpolateEnemies,
  interpolationFraction,
} from "../../src/net/view";
import { describeTile } from "../../src/ui/tileInfo";
import type { ClientEnemy } from "../../src/net/protocol";

/** What a client would receive: JSON round-tripped. */
function overTheWire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

describe("fromClientState", () => {
  it("builds a view the sim helpers and hover info work on", () => {
    const server = createGame(4);
    applyCommand(server, 1, { type: "build", kind: "wall", x: 30, y: 3 });
    const view = fromClientState(overTheWire(toClientState(server)));
    expect(getFlowField(view).dist).toEqual(getFlowField(server).dist);
    expect(topAt(view, 30, 3)?.kind).toBe(topAt(server, 30, 3)?.kind);
    for (const p of [
      { x: 30, y: 3 },
      { x: 10, y: 10 },
      { x: server.keep.x, y: server.keep.y },
    ]) {
      expect(canBuild(view, 1, "archer", p.x, p.y)).toEqual(
        canBuild(server, 1, "archer", p.x, p.y),
      );
      expect(describeTile(view, p)).toEqual(describeTile(server, p));
    }
  });

  it("fills enemy and structure fields the server leaves out", () => {
    const server = createGame(4, { blankMap: true });
    spawnEnemy(server, 0, 12);
    applyCommand(server, 1, { type: "build", kind: "archer", x: 10, y: 10 });
    const view = fromClientState(overTheWire(toClientState(server)));
    expect(view.enemies[0]).toMatchObject({ x: 0, y: 12, tx: 0, ty: 12, killedBy: null });
    expect(Object.values(view.structures)[0].cooldown).toBe(0);
    expect(view.flow).toBeNull();
  });
});

describe("applyUpdate", () => {
  it("copies the dynamic fields, and the grid only when the update carries it", () => {
    const server = createGame(4, { blankMap: true });
    const view = fromClientState(overTheWire(toClientState(server)));
    const before = server.gridVersion;

    tick(server);
    applyUpdate(view, overTheWire(toUpdate(server, server.gridVersion)));
    expect(view.tick).toBe(1);

    applyCommand(server, 1, { type: "build", kind: "wall", x: 5, y: 5 });
    view.base[0] = 123; // a stale value that only a grid update would overwrite
    applyUpdate(view, overTheWire(toUpdate(server, before)));
    expect(view.base).toEqual(server.base);
    expect(view.gridVersion).toBe(server.gridVersion);
    expect(topAt(view, 5, 5)?.owner).toBe(1);
    expect(view.players[1].gold).toBe(server.players[1].gold);
  });
});

describe("interpolateEnemies", () => {
  const e = (id: number, x: number, y: number): ClientEnemy => ({ id, x, y, hp: 10, maxHp: 10 });

  it("moves enemies between their two positions", () => {
    const [mid] = interpolateEnemies([e(1, 0, 0)], [e(1, 2, 4)], 0.5);
    expect(mid).toMatchObject({ id: 1, x: 1, y: 2 });
  });

  it("clamps t to the two updates", () => {
    expect(interpolateEnemies([e(1, 0, 0)], [e(1, 2, 0)], -1)[0].x).toBe(0);
    expect(interpolateEnemies([e(1, 0, 0)], [e(1, 2, 0)], 3)[0].x).toBe(2);
  });

  it("shows new enemies where they are, and drops ones that are gone", () => {
    const result = interpolateEnemies([e(1, 0, 0), e(2, 5, 5)], [e(1, 1, 0), e(3, 9, 9)], 0.5);
    expect(result.map((r) => r.id)).toEqual([1, 3]);
    expect(result[1]).toMatchObject({ x: 9, y: 9 });
  });

  it("lands exactly on the newest position at t = 1", () => {
    const [end] = interpolateEnemies([e(1, 1, 16.1)], [e(1, 1, 16.03)], 1);
    expect(end.y).toBe(16.03);
  });

  it("uses the newest hp", () => {
    const [mid] = interpolateEnemies([{ ...e(1, 0, 0), hp: 10 }], [{ ...e(1, 1, 0), hp: 4 }], 0.5);
    expect(mid.hp).toBe(4);
  });
});

describe("interpolationFraction", () => {
  it("draws one update behind: 0 as the newest arrives, 1 an interval later", () => {
    expect(interpolationFraction(1000, 1100, 1100)).toBe(0);
    expect(interpolationFraction(1000, 1100, 1150)).toBe(0.5);
    expect(interpolationFraction(1000, 1100, 1200)).toBe(1);
    expect(interpolationFraction(1000, 1100, 5000)).toBe(1);
  });

  it("shows the newest positions when two updates arrived together", () => {
    expect(interpolationFraction(1000, 1000, 1000)).toBe(1);
  });
});
