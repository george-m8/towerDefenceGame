import type {
  EnemyKindId,
  MovementProfile,
  ProjectileKind,
  STRUCTURES,
  TERRAIN,
  UnitKindId,
} from "./config";

export interface Point {
  x: number;
  y: number;
}

export type StructureKind = keyof typeof STRUCTURES;

export type Facing = "N" | "E" | "S" | "W";

/** Per kind, the most of it a player can have at once; a missing kind has no limit. */
export type BuildLimits = Partial<Record<StructureKind, number>>;

export type PlayerId = number;

/** Natural ground type under any structures. */
export type Terrain = keyof typeof TERRAIN;

export interface Player {
  id: PlayerId;
  name: string;
  gold: number;
  /** False while dropped out; they keep their gold and structures. */
  connected: boolean;
  votes: { pause: boolean; fastForward: boolean; skipToNight: boolean };
  /** Defenders build; raiders control enemies (see sim/raiders.ts). */
  role: Role;
  /** Raiders only: the enemy they're in, and how they get the next one. */
  raid: RaiderState | null;
}

export type Role = "defender" | "raider";

export interface RaiderState {
  /** The enemy they control; null while waiting for one. */
  enemyId: number | null;
  /** The enemy they last let go of, which a switch skips. */
  leftId: number | null;
  /** Ticks until they take the nearest enemy, after theirs died. */
  respawnIn: number;
  /** Where their enemy last was, to find the nearest one from when it dies. */
  lastAt: Point | null;
  /**
   * Their enemy's plan: where it's going or what it's acting on now, then its pathing flags.
   * The next enemy carries on with it after a death; raiders' screens draw it.
   */
  plan: Aim[];
  /** The kind they last chose in the raider menu: they keep being one while there are any. */
  kind: EnemyKindId | null;
  /**
   * Set while they're in another kind because none of theirs was free: enemies with an id from
   * this one on have spawned since, and the first of their kind among them becomes them.
   */
  waitingFrom: number | null;
}

/** What a raider told their enemy to act on. */
export type RaidOrder =
  | { kind: "structure"; id: number }
  | { kind: "unit"; id: number }
  | { kind: "keep"; index: number }
  | { kind: "self" };

/**
 * Where a raider sent their enemy, or one of its pathing flags: walk to (x, y), or walk up to
 * what's there and act on it.
 */
export interface Aim {
  x: number;
  y: number;
  order: RaidOrder | null;
}

/** How a controlled enemy or a roamer is getting about, instead of its flow field. */
export interface Steering {
  /** Who's steering: a raider (their enemy, or one they've left still on its way), or roaming. */
  by: "raider" | "roam";
  /** The tile it's heading for; null stands still. */
  goal: Point | null;
  /** What to walk up to and act on (wins over `goal`). */
  order: RaidOrder | null;
  /** The tile it was sent to (for an order, where its target was when given). */
  aimAt: Point | null;
  /** Pathing flags still to do, in order, once the goal or order is done. */
  queue: Aim[];
  /** Controlled bombers: the sprint button is held. */
  sprinting: boolean;
  /** Steps still to walk, searched for `pathKey` from tile index `searchedFrom`. */
  path: Point[] | null;
  pathKey: string;
  searchedFrom: number;
  /** Roamers: ticks to stand before heading off again. */
  pause: number;
}

export interface Structure {
  id: number;
  kind: StructureKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Ticks until a tower can fire again. */
  cooldown: number;
  /** Towers and directional traps (wall spikes). */
  facing?: Facing;
  /** Current aim in degrees, for towers that turn. */
  aim?: number;
  /** Who built it; null for neutral map structures (ruins). */
  owner: PlayerId | null;
  /** What was paid for it (after any enclosure discount); refunds are based on this. */
  paid?: number;
  /**
   * Ticks of building left; 0 or absent once it's built. Until then it does nothing: see
   * sim/building.ts.
   */
  buildLeft?: number;
  /** How many ticks building it took in all, for showing progress. */
  buildTicks?: number;
  /**
   * From a `.map` file: the keep (index into `keeps`) it belongs to. Its owner is that keep's
   * player, set when the keeps are handed out.
   */
  keep?: number;
}

