import type { Facing, StructureKind, Terrain } from "../sim/types";

export const TILE_SIZE = 20;
/** Height of the strip drawn along the top of a wall-mounted tower. */
export const BATTLEMENT_PX = 3;
export const GLYPH_FONT = `bold ${TILE_SIZE - 4}px Menlo, Consolas, monospace`;
/** Slightly smaller font so a two-digit HP fits inside one tile. */
export const KEEP_HP_FONT = `bold ${TILE_SIZE - 6}px Menlo, Consolas, monospace`;

export const COLOURS = {
  ground: "#2b2418",
  groundAlt: "#2f2819",
  spawn: "#4a1c1c",
  spawnGlyph: "#8a3a3a",
  keep: "#6b6b6b",
  keepGlyph: "#ffffff",
  ghostOk: "rgba(255, 255, 255, 0.35)",
  ghostBad: "rgba(255, 60, 60, 0.45)",
  ghostSell: "rgba(255, 210, 60, 0.55)",
  enemy: "#ff5f4a",
  hpBack: "#000000",
  hpFront: "#5fdc5f",
  flowArrow: "rgba(120, 200, 255, 0.55)",
  flowAttack: "rgba(255, 90, 90, 0.9)",
  range: "rgba(255, 255, 160, 0.12)",
  rangeEdge: "rgba(255, 255, 160, 0.6)",
  shot: "#fff6c0",
  chest: "#ffcc33",
  splash: "rgba(255, 150, 40, 0.45)",
  spikesUp: "#c8c8c8",
  spikesUpGlyph: "#ffffff",
  trapTarget: "rgba(255, 200, 200, 0.35)",
};

export const GLYPHS: Record<StructureKind, string> = {
  wall: "#",
  archer: "A",
  cannon: "C",
  catapult: "P",
  floorSpikes: "^",
  wallSpikes: "▲",
  house: "h",
  bridge: "=",
  ruin: "#",
};

const FACING_GLYPHS: Record<Facing, string> = { N: "▲", E: "▶", S: "▼", W: "◀" };

export function glyphFor(kind: StructureKind, facing?: Facing): string {
  return facing ? FACING_GLYPHS[facing] : GLYPHS[kind];
}

export const STRUCTURE_COLOURS: Record<StructureKind, { bg: string; fg: string }> = {
  wall: { bg: "#8a7a5c", fg: "#3b3226" },
  archer: { bg: "#3d6b3a", fg: "#d8f5c8" },
  cannon: { bg: "#3a3f4a", fg: "#e8e8e8" },
  catapult: { bg: "#6b4a2a", fg: "#ffe0b0" },
  floorSpikes: { bg: "#3a3122", fg: "#a89878" },
  wallSpikes: { bg: "#8a7a5c", fg: "#e8e8e8" },
  house: { bg: "#7a3b2e", fg: "#ffd28a" },
  bridge: { bg: "#6b4f2a", fg: "#d9b77a" },
  ruin: { bg: "#55524c", fg: "#2e2c28" },
};

/** Ground keeps its checkerboard; every other terrain has a fixed look. */
export const TERRAIN_STYLES: Record<
  Exclude<Terrain, "ground">,
  { bg: string; glyph?: string; fg?: string }
> = {
  ford: { bg: "#5c4f33" },
  river: { bg: "#2d5f8a", glyph: "~", fg: "#8fc3ea" },
  sea: { bg: "#1a3550", glyph: "≈", fg: "#4f7fae" },
  rock: { bg: "#4a4a4a", glyph: "o", fg: "#9a9a9a" },
  tree: { bg: "#1f3d1f", glyph: "♣", fg: "#5fae5f" },
};
