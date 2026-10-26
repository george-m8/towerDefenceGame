import type { EnemyKindId, EnemyVariant, ProjectileKind } from "../sim/config";
import type { Facing, StructureKind, Terrain } from "../sim/types";
import type { TextureStyle } from "./textures";

export const TILE_SIZE = 20;
/** Facing notch on a tower tile edge, and the hovered turning tower's aim line. */
export const AIM_LINE_TILES = 2;
/**
 * How each tower's shot looks in flight: its symbol, and how high its arc rises as a fraction
 * of how far it flies (the curve's peak is half this). Arrows fly flattest and turn to follow
 * the curve; catapult stones are lobbed high.
 */
export const PROJECTILES: Record<ProjectileKind, { glyph: string; arc: number; turns: boolean }> = {
  arrow: { glyph: "→", arc: 0.08, turns: true },
  ball: { glyph: "•", arc: 0.2, turns: false },
  stone: { glyph: "*", arc: 0.6, turns: false },
};
/** Straight pieces a shot's arc is drawn with. */
export const ARC_SEGMENTS = 16;

/**
 * The sun, for blocks' shadows (see sun.ts). No shadow is longer than `maxLength` times its
 * block's height: `tallestBlock` (the keep's corners, in pixels) times it must stay under a tile,
 * so a shadow only reaches the tiles next to its block. `across` and `arc` are where the sun is
 * when nobody sets it (high on the left, so shadows fall right); `arcMin` is the Arc slider's
 * lowest setting.
 */
export const SUN = { maxLength: 1.25, tallestBlock: 15, across: 0.33, arc: 80, arcMin: 5 };

/** Height of the strip drawn along the top of a wall-mounted tower. */
export const BATTLEMENT_PX = 3;
/** How solid a structure still being built is drawn. */
export const CONSTRUCTION_ALPHA = 0.45;
/** How thick the build-time border round the tile being placed on is. */
export const BUILD_BORDER_PX = 3;
/** From this much of the longest build time on, the build-time border turns orange. */
export const BUILD_BORDER_LONG = 0.75;
/**
 * The map's font: GNU Unifont (fonts/Unifont, declared in styles.css) at its native 16px. It has
 * every map glyph, letters and building symbols such as ⛫ ⌂ 𐤄 alike (see GLYPHS.md); the usual
 * symbol fonts are only a fallback.
 */
const GLYPH_FONTS = `Unifont, "Apple Symbols", "Segoe UI Symbol", "Segoe UI Historic", "Noto Sans Symbols 2", monospace`;
/** Unifont's letters are half width, so two-letter codes (like Ti) fit a tile at this size too. */
export const GLYPH_FONT = `${TILE_SIZE - 4}px ${GLYPH_FONTS}`;
/** Every keep tile but the middle one (which has its HP over it): a rook. */
export const KEEP_GLYPH = "♜";

/** Each enemy kind's glyph colour. Variants never change it; they change the glyph size. */
export const ENEMY_COLOURS: Record<EnemyKindId, string> = {
  goblin: "#ff5f4a",
  zerg: "#c77dff",
  wolfRider: "#d9a35f",
  barbarian: "#ff9f43",
  barbarianChief: "#ff9f43",
  dwarf: "#f2d16b",
  dwarfThane: "#f2d16b",
  golem: "#d0d0d0",
  marine: "#5fc8e8",
  marineCaptain: "#5fc8e8",
  shaman: "#7bd389",
  dwarfBomber: "#ff7a1a",
  dwarfDemolisher: "#ff7a1a",
  digger: "#b08968",
  batteringRam: "#a0522d",
};

/** Glyph size per variant size, relative to the normal glyph. Large still fits in a tile. */
export const ENEMY_GLYPH_SCALE: Record<EnemyVariant["size"], number> = {
  small: 0.75,
  normal: 1,
  large: 1.25,
};

export function enemyFont(size: EnemyVariant["size"]): string {
  return `${Math.round((TILE_SIZE - 4) * ENEMY_GLYPH_SCALE[size])}px ${GLYPH_FONTS}`;
}