export interface Enemy {
  id: number;
  /** Position in tile coordinates; fractional while moving between tiles. */
  x: number;
  y: number;
  /** The tile it is currently moving to. */
  tx: number;
  ty: number;
  /** The tile it last left, so it doesn't step straight back onto it. */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  bounty: number;
  kind: EnemyKindId;
  /** Index into the kind's variants. */
  variant: number;
  /** Stats resolved at spawn (kind x variant x wave), never looked up again. */
  speed: number; // tiles per second
  damage: number; // per hit
  attackInterval: number; // ticks between hits
  /** The player whose structure struck the killing blow, once hp <= 0. */
  killedBy: PlayerId | null;
  /** Ticks until it can hit a blocking structure again. */
  attackCooldown: number;
  /** Ticks until its behaviour's ability (a heal, a dig) is ready again. */
  abilityCooldown: number;
  /** What it's doing beyond walking its field. */
  mode: "walking" | "sprinting" | "digging";
  /** The structure a bomber or digger is heading for or digging under. */
  targetId: number | null;
  /** Band members: the leader they follow, until it dies. */
  leaderId: number | null;
  /** The raider controlling it; null while it acts on its own. */
  controller: PlayerId | null;
  /** A goblin roaming the map in a game with raiders, outside the waves. */
  roamer: boolean;
  /** Controlled enemies, ones left on their way and roamers; null for enemies walking their field. */
  steer: Steering | null;
  /** It has walked a raiders' path to its end: it keeps to its own field from then on. */
  pathDone: boolean;
  /** Journey home: what it remembers of its swarm and the camp (see sim/journey.ts). */
  journey?: JourneyMind;
}

/** A Journey home enemy's mind. */
export interface JourneyMind {
  /** Where its swarm idles, or null for a wandering goblin. */
  post: Point | null;
  /** Its swarm (all wake together); 0 for a wanderer. */
  swarm: number;
  /** Ticks it keeps chasing the camp for after last seeing it (0: idle). */
  alert: number;
  /** Its HP when last checked: less now means it was hurt, which wakes it. */
  hp: number;
}

/** Journey home: the camp's travels and the keep it's heading for. */
export interface Journey {
  /** The keep at journey's end: where the camp must get to (top-left tile, KEEP_SIZE square). */
  home: Point;
  /** Camped (it can build), packing up, on the move, or setting up again. */
  phase: "camped" | "packing" | "moving" | "unpacking";
  /** Ticks left packing or setting up. */
  timer: number;
  /** Where it's going, and the tiles still to cross to get there. */
  goal: Point | null;
  path: Point[];
  /** How far it is across to the next tile of its path (0 to 1). */
  progress: number;
  /** Ticks until another wandering goblin may appear. */
  wandererTimer: number;
}

/** No looking back: the king's walk home ahead of the lava (see sim/flood.ts). */
export interface Flood {
  /** The tile the king stands on, and how far he is across to the next (0 to 1). */
  king: Point;
  progress: number;
  /** Whose king he is: the fog he lifts is theirs. */
  owner: PlayerId;
  /** His flags, in the order he'll walk to them (as a raider's plan), and his way to the first. */
  plan: Point[];
  path: Point[];
  /** How far in from the left the lava has come, in tiles, on average (see lavaEdge). */
  front: number;
  /** The tiles beside the lava not yet under (tile indices): where it spreads to next. */
  edge: number[];
  /** Columns the world has moved on by (see shiftWorld), and the column he started on. */
  shifted: number;
  startX: number;
  /** The new land still to come in on the right, a column at a time (see shiftWorld). */
  land: Land | null;
}

