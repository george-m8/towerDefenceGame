import { describe, expect, it } from "vitest";
import { facingArrow, glyphFor } from "../../src/render/palette";

describe("glyphFor", () => {
  it("draws directional traps as an arrow for their facing", () => {
    expect(glyphFor("wallSpikes", "N")).toBe("↑");
    expect(glyphFor("wallSpikes", "E")).toBe("→");
    expect(glyphFor("wallSpikes", "S")).toBe("↓");
    expect(glyphFor("wallSpikes", "W")).toBe("←");
  });

  it("draws archers as an arrow for their facing too", () => {
    expect(glyphFor("archer", "E")).toBe("→");
    expect(glyphFor("archer", "W")).toBe("←");
  });

  it("keeps other towers as letters whatever their facing", () => {
    expect(glyphFor("cannon", "S")).toBe("C");
    expect(glyphFor("catapult", "E")).toBe("P");
  });
});

describe("facingArrow", () => {
  it("uses plain-text arrows, never emoji-prone shapes like ▶ or ◀", () => {
    const arrows = (["N", "E", "S", "W"] as const).map(facingArrow);
    expect(new Set(arrows).size).toBe(4);
    for (const arrow of arrows) expect(arrow).toMatch(/^[←-↓]$/);
  });
});
