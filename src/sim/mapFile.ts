// `.map` files: a hand-made map (SPEC-map-editor.md). They hold the map only, no settings; a
// level will combine one with a `.wave` and a `.loadout` file. Plain data, no DOM, so the game
// server can read them too.
import {
  KEEP_SIZE,
  MAP_EDITOR,
  MAP_SIZES,
  STRUCTURES,
  TERRAIN,
  type MapSize,
  type StructureStats,
} from "./config";
import type { Facing, GameMode, GameState, Point, StructureKind, Terrain } from "./types";

export const MAP_FORMAT = "keep-defence-map";
export const MAP_VERSION = 1;

export interface SpawnZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapRuin {
  x: number;
  y: number;
  /** Starting HP, as a fraction of full (0 to 1). */
  hp: number;
}

export interface MapChest {
  x: number;
  y: number;
  gold: number;
}

export interface MapStructure {
  kind: StructureKind;
  x: number;
  y: number;
  facing: Facing;
  /** The keep it belongs to (an index into `keeps`); its owner is that keep's player. */
  keep: number;
}

export interface MapFile {
  format: typeof MAP_FORMAT;
  version: number;
  title: string;
  mode: GameMode;
  size: MapSize;
  /** Fixes what's still random: how much each tree, rock and bush holds. */
  seed: number;
  /** One string per row, one character per tile (see TERRAIN_CHARS). */
  terrain: string[];
  /** Each keep's top-left; keeps are KEEP_SIZE square. */
  keeps: Point[];
  spawns: SpawnZone[];
  ruins: MapRuin[];
  chests: MapChest[];
  structures: MapStructure[];
  /** Fields this version doesn't know, kept as they are. */
  [extra: string]: unknown;
}

/** The character each terrain is written as in a `.map` file. */
export const TERRAIN_CHARS: Record<Terrain, string> = {
  ground: ".",
  ford: ",",
  river: "~",
  sea: "=",
  rock: "o",
  goldRock: "$",
  tree: "T",
  berries: "b",
};
const TERRAIN_BY_CHAR = new Map(
  Object.entries(TERRAIN_CHARS).map(([terrain, char]) => [char, terrain as Terrain]),
);

const KNOWN_KEYS = [
  "format",
  "version",
  "title",
  "mode",
  "size",
  "seed",
  "terrain",
  "keeps",
  "spawns",
  "ruins",
  "chests",
  "structures",
] as const;
const FACINGS: Facing[] = ["N", "E", "S", "W"];
const MODES: GameMode[] = ["endless", "pvp"];

/** How many keeps a map of each mode has. */
export const KEEPS_FOR_MODE: Record<GameMode, number> = { endless: 1, pvp: 2 };

export function mapWidth(map: Pick<MapFile, "size">): number {
  return MAP_SIZES[map.size].width;
}

export function mapHeight(map: Pick<MapFile, "size">): number {
  return MAP_SIZES[map.size].height;
}

export function terrainOf(map: MapFile, x: number, y: number): Terrain {
  return TERRAIN_BY_CHAR.get(map.terrain[y][x])!;
}

/** Every tile of a map's terrain, row by row (as GameState.terrain). */
export function terrainGrid(map: MapFile): Terrain[] {
  return map.terrain.flatMap((row) => [...row].map((c) => TERRAIN_BY_CHAR.get(c)!));
}

/** Terrain tiles back into rows. */
export function terrainRows(terrain: Terrain[], width: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < terrain.length; i += width) {
    rows.push(
      terrain
        .slice(i, i + width)
        .map((t) => TERRAIN_CHARS[t])
        .join(""),
    );
  }
  return rows;
}

