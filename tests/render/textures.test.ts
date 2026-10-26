import { describe, expect, it } from "vitest";
import { TILE_SIZE } from "../../src/render/palette";
import {
  TEXTURE_VARIANTS,
  textureSpecks,
  textureVariant,
  type TextureStyle,
} from "../../src/render/textures";

const STYLES: TextureStyle[] = [
  "speckle",
  "pebbles",
  "ore",
  "ripple",
  "stone",
  "crackedStone",
  "ruinedStone",
];

describe("textureSpecks", () => {
  it.each(STYLES)("%s is the same every time, and stays inside the tile", (style) => {
    for (let v = 0; v < TEXTURE_VARIANTS; v++) {
      const specks = textureSpecks(style, v);
      expect(specks).toEqual(textureSpecks(style, v));
      expect(specks.length).toBeGreaterThan(0);
      for (const s of specks) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(TILE_SIZE);
        expect(s.y + s.h).toBeLessThanOrEqual(TILE_SIZE);
      }
    }
  });

  it.each(STYLES)("%s has variants that differ", (style) => {
    const variants = Array.from({ length: TEXTURE_VARIANTS }, (_, v) =>
      JSON.stringify(textureSpecks(style, v)),
    );
    expect(new Set(variants).size).toBe(TEXTURE_VARIANTS);
  });

  it("keeps terrain specks faint, so the tile's colour still shows", () => {
    for (const style of ["speckle", "pebbles", "ripple"] as const) {
      for (const s of textureSpecks(style, 0)) {
        const alpha = Number(s.colour.match(/([\d.]+)\)$/)![1]);
        expect(alpha).toBeLessThanOrEqual(0.15);
      }
    }
  });
});

describe("ore", () => {
  it("has a few flecks of gold in every variant", () => {
    for (let v = 0; v < TEXTURE_VARIANTS; v++) {
      const gold = textureSpecks("ore", v).filter((s) => s.colour.startsWith("rgba(255, 204, 51"));
      expect(gold.length).toBeGreaterThanOrEqual(3);
      expect(gold.length).toBeLessThanOrEqual(5);
    }
  });
});

describe("stone", () => {
  it("lays blocks that line up across tiles: only the grain differs between variants", () => {
    const mortar = (v: number) => textureSpecks("stone", v).filter((s) => s.w > 1 || s.h > 1);
    for (let v = 1; v < TEXTURE_VARIANTS; v++) expect(mortar(v)).toEqual(mortar(0));
  });

  it("offsets every other row of blocks by half a block", () => {
    const joints = (top: number) =>
      textureSpecks("stone", 0)
        .filter((s) => s.y === top && s.h > 1)
        .map((s) => s.x);
    expect(joints(0)).toEqual([0, 10]);
    expect(joints(5)).toEqual([5, 15]);
  });
});

describe("ruined stone", () => {
  it("has blocks knocked out, differently in each variant", () => {
    const holes = (v: number) =>
      textureSpecks("ruinedStone", v).filter((s) => s.colour === "rgba(0, 0, 0, 0.38)");
    const all = Array.from({ length: TEXTURE_VARIANTS }, (_, v) => holes(v));
    expect(all.some((h) => h.length > 0)).toBe(true);
    expect(new Set(all.map((h) => JSON.stringify(h))).size).toBeGreaterThan(1);
  });

  it("keeps whole blocks to the wall's layout, so ruins line up with walls", () => {
    for (const s of textureSpecks("ruinedStone", 0)) {
      if (s.colour !== "rgba(0, 0, 0, 0.38)") continue;
      expect(s.y % 5).toBe(0);
      expect(s.h).toBe(5);
    }
  });
});

describe("textureVariant", () => {
  it("is the same for a tile every time, and scattered across tiles", () => {
    expect(textureVariant(12, 34)).toBe(textureVariant(12, 34));
    const seen = new Set<number>();
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const v = textureVariant(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(TEXTURE_VARIANTS);
        seen.add(v);
      }
    }
    expect(seen.size).toBe(TEXTURE_VARIANTS);
  });
});
