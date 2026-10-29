// Tile textures: a few faint pixel specks laid over a terrain tile's flat colour, so the ground
// reads as dirt and water as rippling. Each style has a few variants, picked per tile from its
// position, so neighbouring tiles don't repeat. Worked out once (deterministically) and drawn as
// cached images.
import { TILE_SIZE } from "./palette";

/**
 * Speckle: grainy dirt, stone or leaves. Pebbles: speckle with a few small stones. Ore: speckle
 * with flecks of gold glinting in it. Ripple: water. Stone: cut stone blocks laid in offset
 * rows, like the keep's walls. Cracked stone: the same blocks, chipped and cracked (a wall
 * that's been badly hit). Ruined stone: the same blocks, crumbling: some knocked out, mortar
 * worn away, and cracks. Planks: upright wooden boards held by two iron bands (gates). Mist:
 * drifting wisps over the fog of war's top.
 */
export type TextureStyle =
  | "speckle"
  | "pebbles"
  | "ore"
  | "ripple"
  | "stone"
  | "crackedStone"
  | "ruinedStone"
  | "planks"
  | "mist";

/** One speck, in pixels within the tile. */
export interface Speck {
  x: number;
  y: number;
  w: number;
  h: number;
  colour: string;
}

/** Variants per style. */
export const TEXTURE_VARIANTS = 4;
/** Specks are laid on a grid of this many pixels, for a chunky pixel-art look. */
const GRAIN_PX = 2;
const GRAINS = TILE_SIZE / GRAIN_PX;
const LIGHT = "rgba(255, 255, 255, 0.07)";
const DARK = "rgba(0, 0, 0, 0.14)";
const PEBBLE = "rgba(255, 240, 210, 0.12)";
const RIPPLE = "rgba(255, 255, 255, 0.12)";
/** Mist: a cool grey wisp, with a white crest that shows on the fog's off-white checker. */
const WISP = "rgba(120, 135, 160, 0.14)";
const WISP_CREST = "rgba(255, 255, 255, 0.6)";
const MORTAR = "rgba(0, 0, 0, 0.3)";
/** Where a ruined block has fallen out. */
const HOLE = "rgba(0, 0, 0, 0.38)";
/** Ore's gold flecks: bright, so they glint, unlike the faint grain. */
const GOLD = "rgba(255, 204, 51, 0.85)";
const GOLD_GLINT = "rgba(255, 245, 190, 0.9)";
/** Stone blocks: rows this tall, blocks this wide, each row offset by half a block. */
const STONE_ROW_PX = 5;
const STONE_BLOCK_PX = 10;

/** The specks of one variant of a style. The same arguments always give the same specks. */
export function textureSpecks(style: TextureStyle, variant: number): Speck[] {
  const random = seeded(hashString(style) + variant * 7919);
  const specks: Speck[] = [];
  const grain = (gx: number, gy: number, w: number, colour: string) => {
    specks.push({ x: gx * GRAIN_PX, y: gy * GRAIN_PX, w: w * GRAIN_PX, h: GRAIN_PX, colour });
  };
  if (style === "stone") return stoneSpecks(random);
  if (style === "crackedStone") return crackedStoneSpecks(random);
  if (style === "ruinedStone") return ruinedStoneSpecks(random);
  if (style === "planks") return plankSpecks(random);
  if (style === "mist") return mistSpecks(random);
  if (style === "ripple") {
    // Short light dashes, a few per tile, spread down it.
    for (let row = 1; row < GRAINS; row += 3) {
      if (random() < 0.35) continue;
      const length = 2 + Math.floor(random() * 2);
      grain(Math.floor(random() * (GRAINS - length)), row, length, RIPPLE);
    }
    return specks;
  }
  for (let gy = 0; gy < GRAINS; gy++) {
    for (let gx = 0; gx < GRAINS; gx++) {
      const r = random();
      if (r < 0.1) grain(gx, gy, 1, LIGHT);
      else if (r < 0.22) grain(gx, gy, 1, DARK);
    }
  }
  if (style === "ore") {
    // Three to five flecks of gold, a pixel or two each, some with a pale glint.
    const count = 3 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      const x = 2 + Math.floor(random() * (TILE_SIZE - 5));
      const y = 2 + Math.floor(random() * (TILE_SIZE - 5));
      const w = random() < 0.5 ? 2 : 1;
      specks.push({ x, y, w, h: 1, colour: GOLD });
      if (random() < 0.4) specks.push({ x, y: y + 1, w: 1, h: 1, colour: GOLD_GLINT });
    }
  }
  if (style === "pebbles") {
    // One or two small stones, each a light grain with a shadow under it.
    const count = 1 + Math.floor(random() * 2);
    for (let i = 0; i < count; i++) {
      const gx = Math.floor(random() * (GRAINS - 1));
      const gy = Math.floor(random() * (GRAINS - 2));
      grain(gx, gy, 2, PEBBLE);
      grain(gx, gy + 1, 2, DARK);
    }
  }
  return specks;
}