/** A piece of new land for No looking back, generated whole and handed out a column at a time. */
export interface Land {
  /** Its size across, and the next of its columns to come in. */
  width: number;
  next: number;
  /** Per tile (index y * width + x), as GameState's layers. */
  terrain: Terrain[];
  resources: number[];
  worth: number[];
  /** Its ruins and chests, placed as their columns come in. */
  ruins: { x: number; y: number; hpFraction: number }[];
  chests: { x: number; y: number; gold: number }[];
}

/** One of a player's own units (see sim/units.ts). Moves tile to tile like an enemy. */
export interface Unit {
  id: number;
  kind: UnitKindId;
  owner: PlayerId;
  /** The building that spawned it; null for dev units or once that building is gone. */
  home: number | null;
  /** Position in tile coordinates; fractional while moving between tiles. */
  x: number;
  y: number;
  /** The tile it is moving to. */
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  /** Ticks until it can hit again. */
  attackCooldown: number;
  /** A tile it's told to go to and hold (guard spots); null stays where it is. */
  goal: Point | null;
  /**
   * Steps still to walk, for `pathGoal` and the grid as it was at `pathVersion`. Null: no way
   * there (wait for the grid to change); empty: walked it all (search again if not there).
   */
  path: Point[] | null;
  pathGoal: string | null;
  pathVersion: number;
  /** The exploredVersion of that search (paths over explored land go stale as more is explored). */
  pathExplored: number;
  /** PvP: the exploredVersion at which no explored way to the rival keep was found (-1: none). */
  siegeBlockedAt: number;
  /** It needs a path but the tick's search budget ran out: it goes first next tick. */
  waitingForPath: boolean;
}

/** Short-lived visual events recorded by the simulation for the renderer. */
export type Effect =
  | {
      kind: "shot";
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      ttl: number;
      /**
       * Drawn as this projectile flying along an arc for `flight` ticks (ttl counts down from
       * it). Only how it looks: the damage is done when the tower fires.
       */
      projectile: ProjectileKind;
      flight: number;
    }
  | { kind: "splash"; x: number; y: number; radius: number; ttl: number }
  | { kind: "spikes"; x: number; y: number; ttl: number }
  | { kind: "heal"; x: number; y: number; ttl: number }
  /** Where a raider's enemy died: a small flag in their colour, the only sign it was them. */
  | { kind: "flag"; x: number; y: number; owner: PlayerId; ttl: number }
  /**
   * Something destroyed: an enemy or unit killed, or a structure broken. Drawn still there for
   * BURST_DELAY_TICKS, then as its pixels flying apart and fading for BURST_TICKS.
   */
  | {
      kind: "burst";
      x: number;
      y: number;
      ttl: number;
      enemy?: EnemyKindId;
      structure?: StructureKind;
      /** A unit, drawn in its owner's colour. */
      unit?: UnitKindId;
      owner?: PlayerId;
    };

/** Things lying on the map that aren't terrain or structures. `resources` adds deposits and animals. */
export type MapFeature = { kind: "chest"; x: number; y: number; gold: number };

/** Game events that make a sound. The audio layer adds UI-only sounds on top. */
export type SimCueKind =
  "enemyHit" | "keepHit" | "treasure" | "splash" | "explosion" | "waveStart" | "gameOver";

export interface SoundCue {
  id: number;
  kind: SimCueKind;
  ttl: number;
}

export interface FlowField {
  /** gridVersion this field was computed for. */
  version: number;
  /** Cost to reach the keep from each tile (0 on the keep). */
  dist: number[];
}

/** The time of day: `hour` from 0 to 24, and the day it is (1 on the first, up at each sunrise). */
export interface Clock {
  hour: number;
  day: number;
}

export interface WaveState {
  /** Waves started so far (0 before the first wave). */
  number: number;
  /** Threat budget of the current wave still to spend; 0 once it has finished spawning. */
  threatLeft: number;
  /** Ticks until the next spawn while spawning. */
  spawnTimer: number;
  /** Ticks until the next wave, once spawning has finished. */
  countdown: number;
}