export const COLOURS = {
  ground: "#2b2418",
  /** Beyond the map's edge, when the whole map fits with room to spare. */
  offMap: "#15110b",
  /** The view's outline on the minimap. */
  minimapView: "#ffffff",
  minimapViewDash: "#000000",
  /** Enclosed areas and their walls: warm for the keep's enclosure, cool for others. */
  enclosureKeep: "rgba(255, 196, 60, 0.22)",
  enclosureOuter: "rgba(120, 200, 255, 0.16)",
  /** PvP: the rival's enclosures, where you can't build. */
  enclosureRival: "rgba(255, 70, 70, 0.2)",
  enclosureRivalTint: "#ff4646",
  /** The same tints as solid colours, blended into the minimap. */
  enclosureKeepTint: "#ffc43c",
  enclosureOuterTint: "#78c8ff",
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
  /** The bar over a structure still being built, filling as it goes up. */
  buildFront: "#ffcd46",
  /** The empty part of the build-time border. */
  buildTrack: "rgba(0, 0, 0, 0.45)",
  /** The sliver left on a destroyed thing's emptied health bar. */
  hpEmpty: "#d22020",
  resourceLeft: "#e3c04d",
  flowArrow: "rgba(120, 200, 255, 0.55)",
  flowAttack: "rgba(255, 90, 90, 0.9)",
  range: "rgba(255, 255, 160, 0.12)",
  rangeEdge: "rgba(255, 255, 160, 0.6)",
  shot: "#fff6c0",
  /** The bright flecks in an enemy's burst when it dies. */
  burstSpark: "#ffffff",
  /** A shot's projectile in flight. */
  projectile: "#ffe08a",
  chest: "#ffcc33",
  /** A spawner's door: a border while placing, a faint S once built. */
  door: "#ffffff",
  /** Where a guard building being placed will station its guards. */
  guardSpot: "rgba(255, 255, 255, 0.45)",
  aimLine: "#ff6b6b",
  splash: "rgba(255, 150, 40, 0.45)",
  heal: "#5ee36a",
  spikesUp: "#c8c8c8",
  spikesUpGlyph: "#ffffff",
  trapTarget: "rgba(255, 200, 200, 0.35)",
  /** A watchtower's sight while placing or hovering it: in sight, then seen. */
  sightInner: "rgba(160, 220, 255, 0.14)",
  sightOuter: "rgba(160, 220, 255, 0.06)",
};

/**
 * Fog of war: a white mist, thin and low over land that's seen but out of sight, and solid and
 * high over unexplored land, except near explored land, where it steps down in bands. Like the
 * raised blocks, each tile's fog top is lifted by its `height` (pixels), with a darker front
 * face where it's higher than the fog (or clear land) in front of it. Opacities are 0 (clear)
 * to 1 (solid). Like the ground, the top is a checker of two colours.
 */
export const FOG = {
  colour: "#ffffff",
  colourAlt: "#ededed",
  face: "#c4c4c4",
  seen: { opacity: 0.3, height: 2 },
  /**
   * See-through bands on unexplored land, from the edge of explored land outwards: each is
   * `tiles` wide (counting diagonals). Past the last band the fog is `unexplored`.
   */
  edgeBands: [
    { tiles: 1, opacity: 0.5, height: 5 },
    { tiles: 1, opacity: 0.8, height: 9 },
  ],
  /** Higher than the tallest block (the keep's corners, 15), so nothing pokes through. */
  unexplored: { opacity: 1, height: 17 },
};

export const GLYPHS: Record<StructureKind, string> = {
  wall: "#",
  archer: "↑",
  cannon: "C",
  catapult: "P",
  floorSpikes: "^",
  wallSpikes: "↑",
  // A symbol where a clear one exists, else a two-letter code (see GLYPHS.md for why each).
  house: "⌂",
  timberYard: "Ti",
  mine: "Mi",
  foragerHut: "Fo",
  shop: "¤",
  guardhouse: "⛨",
  archeryPost: "➶",
  paladinHall: "✠",
  scoutCamp: "⚑",
  barracks: "Ba",
  archeryRange: "◎",
  farmhouse: "Fa",
  farmland: "𐤄",
  bridge: "=",
  watchtower: "\u23FF", // observer eye
  gate: "∩",
  ruin: "#",
};

/** Plain-text arrows (U+2190-2193). Shapes like ▶ and ◀ turn into emoji on some systems. */
const FACING_ARROWS: Record<Facing, string> = { N: "↑", E: "→", S: "↓", W: "←" };

export function facingArrow(facing: Facing): string {
  return FACING_ARROWS[facing];
}

export type ArrowStyle = "spike" | "fletched";

/**
 * Structures drawn as an arrow pointing where they face (or aim): wall spikes as a bold spike,
 * archers as a fletched arrow. Everything else keeps its letter.
 */
export const ARROW_SYMBOLS: Partial<Record<StructureKind, ArrowStyle>> = {
  wallSpikes: "spike",
  archer: "fletched",
};

/**
 * The text symbol for a structure: arrow-drawn structures get the text arrow for their facing;
 * the rest keep their letter. On the map, arrow-drawn structures are drawn as vector arrows
 * instead (see drawArrow in canvas.ts).
 */
export function glyphFor(kind: StructureKind, facing?: Facing): string {
  return facing && ARROW_SYMBOLS[kind] ? FACING_ARROWS[facing] : GLYPHS[kind];
}

