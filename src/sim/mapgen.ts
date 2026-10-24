import { KEEP_SIZE, MAP_GEN, SPAWN_ZONE, TERRAIN } from "./config";
import { nextRandom, randomInt } from "./rng";
import type { Point, Terrain } from "./types";

type Rng = { rngState: number };
type MapGenConfig = typeof MAP_GEN;

/** Where the fixed landmarks sit on a map of a given size. */
export interface MapLayout {
  width: number;
  height: number;
  keep: { x: number; y: number; size: number };
  spawnTiles: Point[];
}

export interface MapGenResult {
  terrain: Terrain[];
  /** How many generations it took (1 = first try). */
  attempts: number;
  /** True if every attempt failed and the map is open ground. */
  fallback: boolean;
}

export function layoutFor(width: number, height: number): MapLayout {
  const keep = {
    x: Math.floor(width / 2) - Math.floor(KEEP_SIZE / 2),
    y: Math.floor(height / 2) - Math.floor(KEEP_SIZE / 2),
    size: KEEP_SIZE,
  };
  const spawnY = Math.floor(height / 2) - Math.floor(SPAWN_ZONE.height / 2);
  const spawnTiles: Point[] = [];
  for (let y = spawnY; y < spawnY + SPAWN_ZONE.height; y++) {
    for (let x = SPAWN_ZONE.x; x < SPAWN_ZONE.x + SPAWN_ZONE.width; x++) spawnTiles.push({ x, y });
  }
  return { width, height, keep, spawnTiles };
}

/**
 * Seeded terrain: a meandering river with fords, then a coast, then clear zones around the
 * keep and spawn. Maps that cut the spawn off from the keep are regenerated from a derived
 * seed, so the result is still deterministic.
 */
export function generateTerrain(
  layout: MapLayout,
  seed: number,
  config: MapGenConfig = MAP_GEN,
): MapGenResult {
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    const rng = { rngState: (seed + Math.imul(attempt, 0x9e3779b9)) | 0 };
    const terrain = buildTerrain(layout, rng, config);
    if (isValid(layout, terrain, config))
      return { terrain, attempts: attempt + 1, fallback: false };
  }
  return { terrain: blankTerrain(layout), attempts: config.maxAttempts, fallback: true };
}

function blankTerrain(layout: MapLayout): Terrain[] {
  return new Array<Terrain>(layout.width * layout.height).fill("ground");
}

function buildTerrain(layout: MapLayout, rng: Rng, config: MapGenConfig): Terrain[] {
  const terrain = blankTerrain(layout);
  const set = (x: number, y: number, t: Terrain) => {
    if (x >= 0 && y >= 0 && x < layout.width && y < layout.height)
      terrain[y * layout.width + x] = t;
  };
  const reserved = clearZoneMask(layout, config);
  const vertical = carveRiver(layout, rng, config, set);
  carveCoast(layout, rng, config, set);
  // Whatever the river or coast carved, the keep and spawn surroundings are open ground.
  reserved.forEach((r, i) => {
    if (r) terrain[i] = "ground";
  });
  const open = (i: number) => terrain[i] === "ground" && !reserved[i];
  scatterClumps(
    layout,
    rng,
    terrain,
    open,
    "rock",
    config.rockClustersPer1000,
    config.rockClusterSize,
  );
  scatterClumps(layout, rng, terrain, open, "tree", config.forestsPer1000, config.forestSize);
  placeFords(layout, rng, config, terrain, vertical);
  fillSealedPockets(layout, terrain, reserved);
  return terrain;
}

type Setter = (x: number, y: number, t: Terrain) => void;

/**
 * A 1-tile river crossing the whole map, kept out of the keep's and spawn's clear bands.
 * Returns whether it runs vertically (top to bottom) or horizontally.
 */
