// The map editor's edits (SPEC-map-editor.md): each one takes a map and gives back a new one,
// with a note when it did something the designer should know about (or couldn't do what was
// asked). No DOM, so it's all tested directly. The page (editor.ts) wires these to the mouse.
import { KEEP_SIZE, MAP_EDITOR, STRUCTURES, TERRAIN, type StructureStats } from "../sim/config";
import { createGame } from "../sim/game";
import { placeKeepWalls, ringTiles } from "../sim/keepWalls";
import {
  KEEPS_FOR_MODE,
  TERRAIN_CHARS,
  mapFromGame,
  mapHeight,
  mapWidth,
  nearestKeep,
  spawnTiles,
  spawnZones,
  terrainOf,
  type MapFile,
  type MapStructure,
} from "../sim/mapFile";
import type { Facing, Point, StructureKind, Terrain } from "../sim/types";

export interface Edit {
  map: MapFile;
  /** Something worth saying in the status line: what was removed, or why nothing happened. */
  note?: string;
}

const at = (p: Point) => `${p.x},${p.y}`;

function inBounds(map: MapFile, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mapWidth(map) && y < mapHeight(map);
}

/** The keep covering (x, y), if any. */
export function keepAt(map: MapFile, x: number, y: number): number | undefined {
  const i = map.keeps.findIndex(
    (k) => x >= k.x && y >= k.y && x < k.x + KEEP_SIZE && y < k.y + KEEP_SIZE,
  );
  return i >= 0 ? i : undefined;
}

export function inSpawn(map: MapFile, x: number, y: number): boolean {
  return map.spawns.some((z) => x >= z.x && y >= z.y && x < z.x + z.width && y < z.y + z.height);
}

function structuresAt(map: MapFile, x: number, y: number): MapStructure[] {
  return map.structures.filter((s) => s.x === x && s.y === y);
}

const isMount = (kind: StructureKind) => STRUCTURES[kind].layer === "mount";
const spansWater = (kind: StructureKind) =>
  (STRUCTURES[kind] as StructureStats).spansWater === true;

/** A copy of the map with some tiles' terrain changed. */
function withTerrain(map: MapFile, tiles: Point[], terrain: Terrain): MapFile {
  const rows = new Map<number, string[]>();
  for (const t of tiles) {
    if (!rows.has(t.y)) rows.set(t.y, [...map.terrain[t.y]]);
    rows.get(t.y)![t.x] = TERRAIN_CHARS[terrain];
  }
  return { ...map, terrain: map.terrain.map((row, y) => rows.get(y)?.join("") ?? row) };
}

/** Why a structure can't stand on a tile's terrain (with whatever base is under it), if so. */
function terrainProblem(map: MapFile, kind: StructureKind, x: number, y: number): string | null {
  const stats: StructureStats = STRUCTURES[kind];
  const terrain = TERRAIN[terrainOf(map, x, y)];
  const onBridge = structuresAt(map, x, y).some((s) => spansWater(s.kind));
  if (terrain.buildable === "none") return `can't stand on ${terrain.name.toLowerCase()}`;
  if (terrain.buildable === "bridgeOnly" && !stats.spansWater && !onBridge) {
    return "needs a bridge to stand on";
  }
  if (terrain.buildable === "any" && stats.spansWater) return "only goes over a river";
  return null;
}

/**
 * Takes away whatever on `tiles` can't stand on its terrain any more: structures, ruins, chests
 * and spawn tiles. Says what went.
 */
function prune(map: MapFile, tiles: Point[]): Edit {
  const changed = new Set(tiles.map(at));
  const gone: string[] = [];
  const keepIf = (stays: boolean, what: string) => stays || (gone.push(what), false);
  // Bases first, so a tower whose bridge went goes too.
  const bases = map.structures.filter(
    (s) =>
      !changed.has(at(s)) ||
      isMount(s.kind) ||
      keepIf(!terrainProblem(map, s.kind, s.x, s.y), STRUCTURES[s.kind].name.toLowerCase()),
  );
  const structures = bases.filter(
    (s) =>
      !changed.has(at(s)) ||
      !isMount(s.kind) ||
      keepIf(
        !terrainProblem({ ...map, structures: bases }, s.kind, s.x, s.y),
        STRUCTURES[s.kind].name.toLowerCase(),
      ),
  );
  const ruins = map.ruins.filter(
    (r) =>
      !changed.has(at(r)) || keepIf(TERRAIN[terrainOf(map, r.x, r.y)].buildable === "any", "ruin"),
  );
  const chests = map.chests.filter(
    (c) => !changed.has(at(c)) || keepIf(TERRAIN[terrainOf(map, c.x, c.y)].walkable, "chest"),
  );
  let spawns = map.spawns;
  const lost = new Set(
    tiles
      .filter((t) => inSpawn(map, t.x, t.y) && !TERRAIN[terrainOf(map, t.x, t.y)].walkable)
      .map(at),
  );
  if (lost.size > 0) {
    spawns = spawnZones(spawnTiles(map).filter((t) => !lost.has(at(t))));
    for (let i = 0; i < lost.size; i++) gone.push("spawn tile");
  }
  const result = { ...map, structures, ruins, chests, spawns };
  if (gone.length === 0) return { map: result };
  return { map: result, note: `Removed ${describe(gone)} that couldn't stand there` };
}

