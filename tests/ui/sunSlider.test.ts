import { describe, expect, it } from "vitest";
import { createUiState } from "../../src/ui/state";
import { arcLabel, acrossLabel, toggleSun } from "../../src/ui/sunSlider";
import { DEFAULT_SUN } from "../../src/render/sun";

describe("toggleSun", () => {
  it("turns the sliders on, keeping the sun where it is", () => {
    const ui = createUiState();
    toggleSun(ui);
    expect(ui.showSun).toBe(true);
    expect(ui.sun).toEqual(DEFAULT_SUN);
  });

  it("puts the sun back to the default when turned off", () => {
    const ui = createUiState();
    toggleSun(ui);
    ui.sun.across = 0.8;
    ui.sun.arc = 30;
    toggleSun(ui);
    expect(ui.showSun).toBe(false);
    expect(ui.sun).toEqual(DEFAULT_SUN);
  });

  it("never changes the default itself", () => {
    const ui = createUiState();
    ui.sun.across = 0.8;
    expect(DEFAULT_SUN.across).not.toBe(0.8);
  });
});

describe("labels", () => {
  it("shows across to two places and the arc in whole degrees", () => {
    expect(acrossLabel(0.33)).toBe("Across 0.33");
    expect(arcLabel(80)).toBe("Arc 80°");
  });
});
