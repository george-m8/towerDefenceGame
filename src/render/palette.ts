import type { StructureKind } from "../sim/types";

export const TILE_SIZE = 20;
export const GLYPH_FONT = `bold ${TILE_SIZE - 4}px Menlo, Consolas, monospace`;

export const COLOURS = {
  ground: "#2b2418",
  groundAlt: "#2f2819",
  spawn: "#4a1c1c",
  spawnGlyph: "#8a3a3a",
  keep: "#6b6b6b",
  keepGlyph: "#ffffff",
  ghostOk: "rgba(255, 255, 255, 0.35)",
  ghostBad: "rgba(255, 60, 60, 0.45)",
  enemy: "#ff5f4a",
  hpBack: "#000000",
  hpFront: "#5fdc5f",
  flowArrow: "rgba(120, 200, 255, 0.55)",
  flowAttack: "rgba(255, 90, 90, 0.9)",
  range: "rgba(255, 255, 160, 0.12)",
  rangeEdge: "rgba(255, 255, 160, 0.6)",
  shot: "#fff6c0",
  splash: "rgba(255, 150, 40, 0.45)",
  spikesUp: "#c8c8c8",
  spikesUpGlyph: "#ffffff",
};

export const GLYPHS: Record<StructureKind, string> = {
  wall: "#",
  archer: "A",
  cannon: "C",
  catapult: "P",
  floorSpikes: "^",
};

export const STRUCTURE_COLOURS: Record<StructureKind, { bg: string; fg: string }> = {
  wall: { bg: "#8a7a5c", fg: "#3b3226" },
  archer: { bg: "#3d6b3a", fg: "#d8f5c8" },
  cannon: { bg: "#3a3f4a", fg: "#e8e8e8" },
  catapult: { bg: "#6b4a2a", fg: "#ffe0b0" },
  floorSpikes: { bg: "#3a3122", fg: "#a89878" },
};