/** Drawn arrows, in pixels, pointing north before rotation. `reach` is centre to tip (and tail). */
export const ARROWS: Record<ArrowStyle, ArrowShape> = {
  // Wall spikes: a broad head on a short shaft.
  spike: {
    headHalfWidth: 6,
    headLength: 7,
    shaftHalfWidth: 1.5,
    reach: 7,
    fletchWidth: 0,
    fletchLength: 0,
  },
  // Archers: a slim arrow with feathers at the tail.
  fletched: {
    headHalfWidth: 4,
    headLength: 5,
    shaftHalfWidth: 1,
    reach: 8,
    fletchWidth: 4,
    fletchLength: 4,
  },
};

export interface ArrowShape {
  headHalfWidth: number;
  headLength: number;
  shaftHalfWidth: number;
  reach: number;
  /** Feathers: how far out from the shaft, and how far along it (0 for none). */
  fletchWidth: number;
  fletchLength: number;
}

export const STRUCTURE_COLOURS: Record<StructureKind, { bg: string; fg: string }> = {
  wall: { bg: "#8a7a5c", fg: "#3b3226" },
  archer: { bg: "#3d6b3a", fg: "#d8f5c8" },
  cannon: { bg: "#3a3f4a", fg: "#e8e8e8" },
  catapult: { bg: "#6b4a2a", fg: "#ffe0b0" },
  floorSpikes: { bg: "#3a3122", fg: "#a89878" },
  wallSpikes: { bg: "#8a7a5c", fg: "#e8e8e8" },
  house: { bg: "#7a3b2e", fg: "#ffd28a" },
  timberYard: { bg: "#5a4325", fg: "#9fd88a" },
  mine: { bg: "#4b4b55", fg: "#f0d27a" },
  foragerHut: { bg: "#3f5a2e", fg: "#ff8a80" },
  shop: { bg: "#3e5a7a", fg: "#ffe08a" },
  guardhouse: { bg: "#5a3a3a", fg: "#ffd0c0" },
  archeryPost: { bg: "#3a5a3a", fg: "#d8f5c8" },
  paladinHall: { bg: "#4a4a6a", fg: "#e8e8ff" },
  scoutCamp: { bg: "#5a5a3a", fg: "#ffe8a0" },
  barracks: { bg: "#6a3a3a", fg: "#ffd0c0" },
  archeryRange: { bg: "#3a5a4a", fg: "#ffffff" },
  farmhouse: { bg: "#8a5a2b", fg: "#ffe08a" },
  farmland: { bg: "#6b5a2a", fg: "#c9b45a" },
  bridge: { bg: "#6b4f2a", fg: "#d9b77a" },
  watchtower: { bg: "#4a5a6b", fg: "#e0ecff" },
  gate: { bg: "#7a5a32", fg: "#2a1d10" },
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
  // Unifont's evergreen tree; the text selector (FE0E) keeps it from turning into an emoji.
  tree: { bg: "#1f3d1f", glyph: "\u{1F332}\uFE0E", fg: "#5fae5f" },
  goldRock: { bg: "#4a4a4a", glyph: "o", fg: "#e3c04d" },
  // Unifont's blueberries, kept as text like the tree.
  berries: { bg: "#2f5a2a", glyph: "\u{1FAD0}\uFE0E", fg: "#7a3b4f" },
};

/** The texture over each kind of terrain (see render/textures.ts). */
export const TERRAIN_TEXTURES: Record<Terrain, TextureStyle> = {
  ground: "pebbles",
  ford: "speckle",
  river: "ripple",
  sea: "ripple",
  // Gold flecks mark gold-veined rock only, so it stands out from plain rock.
  rock: "speckle",
  tree: "speckle",
  goldRock: "ore",
  berries: "speckle",
};
/** The keep's stone walls. */
export const KEEP_TEXTURE: TextureStyle = "stone";
/** Structures drawn textured; the rest are flat colour. */
export const STRUCTURE_TEXTURES: Partial<Record<StructureKind, TextureStyle>> = {
  wall: "stone",
  wallSpikes: "stone",
  ruin: "ruinedStone",
  gate: "planks",
};
/** Below this many screen pixels per tile, textures are too small to see and aren't drawn. */
export const TEXTURE_MIN_TILE_PX = 10;

export const OWNER_MARK_PX = 6;
/** How faint a built spawner's door S is. */
export const DOOR_ALPHA = 0.25;

/** One colour per player (ids 1-4; later ids wrap round), for owner marks and the players list. */
export const PLAYER_COLOURS = ["#f2c14e", "#4ea8de", "#f25c54", "#6fd08c"];

export function playerColour(id: number): string {
  return PLAYER_COLOURS[(id - 1) % PLAYER_COLOURS.length];
}
