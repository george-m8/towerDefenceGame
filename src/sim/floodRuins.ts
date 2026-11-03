// No looking back's ruins: the old walls that shape its land (see FLOOD.ruins). Each piece of
// land gets a mix of them, placed with their own RNG over whatever the map generator made:
//
// - Forts: small closed rings of ruins. Lava can't get in (ruins hold it); sell a ruin to.
// - Halls: big rings with gaps in. Lava (and swarms) come in through the gaps, unless you wall
//   them up.
// - Compounds: two forts side by side, sharing a wall, with a doorway between them.
// - Lines: long stretches of ruined wall, some with a bend: dams, half-built.
//
// Inside, most have a chest, some have resources (gold-veined rock, trees, berries), and some a
// swarm (placed when its land comes in; see flood.ts).
import { FLOOD, KEEP_SIZE } from "./config";
import type { MapGenResult } from "./mapgen";
import { nextRandom, randomInt } from "./rng";
import type { Point, Terrain } from "./types";

type Rng = { rngState: number };
type Land = Pick<MapGenResult, "terrain" | "ruins" | "chests">;

/** A rectangle of tiles: its top-left, and its size. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What one ruin adds: its walls, the ground it clears, and the insides it closes round. */
interface Ruin {
  /** Its whole footprint, for keeping ruins apart. */
  area: Rect;
  walls: Point[];
  /** Ground it clears (the footprint, for enclosures; under the wall, for lines). */
  cleared: Point[];
  /** The open insides (one per room), for chests, resources and swarms. */
  rooms: Rect[];
  /** Weathered (halls, lines) or whole (forts, compounds). */
  hp: number;
}

/**
 * Land with ruins added (at most `count`, fewer where they'd overlap each other, a goal's keep or
 * anywhere in `clear`), and the middles of the swarms that go in them.
 */
export function withRuins(
  land: Land,
  n: number,
  height: number,
  {
    seed,
    keep,
    count,
    clear = [],
  }: {
    seed: number;
    keep: Point | null;
    count: number;
    clear?: { x: number; y: number; radius: number }[];
  },
): Land & { ruinSwarms: Point[] } {
  const rng = { rngState: seed ^ 0x2f6b8c1d };
  const terrain = [...land.terrain];
  let ruins = land.ruins;
  let chests = land.chests;
  const ruinSwarms: Point[] = [];
  const placed: Rect[] = keep ? [{ ...keep, w: KEEP_SIZE, h: KEEP_SIZE }] : [];
  for (let k = 0; k < count; k++) {
    const ruin = shapeOf(rng, n, height);
    if (!ruin) continue;
    const { area } = ruin;
    const apart = (r: Rect) =>
      area.x >= r.x + r.w + 2 ||
      r.x >= area.x + area.w + 2 ||
      area.y >= r.y + r.h + 2 ||
      r.y >= area.y + area.h + 2;
    if (!placed.every(apart)) continue;
    const middle = { x: area.x + area.w / 2, y: area.y + area.h / 2 };
    const reach = Math.max(area.w, area.h) / 2;
    if (clear.some((c) => Math.hypot(c.x - middle.x, c.y - middle.y) < c.radius + reach)) continue;
    placed.push(area);
    // What was there goes: its ruins, chests and terrain under the footprint.
    const inArea = (p: Point) =>
      p.x >= area.x && p.x < area.x + area.w && p.y >= area.y && p.y < area.y + area.h;
    ruins = ruins.filter((r) => !inArea(r));
    chests = chests.filter((c) => !inArea(c));
    for (const p of ruin.cleared) terrain[p.y * n + p.x] = "ground";
    ruins = [...ruins, ...ruin.walls.map((p) => ({ ...p, hpFraction: ruin.hp }))];
    for (const room of ruin.rooms) {
      const inside = furnish(rng, terrain, n, room);
      if (inside.chest) chests = [...chests, inside.chest];
      if (inside.swarm) ruinSwarms.push(inside.swarm);
    }
  }
  return { ...land, terrain, ruins, chests, ruinSwarms };
}

