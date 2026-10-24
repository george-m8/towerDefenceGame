import { STRUCTURES, type StructureStats } from "../sim/config";
import type { Facing, StructureKind, Terrain } from "../sim/types";

export const TILE_SIZE = 20;
/** Facing notch on a tower tile edge, and the hovered turning tower's aim line. */
export const NOTCH_LENGTH_PX = 8;
export const NOTCH_DEPTH_PX = 3;
export const AIM_LINE_TILES = 2;

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
  ghostPending: "rgba(255, 255, 255, 0.2)",
  ghostPendingGlyph: "rgba(255, 255, 255, 0.6)",
  enemy: "#ff5f4a",
  hpBack: "#000000",
  hpFront: "#5fdc5f",
  flowArrow: "rgba(120, 200, 255, 0.55)",
  flowAttack: "rgba(255, 90, 90, 0.9)",
  range: "rgba(255, 255, 160, 0.12)",
  rangeEdge: "rgba(255, 255, 160, 0.6)",
  shot: "#fff6c0",
  chest: "#ffcc33",
  facingNotch: "#ffffff",
  aimLine: "#ff6b6b",
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
  wallSpikes: "↑",
  house: "h",
  bridge: "=",
  ruin: "#",
};

/** Plain-text arrows (U+2190-2193). Shapes like ▶ and ◀ turn into emoji on some systems. */
const FACING_ARROWS: Record<Facing, string> = { N: "↑", E: "→", S: "↓", W: "←" };

export function facingArrow(facing: Facing): string {
  return FACING_ARROWS[facing];
}

/**
 * The text symbol for a structure: directional traps get the arrow for their facing; towers
 * keep their letter (their facing is shown separately). On the map, directional traps are
 * drawn as a vector arrow instead (see drawArrow in canvas.ts).
 */
export function glyphFor(kind: StructureKind, facing?: Facing): string {
  const stats: StructureStats = STRUCTURES[kind];
  return facing && stats.directional ? FACING_ARROWS[facing] : GLYPHS[kind];
}

/** The drawn arrow on a directional trap, in pixels: an arrowhead on a short shaft. */
export const ARROW = {
  headHalfWidth: 6,
  headLength: 7,
  shaftHalfWidth: 1.5,
  /** Distance from the tile centre to the tip; the tail sits the same distance behind. */
  reach: 7,
};

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

export const OWNER_MARK_PX = 6;

/** One colour per player (ids 1-4; later ids wrap round), for owner marks and the players list. */
export const PLAYER_COLOURS = ["#f2c14e", "#4ea8de", "#f25c54", "#6fd08c"];

export function playerColour(id: number): string {
  return PLAYER_COLOURS[(id - 1) % PLAYER_COLOURS.length];
}