/**
 * Mortar lines between blocks, a light top edge on each block, and a little grain in the
 * stone. The blocks fit a tile exactly, so they line up across neighbouring tiles; only the
 * grain differs between variants.
 */
function stoneSpecks(random: () => number): Speck[] {
  const specks: Speck[] = [];
  for (let row = 0; row * STONE_ROW_PX < TILE_SIZE; row++) {
    const top = row * STONE_ROW_PX;
    specks.push({ x: 0, y: top, w: TILE_SIZE, h: 1, colour: MORTAR });
    specks.push({ x: 0, y: top + 1, w: TILE_SIZE, h: 1, colour: LIGHT });
    const offset = row % 2 === 0 ? 0 : STONE_BLOCK_PX / 2;
    for (let x = offset; x < TILE_SIZE; x += STONE_BLOCK_PX) {
      specks.push({ x, y: top, w: 1, h: STONE_ROW_PX, colour: MORTAR });
    }
  }
  // A few dark and light grains inside the blocks (clear of the mortar rows).
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(random() * (TILE_SIZE - 2));
    const row = Math.floor(random() * (TILE_SIZE / STONE_ROW_PX));
    const y = row * STONE_ROW_PX + 2 + Math.floor(random() * (STONE_ROW_PX - 2));
    specks.push({ x, y, w: 1, h: 1, colour: random() < 0.5 ? DARK : LIGHT });
  }
  return specks;
}

/**
 * Stone blocks on the same layout as stoneSpecks, crumbling: about one in five has fallen out
 * (a dark hole), stretches of mortar have worn away, and a crack or two runs down the face.
 * How it's broken differs between variants.
 */
function ruinedStoneSpecks(random: () => number): Speck[] {
  const specks: Speck[] = [];
  for (let row = 0; row * STONE_ROW_PX < TILE_SIZE; row++) {
    const top = row * STONE_ROW_PX;
    const offset = row % 2 === 0 ? 0 : STONE_BLOCK_PX / 2;
    // The row's blocks, cut at its joints (the ends may be part blocks).
    const cuts = [0];
    for (let x = offset; x < TILE_SIZE; x += STONE_BLOCK_PX) if (x > 0) cuts.push(x);
    cuts.push(TILE_SIZE);
    for (let i = 0; i < cuts.length - 1; i++) {
      const left = cuts[i];
      const width = cuts[i + 1] - left;
      if (random() < 0.2) {
        specks.push({ x: left, y: top, w: width, h: STONE_ROW_PX, colour: HOLE });
        continue;
      }
      if (random() < 0.75) specks.push({ x: left, y: top, w: width, h: 1, colour: MORTAR });
      specks.push({ x: left, y: top + 1, w: width, h: 1, colour: LIGHT });
      if (left > 0 && random() < 0.7) {
        specks.push({ x: left, y: top, w: 1, h: STONE_ROW_PX, colour: MORTAR });
      }
    }
  }
  addCracks(specks, random, 1 + Math.floor(random() * 2), 4);
  return specks;
}

