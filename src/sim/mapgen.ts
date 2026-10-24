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
    if (isValid(layout, terrain)) return { terrain, attempts: attempt + 1, fallback: false };
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
  const vertical = carveRiver(layout, rng, config, set);
  carveCoast(layout, rng, config, set);
  clearZones(layout, config, set);
  placeFords(layout, rng, config, terrain, vertical);
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

/** Open ground around the keep and in front of the spawn, whatever was carved there. */
function clearZones(layout: MapLayout, config: MapGenConfig, set: Setter) {
  const { keep } = layout;
  const r = config.keepClearRadius;
  for (let y = keep.y - r; y < keep.y + keep.size + r; y++) {
    for (let x = keep.x - r; x < keep.x + keep.size + r; x++) set(x, y, "ground");
  }
  for (const p of layout.spawnTiles) {
    for (let dx = 0; dx <= config.spawnClearColumns; dx++) set(p.x + dx, p.y, "ground");
  }
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
  const lines = Array.from({ length: lineCount }, (_, l) => l).filter((l) => tilesOn(l).length > 0);
  const fords = Math.min(lines.length, randomInt(rng, ...config.riverFords));
  for (let n = 0; n < fords; n++) {
    const pick = randomInt(rng, n, lines.length - 1);
    [lines[n], lines[pick]] = [lines[pick], lines[n]];
    for (const i of tilesOn(lines[n])) terrain[i] = "ford";
  }
}

/** Playable: there is a river, and every walkable tile (spawn included) can reach the keep. */
function isValid(layout: MapLayout, terrain: Terrain[]): boolean {
  if (!terrain.includes("river")) return false;
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
