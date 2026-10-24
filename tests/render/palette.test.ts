import { describe, expect, it } from "vitest";
import { facingArrow, glyphFor } from "../../src/render/palette";

describe("glyphFor", () => {
  it("draws directional traps as an arrow for their facing", () => {
    expect(glyphFor("wallSpikes", "N")).toBe("↑");
    expect(glyphFor("wallSpikes", "E")).toBe("→");
    expect(glyphFor("wallSpikes", "S")).toBe("↓");
    expect(glyphFor("wallSpikes", "W")).toBe("←");
  });

  it("keeps towers as letters whatever their facing", () => {
    expect(glyphFor("archer", "E")).toBe("A");
    expect(glyphFor("cannon", "S")).toBe("C");
  });
});

describe("facingArrow", () => {
  it("uses plain-text arrows, never emoji-prone shapes like ▶ or ◀", () => {
    const arrows = (["N", "E", "S", "W"] as const).map(facingArrow);
    expect(new Set(arrows).size).toBe(4);
    for (const arrow of arrows) expect(arrow).toMatch(/^[←-↓]$/);
  });
});
