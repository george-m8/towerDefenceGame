import { describe, expect, it } from "vitest";
import { glyphFor } from "../../src/render/palette";

describe("glyphFor", () => {
  it("draws directional traps as arrows", () => {
    expect(glyphFor("wallSpikes", "E")).toBe("▶");
  });

  it("keeps towers as letters whatever their facing", () => {
    expect(glyphFor("archer", "E")).toBe("A");
    expect(glyphFor("cannon", "S")).toBe("C");
  });
});
