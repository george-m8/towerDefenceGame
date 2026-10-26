import { describe, expect, it } from "vitest";
import { DEFAULT_SUN, shadowOffset } from "../../src/render/sun";
import { SUN, TILE_SIZE } from "../../src/render/palette";

const length = (sun: number) => Math.hypot(shadowOffset(sun).dx, shadowOffset(sun).dy);
/** The time of day in small steps, sunrise to sunset. */
const day = Array.from({ length: 101 }, (_, i) => i / 100);

describe("shadowOffset", () => {
  it("points straight down at noon, the shortest shadow of the day", () => {
    const noon = shadowOffset(0.5);
    expect(noon.dx).toBeCloseTo(0);
    expect(noon.dy).toBeGreaterThan(0);
    for (const sun of day) expect(length(sun)).toBeGreaterThanOrEqual(length(0.5) - 1e-9);
  });

  it("falls left at sunrise and right at sunset, mirroring each other", () => {
    const sunrise = shadowOffset(0);
    const sunset = shadowOffset(1);
    expect(sunrise.dx).toBeLessThan(0);
    expect(sunset.dx).toBeCloseTo(-sunrise.dx);
    expect(sunset.dy).toBeCloseTo(sunrise.dy);
    expect(shadowOffset(0.2).dx).toBeCloseTo(-shadowOffset(0.8).dx);
    expect(shadowOffset(0.2).dy).toBeCloseTo(shadowOffset(0.8).dy);
  });

  it("never points up the screen", () => {
    for (const sun of day) expect(shadowOffset(sun).dy).toBeGreaterThanOrEqual(0);
  });

  it("keeps the tallest block's shadow within a tile", () => {
    for (const sun of day) expect(length(sun) * SUN.tallestBlock).toBeLessThanOrEqual(TILE_SIZE);
  });

  it("goes mostly sideways to the right by default, about half the caster's height long", () => {
    const { dx, dy } = shadowOffset(DEFAULT_SUN);
    expect(dx).toBeGreaterThan(2 * dy);
    expect(length(DEFAULT_SUN)).toBeGreaterThan(0.4);
    expect(length(DEFAULT_SUN)).toBeLessThan(0.6);
  });
});
