// Rafts: Endless on a drowning map. The keep stands on raised land (hill) with resources on it;
// a few seconds in, the flood rises from the map's edges and its rivers and sea, a ring at a
// time, until everything else is under water but what stands up from it (walls, ruins, trees,
// rocks, bushes). Waves can't walk in, so they sail: each group of a wave boards a raft at the
// map's edge, which finds its way over the water to the keep's shore and puts them off there.
// Towers can shoot them on the way; walls built out across the water (see canBuild) can block
// a raft's way. If they shut it off, it waits, and in the end puts them off wherever it can.
import { RAFTS, RESOURCES, TERRAIN, TICK_RATE, type EnemyKindId } from "./config";
import { attack, spawnEnemy, type SpawnOptions } from "./enemies";
import { baseAt, blocksAt, inBounds, isKeepTile, mountAt, removeStructure } from "./grid";
import { nextRandom, randomInt } from "./rng";
import type { Enemy, GameState, Keep, Point, Raft, Rafts, Terrain } from "./types";

const FOUR = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function createRafts(): Rafts {
  return { nextRise: RAFTS.floodSeconds * TICK_RATE, boats: [], nextId: 1, draining: {} };
}

/** Water a raft sails on: the flood, a river or the sea, with nothing built on it. */
const WATER = new Set<Terrain>(["floodwater", "river", "sea"]);

/** A raft's tiles, from its top-left (x, y). */
function deck(x: number, y: number): Point[] {
  const tiles: Point[] = [];
  for (let dy = 0; dy < RAFTS.raftTiles; dy++)
    for (let dx = 0; dx < RAFTS.raftTiles; dx++) tiles.push({ x: x + dx, y: y + dy });
  return tiles;
}

/** Whether a raft with its top-left at (x, y) floats: water under all of it. */
function afloat(state: GameState, x: number, y: number): boolean {
  return deck(x, y).every((p) => isWater(state, p.x, p.y));
}

/** Where the `k`th rider stands on a raft at (x, y): spread over its tiles. */
function riderSpot(x: number, y: number, k: number): Point {
  const n = RAFTS.raftTiles;
  return { x: x + (k % n), y: y + (Math.floor(k / n) % n) };
}

/** Puts riders aboard a raft, where they stand on it. */
function board(raft: Raft, riders: Enemy[]): void {
  for (const rider of riders) {
    const spot = riderSpot(raft.x, raft.y, raft.riders.length);
    rider.x = rider.tx = rider.px = spot.x;
    rider.y = rider.ty = rider.py = spot.y;
    rider.raft = raft.id;
    raft.riders.push(rider.id);
  }
}

function isWater(state: GameState, x: number, y: number): boolean {
  return (
    inBounds(state, x, y) && WATER.has(state.terrain[y * state.width + x]) && !baseAt(state, x, y)
  );
}

/**
 * The map with the keeps' land raised: hill in a rough disc round each, `RAFTS.raisedRadius`
 * tiles from its middle, over everything but resources, with patches of resources added on it
 * clear of the keep's walls. Called when the game is made, with its seed.
 */
export function raiseLand(
  terrain: Terrain[],
  width: number,
  height: number,
  keeps: Pick<Keep, "x" | "y" | "size">[],
  seed: number,
): Terrain[] {
  const rng = { rngState: seed ^ 0x6a09e667 };
  const raised = [...terrain];
  const { raisedRadius: r, raisedRough, patches, patchSize, patchKinds } = RAFTS;
  for (const keep of keeps) {
    const cx = keep.x + keep.size / 2;
    const cy = keep.y + keep.size / 2;
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) {
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d > 1 + (nextRandom(rng) - 0.5) * 2 * raisedRough) continue;
        const i = y * width + x;
        if (!(raised[i] in RESOURCES)) raised[i] = "hill";
      }
    }
    // Resources, out past the keep's walls (and a tile more, to walk round them).
    const clear = keep.size / 2 + 4;
    for (let k = 0; k < patches; k++) {
      const angle = nextRandom(rng) * 2 * Math.PI;
      const at = clear + 2 + nextRandom(rng) * (r - clear - 4);
      const kind = patchKinds[randomInt(rng, 0, patchKinds.length - 1)];
      let p = {
        x: Math.round(cx + Math.cos(angle) * at),
        y: Math.round(cy + Math.sin(angle) * at),
      };
      for (let n = randomInt(rng, patchSize.min, patchSize.max); n > 0; n--) {
        const i = p.y * width + p.x;
        const inside = Math.hypot(p.x + 0.5 - cx, p.y + 0.5 - cy) >= clear;
        if (p.x >= 0 && p.y >= 0 && p.x < width && p.y < height && inside && raised[i] === "hill") {
          raised[i] = kind;
        }
        const step = FOUR[randomInt(rng, 0, 3)];
        p = { x: p.x + step.x, y: p.y + step.y };
      }
    }
  }
  return raised;
}