/** "a wall, 2 ruins and a chest". */
function describe(things: string[]): string {
  const counts = new Map<string, number>();
  for (const t of things) counts.set(t, (counts.get(t) ?? 0) + 1);
  const parts = [...counts].map(([t, n]) =>
    n === 1 ? `${/^[aeiou]/.test(t) ? "an" : "a"} ${t}` : `${n} ${t}s`,
  );
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** The tiles of a square brush of `size` centred on `centre`, on the map. */
export function brushTiles(map: MapFile, centre: Point, size: number): Point[] {
  const r = Math.floor(size / 2);
  const tiles: Point[] = [];
  for (let y = centre.y - r; y <= centre.y + r; y++) {
    for (let x = centre.x - r; x <= centre.x + r; x++)
      if (inBounds(map, x, y)) tiles.push({ x, y });
  }
  return tiles;
}

/** The tiles of the rectangle between two corners, on the map. */
export function rectTiles(map: MapFile, a: Point, b: Point): Point[] {
  const tiles: Point[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
      if (inBounds(map, x, y)) tiles.push({ x, y });
    }
  }
  return tiles;
}

/** Paints terrain on tiles (never under a keep), removing whatever can't stand on it now. */
export function paintTerrain(map: MapFile, tiles: Point[], terrain: Terrain): Edit {
  const paintable = tiles.filter(
    (t) => keepAt(map, t.x, t.y) === undefined && terrainOf(map, t.x, t.y) !== terrain,
  );
  if (paintable.length === 0) return { map };
  return prune(withTerrain(map, paintable, terrain), paintable);
}

/** Clears a keep's footprint: ground underneath, and nothing else on it. */
function clearForKeep(map: MapFile, keep: Point): MapFile {
  const tiles = rectTiles(map, keep, { x: keep.x + KEEP_SIZE - 1, y: keep.y + KEEP_SIZE - 1 });
  const covered = new Set(tiles.map(at));
  const rough = tiles.filter((t) => !TERRAIN[terrainOf(map, t.x, t.y)].walkable);
  const cleared = withTerrain(map, rough, "ground");
  return {
    ...cleared,
    structures: cleared.structures.filter((s) => !covered.has(at(s))),
    ruins: cleared.ruins.filter((r) => !covered.has(at(r))),
    chests: cleared.chests.filter((c) => !covered.has(at(c))),
    spawns: spawnZones(spawnTiles(cleared).filter((t) => !covered.has(at(t)))),
  };
}

/** The top-left a keep centred on `centre` would have, kept on the map. */
function keepCorner(map: MapFile, centre: Point): Point {
  const half = Math.floor(KEEP_SIZE / 2);
  return {
    x: Math.max(0, Math.min(mapWidth(map) - KEEP_SIZE, centre.x - half)),
    y: Math.max(0, Math.min(mapHeight(map) - KEEP_SIZE, centre.y - half)),
  };
}

/**
 * Places a keep centred on a tile. Endless has one keep, so this moves it; PvP has two, placed
 * in order, after which the nearer one moves.
 */
export function placeKeep(map: MapFile, centre: Point): Edit {
  const wanted = KEEPS_FOR_MODE[map.mode];
  if (map.keeps.length < wanted) {
    const corner = keepCorner(map, centre);
    if (overlapsKeep(map, corner, -1)) return { map, note: "Keeps can't overlap" };
    return { map: clearForKeep({ ...map, keeps: [...map.keeps, corner] }, corner) };
  }
  return moveKeep(map, nearestKeep(map.keeps, centre), centre);
}