function carveRiver(layout: MapLayout, rng: Rng, config: MapGenConfig, set: Setter): boolean {
  const { width, height, keep } = layout;
  const r = config.keepClearRadius;
  const vertical = nextRandom(rng) < 0.5;
  // Bands across the river's direction that it must stay out of.
  const keepBand: [number, number] = vertical
    ? [keep.x - r, keep.x + keep.size - 1 + r]
    : [keep.y - r, keep.y + keep.size - 1 + r];
  const spawnBand: [number, number] = vertical
    ? [0, Math.max(...layout.spawnTiles.map((p) => p.x)) + config.spawnClearColumns]
    : [
        Math.min(...layout.spawnTiles.map((p) => p.y)),
        Math.max(...layout.spawnTiles.map((p) => p.y)),
      ];
  const span = vertical ? width : height;
  const segments = freeSegments(span, [keepBand, spawnBand]);
  if (segments.length === 0) return vertical;
  const [lo, hi] = segments[randomInt(rng, 0, segments.length - 1)];

  let across = randomInt(rng, lo, hi);
  const length = vertical ? height : width;
  for (let along = 0; along < length; along++) {
    const previous = across;
    if (nextRandom(rng) < config.riverMeander) {
      across = Math.min(hi, Math.max(lo, across + (nextRandom(rng) < 0.5 ? -1 : 1)));
    }
    // Fill the sideways step too, so the river stays one connected line.
    for (let a = Math.min(previous, across); a <= Math.max(previous, across); a++) {
      if (vertical) set(a, along, "river");
      else set(along, a, "river");
    }
  }
  return vertical;
}

/** Ranges of [0, span) not covered by any blocked band. */
function freeSegments(span: number, blocked: [number, number][]): [number, number][] {
  const segments: [number, number][] = [];
  let start = 0;
  for (const [a, b] of [...blocked].sort((p, q) => p[0] - q[0])) {
    if (a > start) segments.push([start, a - 1]);
    start = Math.max(start, b + 1);
  }
  if (start <= span - 1) segments.push([start, span - 1]);
  return segments;
}

/** A sea band of varying depth along the top, bottom or right edge (never the spawn's edge). */
function carveCoast(layout: MapLayout, rng: Rng, config: MapGenConfig, set: Setter) {
  const { width, height } = layout;
  const edge = (["top", "bottom", "right"] as const)[randomInt(rng, 0, 2)];
  const [minDepth, maxDepth] = config.coastDepth;
  const length = edge === "right" ? height : width;
  let depth = randomInt(rng, minDepth, maxDepth);
  for (let i = 0; i < length; i++) {
    depth = Math.min(maxDepth, Math.max(minDepth, depth + randomInt(rng, -1, 1)));
    for (let d = 0; d < depth; d++) {
      if (edge === "top") set(i, d, "sea");
      else if (edge === "bottom") set(i, height - 1 - d, "sea");
      else set(width - 1 - d, i, "sea");
    }
  }
}

/**
 * Irregular clumps of one terrain (rock clusters, forests) grown outwards from random seeds
 * over open ground. The clear-zone pass afterwards keeps them away from the keep and spawn.
 */
function scatterClumps(
  layout: MapLayout,
  rng: Rng,
  terrain: Terrain[],
  open: (i: number) => boolean,
  kind: Terrain,
  per1000: [number, number],
  size: [number, number],
) {
  const { width, height } = layout;
  const area = (width * height) / 1000;
  const clumps = randomInt(rng, Math.round(per1000[0] * area), Math.round(per1000[1] * area));
  for (let c = 0; c < clumps; c++) {
    let start = randomInt(rng, 0, terrain.length - 1);
    for (let tries = 0; !open(start) && tries < START_TRIES; tries++) {
      start = randomInt(rng, 0, terrain.length - 1);
    }
    if (!open(start)) continue;
    const clump = [start];
    terrain[start] = kind;
    const target = randomInt(rng, ...size);
    for (let tries = 0; clump.length < target && tries < target * 4; tries++) {
      const from = clump[randomInt(rng, 0, clump.length - 1)];
      const x = from % width;
      const [dx, dy] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][randomInt(rng, 0, 3)];
      const nx = x + dx;
      const ny = (from - x) / width + dy;
      const next = ny * width + nx;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !open(next)) continue;
      terrain[next] = kind;
      clump.push(next);
    }
  }
}

const START_TRIES = 20;

