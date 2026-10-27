import { describe, expect, it } from "vitest";
import { backdropFocus, botTurn } from "../../src/ui/backdrop";
import { createGame, tick } from "../../src/sim/game";

describe("botTurn", () => {
  it("builds round the keep with the player's gold", () => {
    const state = createGame(7, { fog: false, size: "XL" });
    const gold = state.players[1].gold;
    expect(botTurn(state, 1)).toBe(true);
    expect(state.players[1].gold).toBeLessThan(gold);
  });

  it("keeps a game going with nobody else playing", () => {
    const state = createGame(7, { fog: false, size: "XL" });
    for (let t = 0; t < 20 * 120; t++) {
      if (t % 15 === 0) botTurn(state, 1);
      tick(state);
    }
    const towers = Object.values(state.structures).filter(
      (s) => s.owner === 1 && ["archer", "cannon", "catapult"].includes(s.kind),
    );
    expect(towers.length).toBeGreaterThan(3);
    expect(state.wave.number).toBeGreaterThan(1);
  });

  it("does nothing once the keep has fallen", () => {
    const state = createGame(7, { fog: false });
    state.gameOver = true;
    expect(botTurn(state, 1)).toBe(false);
  });
});

describe("backdropFocus", () => {
  it("looks halfway from the keep to the nearest enemy, or at the keep", () => {
    const state = createGame(7, { fog: false });
    const keep = state.keeps[0];
    const kx = keep.x + keep.size / 2;
    const ky = keep.y + keep.size / 2;
    expect(backdropFocus(state)).toEqual({ x: kx, y: ky });
    state.enemies.push({ x: kx - 10, y: ky } as never, { x: kx - 40, y: ky } as never);
    expect(backdropFocus(state)).toEqual({ x: kx - 5, y: ky });
  });

  it("never strays far from the keep for enemies still far off", () => {
    const state = createGame(7, { fog: false, size: "XL" });
    const keep = state.keeps[0];
    const kx = keep.x + keep.size / 2;
    const ky = keep.y + keep.size / 2;
    state.enemies.push({ x: kx - 100, y: ky } as never);
    expect(backdropFocus(state)).toEqual({ x: kx - 15, y: ky });
  });
});