/** Once a tick: the flood rises (every RAFTS.riseSeconds), and the rafts sail. */
export function updateRafts(state: GameState): void {
  const rafts = state.rafts;
  if (!rafts) return;
  if (state.tick >= rafts.nextRise) {
    rafts.nextRise = state.tick + Math.max(1, Math.round(RAFTS.riseSeconds * TICK_RATE));
    rise(state, liveWater(state));
  }
  if (state.tick % TICK_RATE === 0 && state.tick >= RAFTS.floodSeconds * TICK_RATE) {
    drain(state, rafts, liveWater(state));
  }
  const aboard = new Map(state.enemies.map((e) => [e.id, e]));
  for (const raft of rafts.boats) sail(state, raft, aboard);
  // An empty raft (its riders off, or shot) stays a while, then goes.
  rafts.boats = rafts.boats.filter(
    (raft) => raft.emptyUntil === null || state.tick < raft.emptyUntil,
  );
}

/** Whether the flood can take (x, y): not raised land, the keep, walls, or what stands up from it. */
function floods(state: GameState, x: number, y: number): boolean {
  const t = state.terrain[y * state.width + x];
  if (WATER.has(t) || t === "hill" || t in RESOURCES || isKeepTile(state, x, y)) return false;
  // A wall holds it from when it's put up, built or not (or the water would take one going up on
  // the shore), and so does a gate in it.
  const base = baseAt(state, x, y);
  return !(base && (base.kind === "wall" || base.kind === "ruin" || base.kind === "gate"));
}

/** The tiles beside (x, y) on the map, as indices. */
function besideOnMap(state: GameState, x: number, y: number): number[] {
  return FOUR.filter((d) => inBounds(state, x + d.x, y + d.y)).map(
    (d) => (y + d.y) * state.width + x + d.x,
  );
}

/**
 * Water still joined, through water (not walls on it), to the map's edge, where the flood comes
 * from: per tile, 1 if so. Water walled off from it drains away (see drain).
 */
function liveWater(state: GameState): Uint8Array {
  const { width, height } = state;
  const live = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (edge && isWater(state, x, y)) {
        live[y * width + x] = 1;
        queue.push(y * width + x);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    for (const n of besideOnMap(state, x, (i - x) / width)) {
      const nx = n % width;
      if (live[n] || !isWater(state, nx, (n - nx) / width)) continue;
      live[n] = 1;
      queue.push(n);
    }
  }
  return live;
}

/**
 * The flood rises a ring: every tile it can take on the map's edge, or beside water joined to
 * it (`live`), goes under.
 */
function rise(state: GameState, live: Uint8Array): void {
  const { width, height } = state;
  const under: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!floods(state, x, y)) continue;
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (edge || besideOnMap(state, x, y).some((n) => live[n])) under.push(y * width + x);
    }
  }
  const going = new Set(under);
  for (const i of under) drown(state, i % width, Math.floor(i / width), going);
}

/**
 * Once a second: floodwater walled off from the map's edge (not `live`) drains back to ground,
 * from its edges in, a tile of it beside land (or a wall) going once it's been cut off and beside
 * land RAFTS.drainSeconds. So land the players wall off dries out, a ring at a time. Rivers and
 * the sea stay.
 */