/**
 * Whole stone blocks (stoneSpecks), badly hit: two or three long cracks run down the face and
 * a few block corners are chipped out. Nothing has fallen out yet, unlike ruined stone.
 */
function crackedStoneSpecks(random: () => number): Speck[] {
  const specks = stoneSpecks(random);
  for (let i = 0; i < 3; i++) {
    const row = Math.floor(random() * (TILE_SIZE / STONE_ROW_PX));
    const x = Math.floor(random() * (TILE_SIZE - 2));
    specks.push({ x, y: row * STONE_ROW_PX + 1, w: 2, h: 2, colour: HOLE });
  }
  addCracks(specks, random, 2 + Math.floor(random() * 2), 6);
  return specks;
}

/** Cracks: `count` of them, each at least `length` pixels stepping down and sideways. */
function addCracks(specks: Speck[], random: () => number, count: number, length: number) {
  for (let c = 0; c < count; c++) {
    let x = 3 + Math.floor(random() * (TILE_SIZE - 6));
    let y = 2 + Math.floor(random() * (TILE_SIZE / 2));
    const step = random() < 0.5 ? -1 : 1;
    for (let i = 0; i < length + Math.floor(random() * 3) && y < TILE_SIZE; i++) {
      specks.push({ x, y, w: 1, h: 1, colour: MORTAR });
      y++;
      if (random() < 0.6) x = Math.min(TILE_SIZE - 1, Math.max(0, x + step));
    }
  }
}

/** Planks: boards this wide, so they line up across tiles; bands this far from top and bottom. */
const PLANK_PX = 5;
const BAND_INSET_PX = 4;

/** Upright boards with dark seams, two iron bands across, and a little grain in the wood. */
function plankSpecks(random: () => number): Speck[] {
  const specks: Speck[] = [];
  for (let x = PLANK_PX - 1; x < TILE_SIZE; x += PLANK_PX) {
    specks.push({ x, y: 0, w: 1, h: TILE_SIZE, colour: MORTAR });
  }
  for (const y of [BAND_INSET_PX, TILE_SIZE - BAND_INSET_PX - 2]) {
    specks.push({ x: 0, y, w: TILE_SIZE, h: 2, colour: MORTAR });
    specks.push({ x: 0, y: y + 2, w: TILE_SIZE, h: 1, colour: LIGHT });
  }
  // Grain: short streaks running down the boards.
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(random() * TILE_SIZE);
    if (x % PLANK_PX === PLANK_PX - 1) continue; // not on a seam
    specks.push({ x, y: Math.floor(random() * (TILE_SIZE - 3)), w: 1, h: 3, colour: DARK });
  }
  return specks;
}

/**
 * Long, soft streaks drifting across the tile, a few rows apart, each with a shorter white
 * crest above it. Faint, so the fog still reads as one flat sheet from a distance.
 */
function mistSpecks(random: () => number): Speck[] {
  const specks: Speck[] = [];
  for (let row = 1 + Math.floor(random() * 2); row < GRAINS; row += 3) {
    if (random() < 0.3) continue;
    const length = 3 + Math.floor(random() * 4);
    const gx = Math.floor(random() * (GRAINS - length + 1));
    specks.push({ x: gx * GRAIN_PX, y: row * GRAIN_PX, w: length * GRAIN_PX, h: GRAIN_PX, colour: WISP });
    const crest = Math.max(1, length - 2);
    specks.push({
      x: (gx + 1) * GRAIN_PX,
      y: row * GRAIN_PX - 1,
      w: Math.min(crest, GRAINS - gx - 1) * GRAIN_PX,
      h: 1,
      colour: WISP_CREST,
    });
  }
  return specks;
}

/** Which variant a tile at (x, y) uses: scattered, but the same every frame. */
export function textureVariant(x: number, y: number): number {
  const h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  return ((h >>> 0) % 997) % TEXTURE_VARIANTS;
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small seeded random number generator (mulberry32), 0 to 1. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