/**
 * Endless: hold one shared keep against waves. PvP: two players, a keep each, no waves.
 * Journey home: move your camp across the map to the keep (solo; see sim/journey.ts).
 * No looking back (flood): walk the king as far as he can ahead of the lava (solo; see sim/flood.ts).
 */
export type GameMode = "endless" | "pvp" | "journey" | "flood";

/** When enemies come (Endless): all the time, as ever, or only at night (with a clock). */
export type EnemiesCome = "always" | "night";

/**
 * Test options, from the Debug menu: keeps that take no damage, and gold that never runs out
 * (builds are free).
 */
export type DebugOption = "infiniteKeep" | "infiniteGold";

export interface Keep {
  x: number; // top-left tile
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  /** Whose keep it is in PvP; null for the shared keep in Endless (or before PvP starts). */
  owner: PlayerId | null;
}

export interface GameState {
  /** The seed this game was created from (map and waves). */
  seed: number;
  width: number;
  height: number;
  // Per-tile layers, index = y * width + x. Read them through the grid.ts helpers only.
  terrain: Terrain[];
  /** Ticks of work left on each tile's resource (0 = none); see sim/resources.ts. */
  resources: number[];
  /** Gold each tile's resource pays in all. */
  resourceWorth: number[];
  /** What the tile is: EMPTY, KEEP_TILE, or a base structure id. */
  base: number[];
  /** A tower standing on the tile: EMPTY or a mount structure id. */
  mount: number[];
  structures: Record<number, Structure>;
  nextId: number;
  /** Incremented whenever tile occupancy changes, so pathfinding can recompute lazily. */
  gridVersion: number;
  /** Incremented whenever a unit spawns, dies or moves to another tile, so sight is redone. */
  sightVersion: number;
  /** Incremented whenever a team explores a tile it hadn't, so explored-only paths are redone. */
  exploredVersion: number;
  /** Flow fields per movement profile, built lazily. */
  flows: Partial<Record<MovementProfile, FlowField>>;
  enemies: Enemy[];
  units: Unit[];
  features: MapFeature[];
  effects: Effect[];
  /** Audible events for the audio layer; see sim/cues.ts. */
  cues: SoundCue[];
  nextCueId: number;
  spawnTiles: Point[];
  mode: GameMode;
  /** One shared keep in Endless; one per player in PvP. */
  keeps: Keep[];
  /** PvP: who won, once the game is over. */
  winner: PlayerId | null;
  wave: WaveState;
  /** The time of day, in games that use it (night spawns); null otherwise. See sim/clock.ts. */
  clock: Clock | null;
  /** When enemies come: all the time, or only at night (waves only in spawning time). */
  enemiesCome: EnemiesCome;
  players: Record<PlayerId, Player>;
  nextPlayerId: PlayerId;
  tick: number;
  /** Derived from votes by updateVotes; never set directly. */
  paused: boolean;
  /** Game-speed multiplier: 1 normally, FAST_FORWARD_SPEED while fast-forwarding. Derived from votes. */
  speed: number;
  /** Chance (0-1) at each tile that an enemy wanders off the path. Starts at ENEMY.wanderChance. */
  wanderChance: number;
  /** Games with raiders: ticks until another roaming goblin may spawn. */
  roamerTimer: number;
  /**
   * Tiles the raiders painted as paths (tile indices): free wave enemies keep to them, on their
   * usual flow, to their end nearest the keep. Replaced, never changed in place, when painted.
   */
  raidPaths: number[];
  gameOver: boolean;
  /**
   * A campaign level's last wave: no wave starts after it, and once it has all come and been
   * beaten with the keep still standing, the level is won. Null in other games (waves go on).
   */
  lastWave: number | null;
  /** Whether the level was won (the game is over, the keep standing): see lastWave. */
  won: boolean;
  rngState: number;
  /** False turns fog of war off: every tile is in sight. */
  fog: boolean;
  /** Journey home's camp and home; null in other modes. The camp itself is keeps[0]. */
  journey: Journey | null;
  /** No looking back's king, his flags and the lava; null in other modes. There's no keep. */
  flood: Flood | null;
  /** Debug options (offline only), all off to start with. */
  debug: Record<DebugOption, boolean>;
  /** From an `.items` file: the most of each kind a player can have at once (none: no limit). */
  limits: BuildLimits;
  /**
   * Per tile, one bit per team that has seen it (it stays seen). Endless has one team (bit 0,
   * value 1); in PvP each player is their own team. See sim/fog.ts.
   */
  explored: number[];
}