function drain(state: GameState, rafts: Rafts, live: Uint8Array): void {
  const { width, height } = state;
  const draining: Record<number, number> = {};
  for (let i = 0; i < width * height; i++) {
    if (state.terrain[i] !== "floodwater" || live[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    const byLand = besideOnMap(state, x, y).some((n) => {
      const nx = n % width;
      return !isWater(state, nx, (n - nx) / width);
    });
    if (!byLand) continue;
    const seconds = (rafts.draining[i] ?? 0) + 1;
    if (seconds >= RAFTS.drainSeconds) {
      state.terrain[i] = "ground";
      state.gridVersion++;
    } else draining[i] = seconds;
  }
  rafts.draining = draining;
}

/**
 * A tile goes under: floodwater, with what's built and lying on it gone. Units and enemies on it
 * scramble to dry land beside it (not going under too), or drown if there's none: so riders who
 * break a wall holding the water back aren't all washed away as it comes through behind them.
 */
function drown(state: GameState, x: number, y: number, going: Set<number>): void {
  const mount = mountAt(state, x, y);
  if (mount) removeStructure(state, mount);
  const base = baseAt(state, x, y);
  if (base) removeStructure(state, base);
  state.terrain[y * state.width + x] = "floodwater";
  const on = (p: Point) => Math.round(p.x) === x && Math.round(p.y) === y;
  const dry = round(state, x, y, 1, (p) => {
    const i = p.y * state.width + p.x;
    return (
      TERRAIN[state.terrain[i]].walkable &&
      !going.has(i) &&
      !blocksAt(state, p.x, p.y) &&
      !isKeepTile(state, p.x, p.y)
    );
  });
  const ashore = (mover: { x: number; y: number; tx: number; ty: number }, k: number) => {
    const p = dry[k % dry.length];
    mover.x = mover.tx = p.x;
    mover.y = mover.ty = p.y;
  };
  let k = 0;
  for (const unit of state.units) {
    if (!on(unit)) continue;
    if (dry.length === 0) unit.hp = 0;
    else {
      ashore(unit, k++);
      unit.path = [];
      unit.pathGoal = null;
    }
  }
  state.enemies = state.enemies.filter((e) => {
    if (e.raft !== undefined || !on(e)) return true;
    if (dry.length === 0) return false;
    ashore(e, k++);
    e.px = e.x;
    e.py = e.y;
    e.steer = null;
    return true;
  });
  state.features = state.features.filter((f) => !on(f));
  state.gridVersion++;
}

/**
 * A wave's group (its first is the leader of the rest) sets off on a raft from a random stretch
 * of water on the map's edge; with none yet (the flood still coming), it comes in on foot from
 * there instead. True if it went at all.
 */
export function launchRaft(
  state: GameState,
  kinds: EnemyKindId[],
  options: Pick<SpawnOptions, "wave" | "variant">,
): boolean {
  const rafts = state.rafts!;
  // A raft still boarding with room takes them, so a wave sails in a few rafts, not dozens.
  const boarding = rafts.boats.find(
    (r) => r.boardUntil > state.tick && r.riders.length + kinds.length <= RAFTS.riders,
  );
  if (boarding) {
    const [first, ...band] = kinds;
    const leader = spawnEnemy(state, boarding.x, boarding.y, { ...options, kind: first });
    const rest = band.map((kind) =>
      spawnEnemy(state, boarding.x, boarding.y, { ...options, kind, leader }),
    );
    board(boarding, [leader, ...rest]);
    return true;
  }
  const edge = edgeTiles(state);
  const water = edge.filter((p) => afloat(state, p.x, p.y));
  const dry = edge.filter((p) => TERRAIN[state.terrain[p.y * state.width + p.x]].walkable);
  const from = water.length > 0 ? water : dry;
  if (from.length === 0) return false;
  const p = from[randomInt(state, 0, from.length - 1)];
  const [first, ...band] = kinds;
  const leader = spawnEnemy(state, p.x, p.y, { ...options, kind: first });
  const riders = [
    leader,
    ...band.map((kind) => spawnEnemy(state, p.x, p.y, { ...options, kind, leader })),
  ];
  if (water.length === 0) return true;
  const raft: Raft = {
    id: rafts.nextId++,
    x: p.x,
    y: p.y,
    path: [],
    pathVersion: -1,
    riders: [],
    stuck: 0,
    docked: false,
    boardUntil: state.tick + RAFTS.boardSeconds * TICK_RATE,
    emptyUntil: null,
  };
  board(raft, riders);
  rafts.boats.push(raft);
  return true;
}

/** Where a raft (its top-left) can sit against the map's edge. */
function edgeTiles(state: GameState): Point[] {
  const right = state.width - RAFTS.raftTiles;
  const bottom = state.height - RAFTS.raftTiles;
  const tiles: Point[] = [];
  for (let x = 0; x <= right; x++) tiles.push({ x, y: 0 }, { x, y: bottom });
  for (let y = 1; y < bottom; y++) tiles.push({ x: 0, y }, { x: right, y });
  return tiles;
}

/** The land joined to a keep, walking (structures aside), worked out once per grid version. */
const mainlands = new WeakMap<GameState, { version: number; land: Uint8Array }>();

function mainland(state: GameState): Uint8Array {
  const cached = mainlands.get(state);
  if (cached && cached.version === state.gridVersion) return cached.land;
  const { width, height } = state;
  const land = new Uint8Array(width * height);
  const queue: number[] = [];
  const walkable = (x: number, y: number) =>
    inBounds(state, x, y) && TERRAIN[state.terrain[y * width + x]].walkable;
  for (const keep of state.keeps) {
    // From round the keep (its own tiles aren't walked).
    for (let y = keep.y - 1; y <= keep.y + keep.size; y++) {
      for (let x = keep.x - 1; x <= keep.x + keep.size; x++) {
        if (!walkable(x, y) || isKeepTile(state, x, y) || land[y * width + x]) continue;
        land[y * width + x] = 1;
        queue.push(y * width + x);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    const y = (i - x) / width;
    for (const d of FOUR) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!walkable(nx, ny) || land[ny * width + nx] || isKeepTile(state, nx, ny)) continue;
      land[ny * width + nx] = 1;
      queue.push(ny * width + nx);
    }
  }
  mainlands.set(state, { version: state.gridVersion, land });
  return land;
}

/** The tiles round an n-tile square at (x, y) (a raft, say; not under it) where `keep` holds. */
function round(
  state: GameState,
  x: number,
  y: number,
  n: number,
  keep: (p: Point) => boolean,
): Point[] {
  const tiles: Point[] = [];
  for (let ty = y - 1; ty <= y + n; ty++) {
    for (let tx = x - 1; tx <= x + n; tx++) {
      const under = tx >= x && tx < x + n && ty >= y && ty < y + n;
      const p = { x: tx, y: ty };
      if (!under && inBounds(state, tx, ty) && keep(p)) tiles.push(p);
    }
  }
  return tiles;
}

/** Mainland a rider can step onto: nothing built in the way (a wall, a ruin). */
function open(state: GameState, land: Uint8Array, p: Point): boolean {
  return land[p.y * state.width + p.x] === 1 && !blocksAt(state, p.x, p.y);
}

/** The mainland round a raft at (x, y) its riders can step onto. */
function shoreBeside(state: GameState, land: Uint8Array, x: number, y: number): Point[] {
  return round(state, x, y, RAFTS.raftTiles, (p) => open(state, land, p));
}

/**
 * The shortest way over water from (x, y) to water beside the mainland (walled or not: riders
 * break their way in), or null.
 */
function wayToShore(state: GameState, from: Point): Point[] | null {
  const { width } = state;
  const land = mainland(state);
  const start = from.y * width + from.x;
  const cameFrom = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    const y = (i - x) / width;
    const ashore = deck(x, y).some((t) =>
      FOUR.some((d) => {
        const p = { x: t.x + d.x, y: t.y + d.y };
        return inBounds(state, p.x, p.y) && land[p.y * width + p.x] === 1;
      }),
    );
    if (ashore) {
      const path: Point[] = [];
      for (let at = i; at !== start; at = cameFrom.get(at)!) {
        path.unshift({ x: at % width, y: Math.floor(at / width) });
      }
      return path;
    }
    for (const d of FOUR) {
      const nx = x + d.x;
      const ny = y + d.y;
      const n = ny * width + nx;
      if (cameFrom.has(n) || !afloat(state, nx, ny)) continue;
      cameFrom.set(n, i);
      queue.push(n);
    }
  }
  return null;
}

/**
 * One tick of a raft: on along its way to the shore, its riders with it. There, they get off; if
 * the shore's walled (the raft's as good as land), they break the wall from the raft, as they
 * would standing on land, and get off once it's down. A raft finds its way again when the map
 * changes, and with no way at all, tries again once a second; after RAFTS.strandedSeconds it puts
 * them off wherever it can, or they break whatever's beside it.
 */
function sail(state: GameState, raft: Raft, aboard: Map<number, Enemy>): void {
  const riders = raft.riders.map((id) => aboard.get(id)).filter((e): e is Enemy => !!e && e.hp > 0);
  raft.riders = riders.map((e) => e.id);
  if (riders.length === 0) {
    raft.emptyUntil ??= state.tick + RAFTS.emptySeconds * TICK_RATE;
    return;
  }
  if (raft.boardUntil > state.tick) return; // still boarding, at the edge
  const at = { x: Math.round(raft.x), y: Math.round(raft.y) };
  const settled = raft.x === at.x && raft.y === at.y;
  const stale = raft.pathVersion !== state.gridVersion;
  const lost = raft.path.length === 0 && !raft.docked;
  if (settled && (stale || (lost && raft.stuck % TICK_RATE === 0))) {
    const way = wayToShore(state, at);
    raft.pathVersion = state.gridVersion;
    raft.path = way ?? [];
    raft.docked = way !== null && way.length === 0;
    if (way) raft.stuck = 0;
  }
  if (settled && raft.docked) {
    const shore = shoreBeside(state, mainland(state), at.x, at.y);
    if (shore.length > 0) return land(raft, riders, shore);
    besiege(state, riders, at);
  } else if (settled && raft.path.length === 0) {
    if (++raft.stuck > RAFTS.strandedSeconds * TICK_RATE) {
      const anywhere = round(
        state,
        at.x,
        at.y,
        RAFTS.raftTiles,
        (p) =>
          TERRAIN[state.terrain[p.y * state.width + p.x]].walkable && !blocksAt(state, p.x, p.y),
      );
      if (anywhere.length > 0) return land(raft, riders, anywhere);
      besiege(state, riders, at);
    }
  }
  const next = raft.path[0];
  if (next) {
    // The water might have been built over since: find the way again from here.
    if (settled && !afloat(state, next.x, next.y)) {
      raft.path = [];
      raft.pathVersion = -1;
      return;
    }
    let step = RAFTS.raftSpeed / TICK_RATE;
    const dx = next.x - raft.x;
    const dy = next.y - raft.y;
    const left = Math.hypot(dx, dy);
    if (left <= step) {
      raft.x = next.x;
      raft.y = next.y;
      raft.path = raft.path.slice(1);
      if (raft.path.length === 0) raft.pathVersion = -1; // there: see what's ashore
    } else {
      step /= left;
      raft.x += dx * step;
      raft.y += dy * step;
    }
  }
  riders.forEach((rider, k) => {
    const spot = riderSpot(raft.x, raft.y, k);
    rider.px = rider.x;
    rider.py = rider.y;
    rider.x = spot.x;
    rider.y = spot.y;
    rider.tx = Math.round(spot.x);
    rider.ty = Math.round(spot.y);
  });
}

/** The riders break what's in their way beside the raft (a wall on the shore, say). */
function besiege(state: GameState, riders: Enemy[], at: Point): void {
  const [target] = round(state, at.x, at.y, RAFTS.raftTiles, (p) => blocksAt(state, p.x, p.y))
    .map((p) => baseAt(state, p.x, p.y) ?? mountAt(state, p.x, p.y))
    .filter((s) => s !== undefined)
    .sort((a, b) => a.id - b.id);
  if (!target) return;
  for (const rider of riders) attack(state, rider, target);
}

/** The riders get off, onto the `shore` tiles round the raft, and it's done. */
function land(raft: Raft, riders: Enemy[], shore: Point[]): void {
  if (shore.length === 0) return;
  riders.forEach((rider, k) => {
    const p = shore[k % shore.length];
    rider.x = rider.tx = rider.px = p.x;
    rider.y = rider.ty = rider.py = p.y;
    rider.raft = undefined;
  });
  raft.riders = [];
}