/** Tiles that must stay open ground: around the keep and in front of the spawn. */
function clearZoneMask(layout: MapLayout, config: MapGenConfig): boolean[] {
  const { width, height, keep } = layout;
  const mask = new Array<boolean>(width * height).fill(false);
  const reserve = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = true;
  };
  const r = config.keepClearRadius;
  for (let y = keep.y - r; y < keep.y + keep.size + r; y++) {
    for (let x = keep.x - r; x < keep.x + keep.size + r; x++) reserve(x, y);
  }
  for (const p of layout.spawnTiles) {
    for (let dx = 0; dx <= config.spawnClearColumns; dx++) reserve(p.x + dx, p.y);
  }
  return mask;
}

/**
 * Fords are whole cross-sections of the river (a row of a vertical river, a column of a
 * horizontal one), so each one is a real crossing even where the river steps sideways.
 */
function placeFords(
  layout: MapLayout,
  rng: Rng,
  config: MapGenConfig,
  terrain: Terrain[],
  vertical: boolean,
) {
  const { width, height } = layout;
  const lineCount = vertical ? height : width;
  const tilesOn = (line: number) =>
    Array.from({ length: vertical ? width : height }, (_, a) =>
      vertical ? line * width + a : a * width + line,
    ).filter((i) => terrain[i] === "river");
  // A crossing needs open ground on both banks, or it leads nowhere.
  const bankOpen = (i: number) => i >= 0 && i < terrain.length && TERRAIN[terrain[i]].walkable;
  const step = vertical ? 1 : width;
  const crossable = (l: number) => {
    const tiles = tilesOn(l);
    return (
      tiles.length > 0 && bankOpen(tiles[0] - step) && bankOpen(tiles[tiles.length - 1] + step)
    );
  };
  const lines = Array.from({ length: lineCount }, (_, l) => l).filter(crossable);
  const fords = Math.min(lines.length, randomInt(rng, ...config.riverFords));
  for (let n = 0; n < fords; n++) {
    const pick = randomInt(rng, n, lines.length - 1);
    [lines[n], lines[pick]] = [lines[pick], lines[n]];
    for (const i of tilesOn(lines[n])) terrain[i] = "ford";
  }
}

/**
 * Walkable pockets sealed off from the keep (inside a forest, between rocks and the coast)
 * take on the impassable terrain around them, so a hole in a forest becomes forest.
 * Clear-zone tiles are never filled: if those are sealed off, validation rejects the map.
 */
function fillSealedPockets(layout: MapLayout, terrain: Terrain[], reserved: boolean[]) {
  const { width } = layout;
  const reached = walkableFromKeep(layout, terrain);
  terrain.forEach((t, i) => {
    if (!TERRAIN[t].walkable || reached.has(i) || reserved[i]) return;
    const neighbours = [
      i - width,
      i + width,
      i % width > 0 ? i - 1 : -1,
      i % width < width - 1 ? i + 1 : -1,
    ];
    terrain[i] = neighbours.some((n) => terrain[n] === "tree") ? "tree" : "rock";
  });
}

/** Playable: a real river with its fords, and every walkable tile (spawn included) can reach the keep. */
function isValid(layout: MapLayout, terrain: Terrain[], config: MapGenConfig): boolean {
  // A real river (not one swallowed by the coast or clear zones) with its fords intact.
  const river = terrain.filter((t) => t === "river").length;
  if (river < Math.min(layout.width, layout.height) / 2) return false;
  if (config.riverFords[0] > 0 && !terrain.includes("ford")) return false;
  const reached = walkableFromKeep(layout, terrain);
  return terrain.every((t, i) => !TERRAIN[t].walkable || reached.has(i));
}

function walkableFromKeep(layout: MapLayout, terrain: Terrain[]): Set<number> {
  const { width, height, keep } = layout;
  const queue: number[] = [];
  for (let y = keep.y; y < keep.y + keep.size; y++) {
    for (let x = keep.x; x < keep.x + keep.size; x++) queue.push(y * width + x);
  }
  const reached = new Set(queue);
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    const neighbours = [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ];
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (reached.has(ni) || !TERRAIN[terrain[ni]].walkable) continue;
      reached.add(ni);
      queue.push(ni);
    }
  }
  return reached;
}