/** A ruin of a kind picked by FLOOD.ruins' weights, somewhere on the land (null if it won't fit). */
function shapeOf(rng: Rng, n: number, height: number): Ruin | null {
  const { kinds } = FLOOD.ruins;
  const total = kinds.fort + kinds.hall + kinds.compound + kinds.line;
  let roll = nextRandom(rng) * total;
  if ((roll -= kinds.fort) < 0) return fort(rng, n, height);
  if ((roll -= kinds.hall) < 0) return hall(rng, n, height);
  if ((roll -= kinds.compound) < 0) return compound(rng, n, height);
  return line(rng, n, height);
}

/** Somewhere for a w-by-h rectangle, a tile in from the land's sides (two from top and bottom). */
function rectOn(rng: Rng, n: number, height: number, w: number, h: number): Rect | null {
  if (w > n - 2 || h > height - 4) return null;
  return { x: randomInt(rng, 1, n - w - 1), y: randomInt(rng, 2, height - h - 2), w, h };
}

/** The tiles round a rectangle's edge (corners once). */
function ring({ x, y, w, h }: Rect): Point[] {
  const tiles: Point[] = [];
  for (let dx = 0; dx < w; dx++) tiles.push({ x: x + dx, y }, { x: x + dx, y: y + h - 1 });
  for (let dy = 1; dy < h - 1; dy++) tiles.push({ x, y: y + dy }, { x: x + w - 1, y: y + dy });
  return tiles;
}

/** Every tile of a rectangle. */
function tilesOf({ x, y, w, h }: Rect): Point[] {
  const tiles: Point[] = [];
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) tiles.push({ x: x + dx, y: y + dy });
  return tiles;
}

/** Inside a rectangle's ring. */
function inside({ x, y, w, h }: Rect): Rect {
  return { x: x + 1, y: y + 1, w: w - 2, h: h - 2 };
}

const same = (a: Point) => (b: Point) => a.x === b.x && a.y === b.y;

function fort(rng: Rng, n: number, height: number): Ruin | null {
  const { min, max } = FLOOD.ruins.fortSize;
  const side = randomInt(rng, min, max);
  const area = rectOn(rng, n, height, side, side);
  if (!area) return null;
  return { area, walls: ring(area), cleared: tilesOf(area), rooms: [inside(area)], hp: 1 };
}

/** A big ring with gaps in its sides (each FLOOD.ruins.gapWidth wide, never at a corner). */
function hall(rng: Rng, n: number, height: number): Ruin | null {
  const { hallWidth, hallHeight, gaps, gapWidth } = FLOOD.ruins;
  const w = randomInt(rng, hallWidth.min, hallWidth.max);
  const h = randomInt(rng, hallHeight.min, hallHeight.max);
  const area = rectOn(rng, n, height, w, h);
  if (!area) return null;
  const open: Point[] = [];
  for (let g = randomInt(rng, gaps.min, gaps.max); g > 0; g--) {
    const side = randomInt(rng, 0, 3);
    const along = side % 2 === 0 ? w : h;
    const at = randomInt(rng, 2, along - gapWidth - 2);
    for (let d = 0; d < gapWidth; d++) {
      if (side === 0) open.push({ x: area.x + at + d, y: area.y });
      else if (side === 2) open.push({ x: area.x + at + d, y: area.y + h - 1 });
      else if (side === 1) open.push({ x: area.x + w - 1, y: area.y + at + d });
      else open.push({ x: area.x, y: area.y + at + d });
    }
  }
  const walls = ring(area).filter((p) => !open.some(same(p)));
  return { area, walls, cleared: tilesOf(area), rooms: [inside(area)], hp: FLOOD.ruins.weathered };
}

