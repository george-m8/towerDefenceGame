import { describe, expect, it } from "vitest";
import { createUiState } from "../../src/ui/state";
import { sunLabel, toggleSun } from "../../src/ui/sunSlider";
import { DEFAULT_SUN } from "../../src/render/sun";

describe("toggleSun", () => {
  it("turns the slider on, keeping the time of day", () => {
    const ui = createUiState();
    toggleSun(ui);
    expect(ui.showSun).toBe(true);
    expect(ui.sun).toBe(DEFAULT_SUN);
  });

  it("puts the sun back to the default when turned off", () => {
    const ui = createUiState();
    toggleSun(ui);
    ui.sun = 0.2;
    toggleSun(ui);
    expect(ui.showSun).toBe(false);
    expect(ui.sun).toBe(DEFAULT_SUN);
  });
});

describe("sunLabel", () => {
  it("shows the time of day to two places", () => {
    expect(sunLabel(0.9)).toBe("Sun 0.90");
    expect(sunLabel(0)).toBe("Sun 0.00");
  });
});