/** Every tile of every spawn zone, each once, in row order. */
export function spawnTiles(map: Pick<MapFile, "spawns">): Point[] {
  const seen = new Set<string>();
  const tiles: Point[] = [];
  for (const zone of map.spawns) {
    for (let y = zone.y; y < zone.y + zone.height; y++) {
      for (let x = zone.x; x < zone.x + zone.width; x++) {
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tiles.push({ x, y });
      }
    }
  }
  return tiles.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Spawn tiles as rectangles: runs along each row, stacked where the rows below match, so a
 * strip is one zone.
 */
export function spawnZones(tiles: Point[]): SpawnZone[] {
  const set = new Set(tiles.map((t) => `${t.x},${t.y}`));
  const sorted = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
  const zones: SpawnZone[] = [];
  const open = new Map<string, SpawnZone>(); // "x,width" -> the zone the last row extends
  let row = Number.NaN;
  let rowRuns: SpawnZone[] = [];
  const closeRow = () => {
    const next = new Map<string, SpawnZone>();
    for (const run of rowRuns) {
      const key = `${run.x},${run.width}`;
      const above = open.get(key);
      if (above && above.y + above.height === run.y) {
        above.height++;
        next.set(key, above);
      } else {
        zones.push(run);
        next.set(key, run);
      }
    }
    open.clear();
    for (const [key, zone] of next) open.set(key, zone);
    rowRuns = [];
  };
  for (const t of sorted) {
    if (t.y !== row) {
      closeRow();
      row = t.y;
    }
    if (!set.has(`${t.x - 1},${t.y}`)) rowRuns.push({ x: t.x, y: t.y, width: 1, height: 1 });
    else rowRuns[rowRuns.length - 1].width++;
  }
  closeRow();
  return zones;
}

/** A game's map (terrain, keeps, spawns, ruins, chests and structures) as a `.map` file. */
export function mapFromGame(state: GameState, title: string, size: MapSize): MapFile {
  const built = Object.values(state.structures).sort((a, b) => a.id - b.id);
  return {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    title,
    mode: state.mode,
    size,
    seed: state.seed,
    terrain: terrainRows(state.terrain, state.width),
    keeps: state.keeps.map(({ x, y }) => ({ x, y })),
    spawns: spawnZones(state.spawnTiles),
    ruins: built
      .filter((s) => s.kind === "ruin")
      .map((s) => ({ x: s.x, y: s.y, hp: s.hp / s.maxHp })),
    chests: state.features
      .filter((f) => f.kind === "chest")
      .map(({ x, y, gold }) => ({ x, y, gold })),
    structures: built
      .filter((s) => s.kind !== "ruin")
      .map((s) => ({
        kind: s.kind,
        x: s.x,
        y: s.y,
        facing: s.facing ?? "N",
        keep: s.keep ?? nearestKeep(state.keeps, s),
      })),
  };
}

/** The index of the keep nearest a structure (by its centre). */
export function nearestKeep(keeps: Point[], p: Point): number {
  let best = 0;
  let bestDistance = Infinity;
  keeps.forEach((keep, i) => {
    const centre = (KEEP_SIZE - 1) / 2;
    const d = Math.hypot(keep.x + centre - p.x, keep.y + centre - p.y);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

/**
 * Reads a `.map` file's JSON. Anything malformed is refused with a message naming the problem;
 * fields this version doesn't know are kept.
 */
export function parseMap(json: unknown): { map: MapFile } | { error: string } {
  try {
    return { map: readMap(json) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function readMap(json: unknown): MapFile {
  const o = record(json, "The map");
  if (o.format !== MAP_FORMAT) throw new Error(`Not a map file (format should be "${MAP_FORMAT}")`);
  const version = int(o.version, "version");
  if (version > MAP_VERSION) {
    throw new Error(`This map is version ${version}; this game reads up to version ${MAP_VERSION}`);
  }
  if (version < 1) throw new Error("version must be 1 or more");
  if (typeof o.title !== "string") throw new Error("title must be text");
  if (!MODES.includes(o.mode as GameMode)) throw new Error(`mode must be ${MODES.join(" or ")}`);
  if (typeof o.size !== "string" || !(o.size in MAP_SIZES)) {
    throw new Error(`size must be one of ${Object.keys(MAP_SIZES).join(", ")}`);
  }
  const size = o.size as MapSize;
  const { width, height } = MAP_SIZES[size];
  const seed = int(o.seed, "seed");

  const terrain = list(o.terrain, "terrain");
  if (terrain.length !== height) {
    throw new Error(`terrain has ${terrain.length} rows; a ${size} map has ${height}`);
  }
  terrain.forEach((row, y) => {
    if (typeof row !== "string") throw new Error(`terrain row ${y} must be text`);
    if (row.length !== width) {
      throw new Error(`terrain row ${y} is ${row.length} long; a ${size} map is ${width} wide`);
    }
    for (let x = 0; x < row.length; x++) {
      if (!TERRAIN_BY_CHAR.has(row[x])) {
        throw new Error(`Unknown terrain "${row[x]}" at ${x},${y}`);
      }
    }
  });

  const keeps = list(o.keeps, "keeps").map((k, i) => point(k, `keeps[${i}]`));
  const spawns = list(o.spawns, "spawns").map((s, i) => {
    const r = record(s, `spawns[${i}]`);
    const zone = { ...point(r, `spawns[${i}]`), width: int(r.width, `spawns[${i}].width`) };
    const h = int(r.height, `spawns[${i}].height`);
    if (zone.width < 1 || h < 1) throw new Error(`spawns[${i}] must be at least 1x1`);
    return { ...zone, height: h };
  });
  const ruins = list(o.ruins, "ruins").map((r, i) => {
    const rec = record(r, `ruins[${i}]`);
    const hp = rec.hp;
    if (typeof hp !== "number" || !(hp > 0 && hp <= 1)) {
      throw new Error(`ruins[${i}].hp must be more than 0 and at most 1`);
    }
    return { ...point(rec, `ruins[${i}]`), hp };
  });
  const chests = list(o.chests, "chests").map((c, i) => {
    const rec = record(c, `chests[${i}]`);
    const gold = int(rec.gold, `chests[${i}].gold`);
    if (gold < 1) throw new Error(`chests[${i}].gold must be 1 or more`);
    return { ...point(rec, `chests[${i}]`), gold };
  });
  const structures = list(o.structures, "structures").map((s, i) => {
    const rec = record(s, `structures[${i}]`);
    const kind = rec.kind;
    if (typeof kind !== "string" || !(kind in STRUCTURES)) {
      throw new Error(`Unknown structure "${String(kind)}" in structures[${i}]`);
    }
    const stats: StructureStats = STRUCTURES[kind as StructureKind];
    if (stats.buildable === false) {
      throw new Error(`structures[${i}] can't be a ${kind} (use ruins)`);
    }
    if (!FACINGS.includes(rec.facing as Facing)) {
      throw new Error(`structures[${i}].facing must be ${FACINGS.join(", ")}`);
    }
    const keep = int(rec.keep, `structures[${i}].keep`);
    if (keep < 0 || keep >= keeps.length) {
      throw new Error(`structures[${i}].keep must be a keep's number (0 to ${keeps.length - 1})`);
    }
    return {
      kind: kind as StructureKind,
      ...point(rec, `structures[${i}]`),
      facing: rec.facing as Facing,
      keep,
    };
  });

  const extras = Object.fromEntries(
    Object.entries(o).filter(([key]) => !(KNOWN_KEYS as readonly string[]).includes(key)),
  );
  return {
    ...extras,
    format: MAP_FORMAT,
    version,
    title: o.title,
    mode: o.mode as GameMode,
    size,
    seed,
    terrain: terrain as string[],
    keeps,
    spawns,
    ruins,
    chests,
    structures,
  };
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${what} must be a list`);
  return value;
}

function int(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${what} must be a whole number`);
  }
  return value;
}

function point(value: unknown, what: string): Point {
  const r = record(value, what);
  return { x: int(r.x, `${what}.x`), y: int(r.y, `${what}.y`) };
}

/**
 * A map as file text: the known fields in a fixed order, then any extras; terrain one row per
 * line and one item per line, so a diff shows what changed.
 */
export function serializeMap(map: MapFile): string {
  const keys = [
    ...KNOWN_KEYS,
    ...Object.keys(map).filter((k) => !(KNOWN_KEYS as readonly string[]).includes(k)),
  ];
  const lines = keys.map((key) => {
    const value = map[key];
    const name = JSON.stringify(key);
    if (Array.isArray(value) && value.length > 0) {
      const items = value.map((item) => `    ${JSON.stringify(item)}`).join(",\n");
      return `  ${name}: [\n${items}\n  ]`;
    }
    return `  ${name}: ${JSON.stringify(value)}`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
}

/** A map's problems: errors stop it being played; warnings are worth a look. */
export interface MapProblems {
  errors: string[];
  warnings: string[];
}

/** Checks a parsed map against the game's rules (the spec's "Validation"). */
export function validateMap(map: MapFile): MapProblems {
  const errors: string[] = [];
  const warnings: string[] = [];
  const width = mapWidth(map);
  const height = mapHeight(map);
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const walkable = (x: number, y: number) =>
    inBounds(x, y) && TERRAIN[terrainOf(map, x, y)].walkable;
  const at = (p: Point) => `${p.x},${p.y}`;

  // Keeps.
  const wanted = KEEPS_FOR_MODE[map.mode];
  if (map.keeps.length !== wanted) {
    errors.push(
      `${map.mode === "pvp" ? "PvP" : "Endless"} maps need ${wanted} keep${wanted > 1 ? "s" : ""}; this has ${map.keeps.length}`,
    );
  }
  const keepTile = new Map<string, number>();
  map.keeps.forEach((keep, i) => {
    let off = false;
    let rough = false;
    let overlaps = false;
    for (const t of keepTiles(keep)) {
      if (!inBounds(t.x, t.y)) off = true;
      else if (!walkable(t.x, t.y)) rough = true;
      if (keepTile.has(at(t))) overlaps = true;
      keepTile.set(at(t), i);
    }
    if (off) errors.push(`Keep ${i + 1} is off the map`);
    if (rough) errors.push(`Keep ${i + 1} stands on terrain you can't walk on`);
    if (overlaps) errors.push(`Keep ${i + 1} overlaps another keep`);
  });

  // Spawns.
  const spawns = spawnTiles(map);
  const spawnSet = new Set(spawns.map(at));
  if (map.mode === "endless" && spawns.length === 0) {
    errors.push("Endless maps need a spawn zone");
  }
  if (spawns.some((t) => !inBounds(t.x, t.y))) errors.push("A spawn zone runs off the map");
  else if (spawns.some((t) => !walkable(t.x, t.y))) {
    errors.push("A spawn zone covers terrain you can't walk on");
  }
  if (spawns.some((t) => keepTile.has(at(t)))) errors.push("A spawn zone covers a keep");

  // Things on tiles.
  const base = new Map<string, StructureKind | "ruin">();
  const mount = new Set<string>();
  const occupied = (p: Point) => keepTile.has(at(p)) || spawnSet.has(at(p));
  for (const ruin of map.ruins) {
    if (!inBounds(ruin.x, ruin.y)) errors.push(`The ruin at ${at(ruin)} is off the map`);
    else if (TERRAIN[terrainOf(map, ruin.x, ruin.y)].buildable !== "any" || occupied(ruin)) {
      errors.push(`The ruin at ${at(ruin)} can't stand there`);
    } else if (base.has(at(ruin))) errors.push(`Two things stand at ${at(ruin)}`);
    else base.set(at(ruin), "ruin");
  }
  // Bases before towers, so a tower can see the wall it stands on.
  const ordered = [...map.structures].sort(
    (a, b) =>
      Number(STRUCTURES[a.kind].layer === "mount") - Number(STRUCTURES[b.kind].layer === "mount"),
  );
  for (const s of ordered) {
    const name = STRUCTURES[s.kind].name.toLowerCase();
    if (!inBounds(s.x, s.y)) {
      errors.push(`The ${name} at ${at(s)} is off the map`);
      continue;
    }
    const problem = structureProblem(map, s, base, mount, occupied(s));
    if (problem) {
      errors.push(`The ${name} at ${at(s)} ${problem}`);
      continue;
    }
    if (STRUCTURES[s.kind].layer === "mount") mount.add(at(s));
    else base.set(at(s), s.kind);
  }
  for (const chest of map.chests) {
    if (!inBounds(chest.x, chest.y)) errors.push(`The chest at ${at(chest)} is off the map`);
    else if (!walkable(chest.x, chest.y) || occupied(chest) || base.has(at(chest))) {
      errors.push(`The chest at ${at(chest)} can't stand there`);
    }
  }

  // Routes, on terrain alone (structures can be knocked down), to a tile beside a keep.
  const open = (x: number, y: number) => walkable(x, y) && !keepTile.has(`${x},${y}`);
  const besideKeep = (k: number) => {
    const goal = new Set(sides(map.keeps[k]).map(at));
    return (x: number, y: number) => goal.has(`${x},${y}`);
  };
  if (errors.length === 0) {
    if (map.mode === "endless") {
      if (!reaches(spawns, open, besideKeep(0), width, height)) {
        errors.push("Enemies have no way from the spawn to the keep");
      }
    } else if (!reaches(sides(map.keeps[0]), open, besideKeep(1), width, height)) {
      errors.push("There's no way between the two keeps");
    }
  }

  // Warnings.
  const near = MAP_EDITOR.keepNearSpawnTiles;
  if (
    map.keeps.some((keep) =>
      spawns.some(
        (t) =>
          t.x >= keep.x - near &&
          t.x < keep.x + KEEP_SIZE + near &&
          t.y >= keep.y - near &&
          t.y < keep.y + KEEP_SIZE + near,
      ),
    )
  ) {
    warnings.push(`A spawn zone is within ${near} tiles of a keep`);
  }
  if (map.keeps.length > 0 && map.chests.length > 0) {
    const reached = reachable(sides(map.keeps[0]), open, width, height);
    for (const chest of map.chests) {
      if (inBounds(chest.x, chest.y) && !reached.has(chest.y * width + chest.x)) {
        warnings.push(`The chest at ${at(chest)} can't be reached from the keep`);
      }
    }
  }
  return { errors, warnings };
}

/** Why a structure can't stand where it is (by the game's terrain and layer rules), if so. */
function structureProblem(
  map: MapFile,
  s: MapStructure,
  base: Map<string, StructureKind | "ruin">,
  mount: Set<string>,
  onKeepOrSpawn: boolean,
): string | null {
  if (onKeepOrSpawn) return "is on a keep or a spawn zone";
  const stats: StructureStats = STRUCTURES[s.kind];
  const terrain = TERRAIN[terrainOf(map, s.x, s.y)];
  const key = `${s.x},${s.y}`;
  const under = base.get(key);
  if (terrain.buildable === "none") return `can't stand on ${terrain.name.toLowerCase()}`;
  if (terrain.buildable === "bridgeOnly" && !stats.spansWater && under === undefined) {
    return "needs a bridge to stand on";
  }
  if (terrain.buildable === "any" && stats.spansWater) return "only goes over a river";
  if (stats.layer === "mount") {
    if (mount.has(key)) return "shares its tile with another tower";
    const below: StructureStats | undefined = under && STRUCTURES[under];
    if (below && !below.acceptsMount) return `can't stand on a ${below.name.toLowerCase()}`;
    return null;
  }
  if (under !== undefined) return "shares its tile with something else";
  return null;
}

/** The tiles a keep covers. */
export function keepTiles(keep: Point): Point[] {
  const tiles: Point[] = [];
  for (let y = keep.y; y < keep.y + KEEP_SIZE; y++) {
    for (let x = keep.x; x < keep.x + KEEP_SIZE; x++) tiles.push({ x, y });
  }
  return tiles;
}

/** The tiles beside a keep's four sides (not its corners): where an attacker stands. */
function sides(keep: Point): Point[] {
  const tiles: Point[] = [];
  for (let i = 0; i < KEEP_SIZE; i++) {
    tiles.push(
      { x: keep.x + i, y: keep.y - 1 },
      { x: keep.x + i, y: keep.y + KEEP_SIZE },
      { x: keep.x - 1, y: keep.y + i },
      { x: keep.x + KEEP_SIZE, y: keep.y + i },
    );
  }
  return tiles;
}

/** Tile indexes reachable from `start`, stepping up, down, left and right over `open` tiles. */
function reachable(
  start: Point[],
  open: (x: number, y: number) => boolean,
  width: number,
  height: number,
): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const p of start) {
    if (!open(p.x, p.y)) continue;
    const i = p.y * width + p.x;
    if (!seen.has(i)) {
      seen.add(i);
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    const y = (i - x) / width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !open(nx, ny)) continue;
      const n = ny * width + nx;
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}

function reaches(
  start: Point[],
  open: (x: number, y: number) => boolean,
  goal: (x: number, y: number) => boolean,
  width: number,
  height: number,
): boolean {
  for (const i of reachable(start, open, width, height)) {
    const x = i % width;
    if (goal(x, (i - x) / width)) return true;
  }
  return false;
}