/** Two forts side by side (across or down), sharing a wall with a doorway in it. */
function compound(rng: Rng, n: number, height: number): Ruin | null {
  const { min, max } = FLOOD.ruins.fortSize;
  const a = randomInt(rng, min, max);
  const b = randomInt(rng, min, max);
  const across = nextRandom(rng) < 0.5;
  const area = across
    ? rectOn(rng, n, height, a + b - 1, Math.max(a, b))
    : rectOn(rng, n, height, Math.max(a, b), a + b - 1);
  if (!area) return null;
  const first: Rect = { x: area.x, y: area.y, w: a, h: a };
  const second: Rect = across
    ? { x: area.x + a - 1, y: area.y, w: b, h: b }
    : { x: area.x, y: area.y + a - 1, w: b, h: b };
  // A doorway in the shared wall, on both rooms' sides of it.
  const shared = Math.min(a, b);
  const at = randomInt(rng, 1, shared - 2);
  const door = across
    ? { x: area.x + a - 1, y: area.y + at }
    : { x: area.x + at, y: area.y + a - 1 };
  const walls: Point[] = [];
  for (const p of [...ring(first), ...ring(second)]) {
    if (!walls.some(same(p)) && !same(door)(p)) walls.push(p);
  }
  return {
    area,
    walls,
    cleared: [...tilesOf(first), ...tilesOf(second)],
    rooms: [inside(first), inside(second)],
    hp: 1,
  };
}

/** A long stretch of wall, across or down, sometimes with a bend. */
function line(rng: Rng, n: number, height: number): Ruin | null {
  const { lineLength, bendLength, bendChance } = FLOOD.ruins;
  const length = randomInt(rng, lineLength.min, lineLength.max);
  const across = nextRandom(rng) < 0.5;
  const bend = nextRandom(rng) < bendChance ? randomInt(rng, bendLength.min, bendLength.max) : 0;
  const w = across ? length : bend + 1;
  const h = across ? bend + 1 : length;
  const area = rectOn(rng, n, height, Math.max(w, 1), Math.max(h, 1));
  if (!area) return null;
  const walls: Point[] = [];
  for (let d = 0; d < length; d++) {
    walls.push(across ? { x: area.x + d, y: area.y } : { x: area.x, y: area.y + d });
  }
  // The bend, down (or across) from the far end.
  for (let d = 1; d <= bend; d++) {
    walls.push(
      across
        ? { x: area.x + length - 1, y: area.y + d }
        : { x: area.x + d, y: area.y + length - 1 },
    );
  }
  return { area, walls, cleared: walls, rooms: [], hp: FLOOD.ruins.weathered };
}

/**
 * What goes in a room: maybe a chest in the middle, maybe a patch of resources, maybe a swarm.
 * Resources go in the room's corners, never in its middle or the middle row and column, so the
 * room stays crossable and the swarm has room.
 */
function furnish(
  rng: Rng,
  terrain: Terrain[],
  n: number,
  room: Rect,
): { chest: { x: number; y: number; gold: number } | null; swarm: Point | null } {
  const { chestChance, chestGold, resourceChance, resources, swarmChance } = FLOOD.ruins;
  const middle = { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
  const chest =
    nextRandom(rng) < chestChance
      ? { ...middle, gold: randomInt(rng, chestGold.min, chestGold.max) }
      : null;
  if (nextRandom(rng) < resourceChance) {
    const kind = resources[randomInt(rng, 0, resources.length - 1)];
    const corner = { x: room.x, y: room.y };
    // A 2x2 to 3x2 patch tucked in one corner.
    const flip = { x: randomInt(rng, 0, 1), y: randomInt(rng, 0, 1) };
    const pw = Math.min(3, Math.floor((room.w - 1) / 2));
    const ph = Math.min(2, Math.floor((room.h - 1) / 2));
    for (let dy = 0; dy < ph; dy++) {
      for (let dx = 0; dx < pw; dx++) {
        const x = flip.x ? room.x + room.w - 1 - dx : corner.x + dx;
        const y = flip.y ? room.y + room.h - 1 - dy : corner.y + dy;
        if (x === middle.x || y === middle.y) continue;
        terrain[y * n + x] = kind;
      }
    }
  }
  const swarm = room.w >= 5 && room.h >= 5 && nextRandom(rng) < swarmChance ? middle : null;
  return { chest, swarm };
}