/** Moves keep `index` to be centred on a tile. Its structures stay its own. */
export function moveKeep(map: MapFile, index: number, centre: Point): Edit {
  const corner = keepCorner(map, centre);
  if (overlapsKeep(map, corner, index)) return { map, note: "Keeps can't overlap" };
  const keeps = map.keeps.map((k, i) => (i === index ? corner : k));
  return { map: clearForKeep({ ...map, keeps }, corner) };
}

function overlapsKeep(map: MapFile, corner: Point, except: number): boolean {
  return map.keeps.some(
    (k, i) =>
      i !== except && Math.abs(k.x - corner.x) < KEEP_SIZE && Math.abs(k.y - corner.y) < KEEP_SIZE,
  );
}

/**
 * Takes the walls and gates off every keep's ring, then builds the ring again as a new game
 * does (gate towards the enemy).
 */
export function rebuildKeepWalls(map: MapFile): Edit {
  if (map.keeps.some((k) => !inBounds(map, k.x, k.y)))
    return { map, note: "Place the keeps first" };
  const ring = new Set(map.keeps.flatMap((k) => ringTiles({ ...k, size: KEEP_SIZE })).map(at));
  const others = map.structures.filter(
    (s) => !(ring.has(at(s)) && (s.kind === "wall" || s.kind === "gate")),
  );
  const bare = { ...map, structures: others };
  const state = createGame(map.seed, { map: bare, players: [] });
  placeKeepWalls(state);
  const { structures } = mapFromGame(state, map.title, map.size);
  return { map: { ...map, structures } };
}

/**
 * Adds a spawn zone over a rectangle (Endless only). Ground goes under it where it couldn't be
 * walked on, and anything on it is taken away; keeps are left alone.
 */
export function addSpawn(map: MapFile, a: Point, b: Point): Edit {
  if (map.mode !== "endless") return { map, note: "PvP maps have no enemy spawns" };
  const tiles = rectTiles(map, a, b).filter((t) => keepAt(map, t.x, t.y) === undefined);
  if (tiles.length === 0) return { map };
  const covered = new Set(tiles.map(at));
  const rough = tiles.filter((t) => !TERRAIN[terrainOf(map, t.x, t.y)].walkable);
  const ground = withTerrain(map, rough, "ground");
  return {
    map: {
      ...ground,
      spawns: spawnZones([...spawnTiles(map), ...tiles]),
      structures: ground.structures.filter((s) => !covered.has(at(s))),
      ruins: ground.ruins.filter((r) => !covered.has(at(r))),
      chests: ground.chests.filter((c) => !covered.has(at(c))),
    },
  };
}

/** Why nothing but terrain can go on a tile (a keep or a spawn zone), if so. */
function reserved(map: MapFile, x: number, y: number): string | null {
  if (!inBounds(map, x, y)) return "That's off the map";
  if (keepAt(map, x, y) !== undefined) return "Nothing can go on a keep";
  if (inSpawn(map, x, y)) return "Nothing can go in a spawn zone";
  return null;
}

/** Places a ruin (or sets the HP of the one there). */
export function placeRuin(map: MapFile, p: Point, hp: number = MAP_EDITOR.defaultRuinHp): Edit {
  const problem = reserved(map, p.x, p.y);
  if (problem) return { map, note: problem };
  if (TERRAIN[terrainOf(map, p.x, p.y)].buildable !== "any") {
    return { map, note: "A ruin can't stand there" };
  }
  if (structuresAt(map, p.x, p.y).some((s) => !isMount(s.kind))) {
    return { map, note: "Something's already built there" };
  }
  if (map.chests.some((c) => c.x === p.x && c.y === p.y))
    return { map, note: "There's a chest there" };
  const ruins = [...map.ruins.filter((r) => r.x !== p.x || r.y !== p.y), { x: p.x, y: p.y, hp }];
  return { map: { ...map, ruins } };
}

/** Places a chest (or sets the gold of the one there). */
export function placeChest(
  map: MapFile,
  p: Point,
  gold: number = MAP_EDITOR.chestGold.default,
): Edit {
  const problem = reserved(map, p.x, p.y);
  if (problem) return { map, note: problem };
  if (!TERRAIN[terrainOf(map, p.x, p.y)].walkable) return { map, note: "A chest can't go there" };
  if (structuresAt(map, p.x, p.y).length > 0 || map.ruins.some((r) => r.x === p.x && r.y === p.y)) {
    return { map, note: "Something's already there" };
  }
  const chests = [
    ...map.chests.filter((c) => c.x !== p.x || c.y !== p.y),
    { x: p.x, y: p.y, gold },
  ];
  return { map: { ...map, chests } };
}

