import { describe, expect, it } from "vitest";
import { BURST_DELAY_TICKS, BURST_TICKS } from "../../src/sim/config";
import { burstPixels, burstWaiting } from "../../src/render/burst";
import { TILE_SIZE } from "../../src/render/palette";

const burst = (ttl: number) => ({
  kind: "burst" as const,
  x: 10,
  y: 10,
  ttl,
  enemy: "goblin" as const,
});

describe("burstPixels", () => {
  it("waits a moment after death before bursting", () => {
    const fresh = burst(BURST_DELAY_TICKS + BURST_TICKS);
    expect(burstWaiting(fresh)).toBe(true);
    expect(burstPixels(fresh, 3)).toEqual([]);
    expect(burstWaiting(burst(BURST_TICKS))).toBe(false);
    expect(burstPixels(burst(BURST_TICKS), 3).length).toBeGreaterThan(0);
  });

  it("starts on the tile, fully opaque", () => {
    const pixels = burstPixels(burst(BURST_TICKS), 3);
    expect(pixels.length).toBeGreaterThan(0);
    for (const p of pixels) {
      expect(p.alpha).toBe(1);
      expect(Math.abs(p.x - 10.5 * TILE_SIZE)).toBeLessThanOrEqual(TILE_SIZE / 2);
      expect(Math.abs(p.y - 10.5 * TILE_SIZE)).toBeLessThanOrEqual(TILE_SIZE / 2);
      expect(p.colour).toBeGreaterThanOrEqual(0);
      expect(p.colour).toBeLessThan(3);
    }
  });

  it("flies outward and fades as it runs down", () => {
    const spread = (ttl: number) => {
      const pixels = burstPixels(burst(ttl), 3);
      return Math.max(
        ...pixels.map((p) => Math.hypot(p.x - 10.5 * TILE_SIZE, p.y - 10.5 * TILE_SIZE)),
      );
    };
    expect(spread(2)).toBeGreaterThan(spread(BURST_TICKS - 1));
    expect(burstPixels(burst(2), 3)[0].alpha).toBeLessThan(burstPixels(burst(8), 3)[0].alpha);
  });

  it("looks the same every frame (seeded by where it happened)", () => {
    expect(burstPixels(burst(6), 3)).toEqual(burstPixels(burst(6), 3));
  });

  it("gives structures more, bigger pixels than enemies", () => {
    const wall = burstPixels({ kind: "burst", x: 10, y: 10, ttl: 6, structure: "wall" }, 3);
    const enemy = burstPixels(burst(6), 3);
    expect(wall.length).toBeGreaterThan(enemy.length);
    expect(wall[0].size).toBeGreaterThan(enemy[0].size);
  });
});