export type Command =
  | { type: "togglePause" }
  | { type: "toggleFastForward" }
  | { type: "build"; kind: StructureKind; x: number; y: number; facing?: Facing }
  /** Dev only: spawn enemies at random spawn tiles. */
  | { type: "debugSpawn"; count: number; kind?: EnemyKindId }
  /** Dev only (offline): turns a debug option on or off. */
  | { type: "debugOption"; option: DebugOption; on: boolean }
  /** Dev only (offline): turns fog of war on or off. */
  | { type: "debugFog"; on: boolean }
  /** Dev only (offline): a unit for the sender on (x, y). */
  | { type: "debugUnit"; kind: UnitKindId; x: number; y: number }
  /** Dev only (offline): knocks DEBUG_DAMAGE of its full amount off the top thing on (x, y). */
  | { type: "debugDamage"; x: number; y: number }
  /** Dev only (offline): sets the game's clock to an hour (games with a clock). */
  | { type: "debugClock"; hour: number }
  /** Dev only (offline): wins a campaign level on the spot, with the keep as it is. */
  | { type: "debugWin" }
  /** Dev only (offline): plays the sender as a defender or a raider ("Play as enemy"). */
  | { type: "debugRole"; role: Role }
  /** Raiders: head for a tile; with `queue`, add it as a pathing flag after the others. */
  | { type: "steer"; x: number; y: number; queue?: true }
  /**
   * Raiders: act on what's on a tile (attack, blow up, dig), or steer there if nothing is; with
   * `queue`, as a pathing flag after the others.
   */
  | { type: "interact"; x: number; y: number; queue?: true }
  /** Raiders: stop, dropping their enemy's pathing flags, and stand. */
  | { type: "stopInteract" }
  /** Raiders: paint a tile of path for the free enemies, or with `erase`, rub one out. */
  | { type: "paintPath"; x: number; y: number; erase?: true }
  /** Raiders: rub out all the paths. */
  | { type: "clearPaths" }
  /** Raiders: hold or let go of sprint (bombers). */
  | { type: "sprint"; on: boolean }
  /** Raiders: jump into a random other enemy, of `kind` if given (the raider menu). */
  | { type: "switchEnemy"; kind?: EnemyKindId }
  | { type: "sendWave" }
  /** Votes to skip the rest of the day to the early evening (games with enemies at night). */
  | { type: "voteSkipToNight" }
  | { type: "sell"; x: number; y: number }
  /** Journey home: pack up the camp and move it to a tile in sight. */
  | { type: "moveCamp"; x: number; y: number }
  /** No looking back: a flag for the king to walk to, or (`queue`) one after his others. */
  | { type: "planKing"; x: number; y: number; queue?: true };

/** Commands for testing: offline only, refused online. */
export type DebugCommand = Extract<
  Command,
  {
    type:
      | "debugSpawn"
      | "debugOption"
      | "debugFog"
      | "debugUnit"
      | "debugDamage"
      | "debugClock"
      | "debugWin"
      | "debugRole";
  }
>;

export function isDebugCommand(command: Command): command is DebugCommand {
  return (
    command.type === "debugSpawn" ||
    command.type === "debugOption" ||
    command.type === "debugFog" ||
    command.type === "debugUnit" ||
    command.type === "debugClock" ||
    command.type === "debugDamage" ||
    command.type === "debugWin" ||
    command.type === "debugRole"
  );
}

export type CommandResult = { ok: true } | { ok: false; reason: string };
