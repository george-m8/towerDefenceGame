import { describe, expect, it } from "vitest";
import { createUiState } from "../../src/ui/state";
import { DEFAULT_SUN } from "../../src/render/sun";

describe("createUiState", () => {
  it("starts at the default time of day, with the sun slider off", () => {
    const ui = createUiState();
    expect(ui.sun).toEqual(DEFAULT_SUN);
    expect(ui.showSun).toBe(false);
  });
});
