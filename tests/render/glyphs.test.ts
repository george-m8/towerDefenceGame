import { describe, expect, it } from "vitest";
import { ENEMY_KINDS } from "../../src/sim/config";
import { GLYPHS, KEEP_GLYPH } from "../../src/render/palette";

describe("building symbols", () => {
  it("match the field-units spec (and GLYPHS.md)", () => {
    expect(KEEP_GLYPH).toBe("⛫");
    expect(GLYPHS).toMatchObject({
      house: "⌂",
      shop: "¤",
      farmhouse: "Fa",
      farmland: "𐤄",
      timberYard: "Ti",
      mine: "Mi",
      foragerHut: "Fo",
      guardhouse: "⛨",
      archeryPost: "➶",
      paladinHall: "✠",
      scoutCamp: "⚑",
      barracks: "Ba",
      archeryRange: "◎",
    });
  });

  it("are each one symbol or a two-letter code", () => {
    for (const glyph of [...Object.values(GLYPHS), KEEP_GLYPH]) {
      expect([...glyph].length === 1 || /^[A-Z][a-z]$/.test(glyph), glyph).toBe(true);
    }
  });

  it("never use a character that can turn into a colour emoji", () => {
    for (const glyph of [...Object.values(GLYPHS), KEEP_GLYPH]) {
      // ASCII (like #) is safe; anything else must not have the Emoji property (⚔ ⚒ ⛏ ⚖ ⛺).
      if (/^[\x20-\x7e]+$/.test(glyph)) continue;
      expect(/\p{Emoji}/u.test(glyph), glyph).toBe(false);
    }
  });
});

describe("enemy glyphs", () => {
  it("are unique, and the digger is t (for tunneller)", () => {
    const glyphs = Object.values(ENEMY_KINDS).map((k) => k.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    expect(ENEMY_KINDS.digger.glyph).toBe("t");
  });
});