/** Why a structure can't be placed on a tile, by the game's rules, if so. */
export function structureProblem(
  map: MapFile,
  kind: StructureKind,
  x: number,
  y: number,
): string | null {
  const problem = reserved(map, x, y);
  if (problem) return problem;
  const name = STRUCTURES[kind].name;
  const terrain = terrainProblem(map, kind, x, y);
  if (terrain) return `A ${name.toLowerCase()} ${terrain}`;
  if (map.chests.some((c) => c.x === x && c.y === y)) return "There's a chest there";
  const here = structuresAt(map, x, y);
  const ruin = map.ruins.some((r) => r.x === x && r.y === y);
  if (isMount(kind)) {
    if (here.some((s) => isMount(s.kind))) return "A tower is already here";
    const base = here.find((s) => !isMount(s.kind));
    const under: StructureStats | undefined = base && STRUCTURES[base.kind];
    if (under && !under.acceptsMount) return `Can't put a tower on ${under.name.toLowerCase()}`;
    return null;
  }
  if (here.some((s) => !isMount(s.kind)) || ruin) return "Something's already built there";
  return null;
}

/** Places a structure, facing `facing`, belonging to the nearest keep. */
export function placeStructure(map: MapFile, kind: StructureKind, p: Point, facing: Facing): Edit {
  const problem = structureProblem(map, kind, p.x, p.y);
  if (problem) return { map, note: problem };
  const keep = map.keeps.length > 0 ? nearestKeep(map.keeps, p) : 0;
  return {
    map: { ...map, structures: [...map.structures, { kind, x: p.x, y: p.y, facing, keep }] },
  };
}

/**
 * Takes the top thing off a tile: a tower, then whatever it stood on; then a ruin or chest;
 * then the tile's place in a spawn zone. On bare terrain, paints ground.
 */
export function erase(map: MapFile, p: Point): Edit {
  if (!inBounds(map, p.x, p.y) || keepAt(map, p.x, p.y) !== undefined) return { map };
  const here = structuresAt(map, p.x, p.y);
  const top = here.find((s) => isMount(s.kind)) ?? here[0];
  if (top) return { map: { ...map, structures: map.structures.filter((s) => s !== top) } };
  if (map.ruins.some((r) => r.x === p.x && r.y === p.y)) {
    return { map: { ...map, ruins: map.ruins.filter((r) => r.x !== p.x || r.y !== p.y) } };
  }
  if (map.chests.some((c) => c.x === p.x && c.y === p.y)) {
    return { map: { ...map, chests: map.chests.filter((c) => c.x !== p.x || c.y !== p.y) } };
  }
  if (inSpawn(map, p.x, p.y)) {
    const spawns = spawnZones(spawnTiles(map).filter((t) => t.x !== p.x || t.y !== p.y));
    return { map: { ...map, spawns } };
  }
  return paintTerrain(map, [p], "ground");
}

/**
 * Undo and redo. A step is everything between `begin` and `end` (one click, or one drag), so a
 * whole brush stroke undoes at once. A step that changed nothing isn't kept.
 */
export class History {
  private undos: MapFile[] = [];
  private redos: MapFile[] = [];
  private open = false;

  constructor(
    public map: MapFile,
    private readonly limit = MAP_EDITOR.undoSteps,
  ) {}

  begin(): void {
    if (this.open) this.end();
    this.undos.push(this.map);
    if (this.undos.length > this.limit) this.undos.shift();
    this.open = true;
  }

  /** The map as it is now, partway through or at the end of a step. */
  set(map: MapFile): void {
    if (!this.open) this.begin();
    this.map = map;
  }

  end(): void {
    if (!this.open) return;
    this.open = false;
    if (this.undos.at(-1) === this.map) this.undos.pop();
    else this.redos = [];
  }

  /** One whole step: begin, set, end. */
  apply(map: MapFile): void {
    this.begin();
    this.set(map);
    this.end();
  }

  get canUndo(): boolean {
    return this.undos.length > 0;
  }

  get canRedo(): boolean {
    return this.redos.length > 0;
  }

  undo(): boolean {
    this.end();
    const previous = this.undos.pop();
    if (!previous) return false;
    this.redos.push(this.map);
    this.map = previous;
    return true;
  }

  redo(): boolean {
    this.end();
    const next = this.redos.pop();
    if (!next) return false;
    this.undos.push(this.map);
    this.map = next;
    return true;
  }
}
