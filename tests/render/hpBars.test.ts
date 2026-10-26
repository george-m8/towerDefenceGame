import { describe, expect, it } from "vitest";
import { HP_BAR_FADE_MS, HP_BAR_SHOW_MS, createHpBarTracker } from "../../src/render/hpBars";

describe("health bars", () => {
  it("don't show for something that starts out damaged (a ruin) until it's hovered", () => {
    const bars = createHpBarTracker();
    expect(bars.alpha("s1", 30, 0, false)).toBe(0);
    bars.endFrame();
    expect(bars.alpha("s1", 30, 5000, false)).toBe(0);
    expect(bars.alpha("s1", 30, 5000, true)).toBe(1);
  });

  it("show after a hit, then fade out", () => {
    const bars = createHpBarTracker();
    bars.alpha("e1", 10, 0, false);
    bars.endFrame();
    expect(bars.alpha("e1", 8, 100, false)).toBe(1);
    bars.endFrame();
    expect(bars.alpha("e1", 8, 100 + HP_BAR_SHOW_MS, false)).toBe(1);
    bars.endFrame();
    expect(bars.alpha("e1", 8, 100 + HP_BAR_SHOW_MS + HP_BAR_FADE_MS / 2, false)).toBeCloseTo(0.5);
    bars.endFrame();
    expect(bars.alpha("e1", 8, 100 + HP_BAR_SHOW_MS + HP_BAR_FADE_MS, false)).toBe(0);
  });

  it("a new hit shows it again; healing doesn't", () => {
    const bars = createHpBarTracker();
    bars.alpha("u1", 10, 0, false);
    bars.endFrame();
    bars.alpha("u1", 9, 0, false);
    bars.endFrame();
    expect(bars.alpha("u1", 10, 5000, false)).toBe(0);
    bars.endFrame();
    expect(bars.alpha("u1", 7, 6000, false)).toBe(1);
  });

  it("forgets what wasn't drawn last frame", () => {
    const bars = createHpBarTracker();
    bars.alpha("e1", 10, 0, false);
    bars.endFrame();
    bars.endFrame(); // e1 off screen
    expect(bars.alpha("e1", 5, 100, false)).toBe(0); // seen afresh, not a hit
  });
});
