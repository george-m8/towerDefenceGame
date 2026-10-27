// All tunable game numbers live here.

/**
 * Map sizes players pick from when starting a game, in tiles. M is the default. `keep: "right"`
 * puts an Endless keep at the far right instead of the middle (PvP keeps don't move).
 */
export const MAP_SIZES: Record<
  "XXS" | "XS" | "S" | "M" | "L" | "XL",
  { width: number; height: number; keep?: "right" }
> = {
  XXS: { width: 42, height: 28, keep: "right" },
  XS: { width: 66, height: 44 },
  S: { width: 108, height: 72 },
  M: { width: 153, height: 102 },
  L: { width: 216, height: 144 },
  XL: { width: 270, height: 180 },
};
export type MapSize = keyof typeof MAP_SIZES;
export const DEFAULT_MAP_SIZE: MapSize = "M";

export const GRID_WIDTH = MAP_SIZES[DEFAULT_MAP_SIZE].width;
export const GRID_HEIGHT = MAP_SIZES[DEFAULT_MAP_SIZE].height;
export const TICK_RATE = 20; // simulation ticks per second
export const FAST_FORWARD_SPEED = 2; // game-speed multiplier while fast-forwarding

export const KEEP_SIZE = 3;
export const KEEP_HP = 300;
/**
 * Every keep starts walled in, this many tiles of courtyard out, with a gate facing the enemy
 * (see sim/keepWalls.ts). Only on generated maps; the blank test map starts bare.
 */
export const KEEP_WALLS = { courtyard: 1 };

// Spawn zone: a strip on the left edge of the map, centred vertically.
export const SPAWN_ZONE = { x: 0, width: 2, height: 12 };

export const STARTING_GOLD = 250;

/**
 * Building takes longer the further from your keep: no time at all right next to it, rising
 * to maxSeconds at fullDistance tiles out (counted from the keep's nearest tile) and beyond.
 */
/** The debug Damage tool: each click takes this share of the full amount off (never below 1). */
export const DEBUG_DAMAGE = 0.35;

export const BUILD_TIME = { maxSeconds: 10, fullDistance: 40 };

export interface TowerStats {
  range: number; // tiles, measured centre to centre
  minRange: number;
  damage: number;
  fireIntervalSeconds: number;
  /** Splash hits every enemy within this many tiles (Chebyshev) of the target. 0 = single target. */
  splashRadius: number;
  /** Field of fire, centred on the facing. 360 = all round. */
  arcDegrees: number;
  /** 0 = fixed: never turns, fires at anything in its arc. */
  turnDegreesPerSecond: number;
  /** What it fires, and how long a shot is seen flying before it lands (see ProjectileKind). */
  projectile: ProjectileKind;
  flightTicks: number;
}

/** What a tower's shot looks like in flight; the renderer gives each its symbol and arc. */
export type ProjectileKind = "arrow" | "ball" | "stone";

/** A turning tower fires once its aim is this close to the target. */
export const AIM_TOLERANCE_DEGREES = 5;

/** Spike traps fire on a fixed cycle from the moment they are built. */
export interface TrapStats {
  damage: number;
  fireIntervalSeconds: number;
}

export interface IncomeStats {
  gold: number;
  intervalSeconds: number;
}

export interface StructureStats {
  name: string;
  /** Base: what the tile is (walls, spikes, houses). Mount: a tower standing on ground or a wall. */
  layer: "base" | "mount";
  /** A tower can be mounted on top (walls only). */
  acceptsMount?: boolean;
  cost: number;
  maxHp: number;
  blocksMovement: boolean;
  tower?: TowerStats;
  trap?: TrapStats;
  /** Placed facing one direction (traps hit the tile they face). */
  directional?: boolean;
  income?: IncomeStats;
  /** Can only be built on rivers, and makes them walkable. */
  spansWater?: boolean;
  /** False for map features the player can't build (ruins). */
  buildable?: boolean;
  /** Gold when sold at full HP, instead of the usual share of cost. */
  salvageGold?: number;
  /**
   * Closes a ring of walls when enclosures are worked out, though enemies walk through it
   * (gates): a walled area with a gate in it still gets its discount.
   */
  enclosing?: boolean;
  /** How far it lets players see (fog of war). Towers see in the shape of their arc. */
  sight?: SightStats;
  /** Farmhouses (see sim/farms.ts). Its timer is the structure's `cooldown`, like income. */
  farm?: FarmStats;
  /** Farmland: counts for a farmhouse it's joined to; enemies trample it by their weight. */
  field?: true;
  /** Spawns units (see sim/units.ts). Its timer is the structure's `cooldown`, so a spawner
   * can't also be a tower, a trap or earn income. */
  spawner?: SpawnerStats;
}

/** A farmhouse earns for each field joined to it (touching it, or through other fields). */
export interface FarmStats {
  /** Gold per counted field, paid every intervalSeconds. */
  goldPerField: number;
  intervalSeconds: number;
  /** Most fields one farmhouse counts. */
  maxFields: number;
}

/** A building that makes units: free, one every interval, while fewer than `quota` are alive. */
export interface SpawnerStats {
  unit: UnitKindId;
  quota: number;
  intervalSeconds: number;
}

/** Sight radii in tiles, centre to centre: enemies are visible within `inner`, land within `outer`. */
export interface SightStats {
  inner: number;
  outer: number;
}

/** The keep sees furthest, measured from its nearest tile. */
export const KEEP_SIGHT: SightStats = { inner: 12, outer: 18 };
/** Every tower also sees all round this close, so it can see what's attacking it from behind. */
export const SIGHT_CLOSE_RADIUS = 1.5;

export const STRUCTURES = {
  wall: {
    name: "Wall",
    layer: "base",
    acceptsMount: true,
    cost: 5,
    maxHp: 50,
    blocksMovement: true,
    sight: { inner: 1, outer: 1.5 },
  },
  archer: {
    name: "Archer",
    layer: "mount",
    cost: 25,
    maxHp: 40,
    blocksMovement: true,
    tower: {
      range: 5,
      minRange: 0,
      damage: 6,
      fireIntervalSeconds: 1,
      splashRadius: 0,
      arcDegrees: 90, // fixed, firing through a slit
      turnDegreesPerSecond: 0,
      projectile: "arrow",
      flightTicks: 4,
    },
    sight: { inner: 6, outer: 10 },
  },
  cannon: {
    name: "Cannon",
    layer: "mount",
    cost: 50,
    maxHp: 60,
    blocksMovement: true,
    tower: {
      range: 4,
      minRange: 0,
      damage: 15,
      fireIntervalSeconds: 2.5,
      splashRadius: 1,
      arcDegrees: 360,
      turnDegreesPerSecond: 90,
      projectile: "ball",
      flightTicks: 6,
    },
    sight: { inner: 5, outer: 9 },
  },
  catapult: {
    name: "Catapult",
    layer: "mount",
    cost: 80,
    maxHp: 40,
    blocksMovement: true,
    tower: {
      range: 9,
      minRange: 3,
      damage: 30,
      fireIntervalSeconds: 5,
      splashRadius: 2,
      arcDegrees: 360,
      turnDegreesPerSecond: 30, // very slow to swing round
      projectile: "stone",
      flightTicks: 10,
    },
    sight: { inner: 10, outer: 14 },
  },
  floorSpikes: {
    name: "Floor spikes",
    layer: "base",
    cost: 15,
    maxHp: 0, // walkable and never attacked
    blocksMovement: false,
    trap: { damage: 15, fireIntervalSeconds: 1.5 },
    sight: { inner: 2, outer: 4 },
  },
  wallSpikes: {
    name: "Wall spikes",
    layer: "base",
    cost: 20,
    maxHp: 50,
    blocksMovement: true,
    directional: true,
    trap: { damage: 20, fireIntervalSeconds: 2 },
    sight: { inner: 2, outer: 4 },
  },
  house: {
    name: "House",
    layer: "base",
    cost: 40,
    maxHp: 30,
    blocksMovement: true,
    income: { gold: 2, intervalSeconds: 5 },
    sight: { inner: 3, outer: 6 },
  },
  shop: {
    name: "Shop",
    layer: "base",
    cost: 70,
    maxHp: 30,
    blocksMovement: true,
    income: { gold: 4, intervalSeconds: 5 },
    sight: { inner: 3, outer: 6 },
  },
  // Farms: a farmhouse earns for each farmland tile joined to it (see sim/farms.ts).
  farmhouse: {
    name: "Farmhouse",
    layer: "base",
    cost: 50,
    maxHp: 30,
    blocksMovement: true,
    sight: { inner: 3, outer: 6 },
    farm: { goldPerField: 1, intervalSeconds: 10, maxFields: 8 },
  },
  farmland: {
    name: "Farmland",
    layer: "base",
    cost: 3,
    maxHp: 10,
    blocksMovement: false,
    field: true,
  },
  // Gatherer buildings: free workers up to `quota`, one every `intervalSeconds` (see UNIT_KINDS).
  timberYard: {
    name: "Timber yard",
    layer: "base",
    cost: 60,
    maxHp: 40,
    blocksMovement: true,
    directional: true, // R turns which side its door is on
    sight: { inner: 3, outer: 6 },
    spawner: { unit: "lumberjack", quota: 5, intervalSeconds: 60 },
  },
  mine: {
    name: "Mine",
    layer: "base",
    cost: 100,
    maxHp: 40,
    blocksMovement: true,
    directional: true, // R turns which side its door is on
    sight: { inner: 3, outer: 6 },
    spawner: { unit: "miner", quota: 5, intervalSeconds: 60 },
  },
  foragerHut: {
    name: "Forager hut",
    layer: "base",
    cost: 40,
    maxHp: 30,
    blocksMovement: true,
    directional: true, // R turns which side its door is on
    sight: { inner: 3, outer: 6 },
    spawner: { unit: "forager", quota: 5, intervalSeconds: 60 },
  },
  bridge: {
    name: "Bridge",
    layer: "base",
    cost: 10,
    maxHp: 0, // walkable and never attacked
    blocksMovement: false,
    spansWater: true,
    sight: { inner: 2, outer: 4 },
  },
  watchtower: {
    name: "Watchtower",
    layer: "mount",
    cost: 20,
    maxHp: 30,
    blocksMovement: true,
    sight: { inner: 5, outer: 9 }, // as far as a cannon, all round; never fires
  },
  gate: {
    name: "Gate",
    layer: "base",
    cost: 15,
    maxHp: 50, // enemies walk through rather than attack it; rival towers can still hit it
    blocksMovement: false,
    enclosing: true,
    sight: { inner: 2, outer: 3 }, // a little further than a wall: you can look out through it
  },
  // Guard buildings: free guards up to `quota`, one every `intervalSeconds`, holding the tiles
  // in front of the building (its facing, set with R). See sim/guards.ts.
  guardhouse: {
    name: "Guardhouse",
    layer: "base",
    cost: 60,
    maxHp: 60,
    blocksMovement: true,
    directional: true,
    sight: { inner: 4, outer: 6 },
    spawner: { unit: "swordsman", quota: 3, intervalSeconds: 30 },
  },
  archeryPost: {
    name: "Archery post",
    layer: "base",
    cost: 70,
    maxHp: 50,
    blocksMovement: true,
    directional: true,
    sight: { inner: 4, outer: 6 },
    spawner: { unit: "archer", quota: 3, intervalSeconds: 30 },
  },
  paladinHall: {
    name: "Paladin hall",
    layer: "base",
    cost: 90,
    maxHp: 80,
    blocksMovement: true,
    directional: true,
    sight: { inner: 4, outer: 6 },
    spawner: { unit: "paladin", quota: 3, intervalSeconds: 30 },
  },
  // Offensive buildings (Offence tab): field units that go out exploring and attacking.
  scoutCamp: {
    name: "Scout camp",
    layer: "base",
    cost: 40,
    maxHp: 40,
    blocksMovement: true,
    directional: true,
    sight: { inner: 4, outer: 6 },
    spawner: { unit: "scout", quota: 2, intervalSeconds: 45 },
  },
  barracks: {
    name: "Barracks",
    layer: "base",
    cost: 80,
    maxHp: 60,
    blocksMovement: true,
    directional: true,
    sight: { inner: 4, outer: 6 },
    spawner: { unit: "soldier", quota: 4, intervalSeconds: 30 },
  },
  archeryRange: {
    name: "Archery range",
    layer: "base",
    cost: 90,
    maxHp: 50,
    blocksMovement: true,
    directional: true,
    sight: { inner: 4, outer: 6 },
    spawner: { unit: "ranger", quota: 4, intervalSeconds: 30 },
  },
  ruin: {
    name: "Ruin",
    layer: "base",
    acceptsMount: true,
    cost: 0,
    maxHp: 50,
    blocksMovement: true,
    buildable: false, // only placed by the map generator
    salvageGold: 2,
  },
} satisfies Record<string, StructureStats>;

/** How long shot and splash effects stay on screen. */
export const EFFECT_TICKS = 4;
/** How long a heal's green "+" shows. */
export const HEAL_EFFECT_TICKS = 10;
/**
 * Something destroyed stays a moment (BURST_DELAY_TICKS, with its emptied health bar), then
 * bursts apart, its pieces flying and fading for BURST_TICKS.
 */
export const BURST_DELAY_TICKS = 6;
export const BURST_TICKS = 24;

/** What a unit does each tick (see sim/units.ts). */
export type UnitBehaviourId = "hold" | "gather" | "guard" | "scout" | "attack";

/** A kind of the player's own unit. Units spawn free from their building (see SpawnerStats). */
export interface UnitKind {
  glyph: string;
  name: string;
  hp: number;
  /** Taken off every hit it takes, never below 1 damage. */
  armour: number;
  damage: number;
  attackInterval: number; // seconds between hits
  /** Reach in tiles, counting diagonals as 1 (1 = the 8 tiles around it). */
  range: number;
  speed: number; // tiles per second
  sight: SightStats;
  behaviour: UnitBehaviourId;
  /** Workers: the resources it gathers, one `attackInterval` of work per hit. */
  gathers?: ResourceTerrain[];
  /** Workers: what hover info says while it works ("chopping"). */
  working?: string;
  /** Guards: tiles from its spot it will chase an enemy (0 = never leaves its spot). */
  chase?: number;
  /** Ranged units: the projectile drawn for each shot (melee units have none). */
  projectile?: ProjectileKind;
  /**
   * Carries a torch: lights the dark round it at night (LIGHTS.torch). Soldiers and workers do;
   * stealthy units (scouts) don't, so they stay dark out in the night.
   */
  torch?: boolean;
}

export const UNIT_KINDS = {
  /** Dev only (the U key): stands where it's put and fights. Numbers are for testing. */
  militia: {
    glyph: "i",
    name: "Militia",
    torch: true,
    hp: 30,
    armour: 0,
    damage: 4,
    attackInterval: 1,
    range: 1,
    speed: 1,
    sight: { inner: 3, outer: 5 },
    behaviour: "hold",
  },
  // Guards, spawned by guard buildings: they hold the tiles in front of it (see sim/guards.ts).
  swordsman: {
    glyph: "/",
    name: "Swordsman",
    torch: true,
    hp: 60,
    armour: 1,
    damage: 8,
    attackInterval: 1,
    range: 1,
    speed: 1.3,
    sight: { inner: 4, outer: 6 },
    behaviour: "guard",
    chase: 3,
  },
  archer: {
    glyph: ")",
    name: "Archer",
    torch: true,
    hp: 35,
    armour: 0,
    damage: 6,
    attackInterval: 1.2,
    range: 4,
    speed: 1,
    sight: { inner: 5, outer: 7 },
    behaviour: "guard",
    chase: 0,
    projectile: "arrow",
  },
  paladin: {
    glyph: "]",
    name: "Paladin",
    torch: true,
    hp: 120,
    armour: 4,
    damage: 5,
    attackInterval: 1.2,
    range: 1,
    speed: 0.8,
    sight: { inner: 3, outer: 5 },
    behaviour: "guard",
    chase: 0,
  },
  // Field units, spawned by offensive buildings: they leave home and go out (see sim/fieldUnits.ts).
  scout: {
    glyph: "!",
    name: "Scout",
    hp: 20,
    armour: 0,
    damage: 0, // never fights
    attackInterval: 1,
    range: 0,
    speed: 2,
    sight: { inner: 6, outer: 9 },
    behaviour: "scout",
  },
  soldier: {
    glyph: "&",
    name: "Soldier",
    torch: true,
    hp: 70,
    armour: 2,
    damage: 10,
    attackInterval: 1,
    range: 1,
    speed: 1.2,
    sight: { inner: 4, outer: 6 },
    behaviour: "attack",
  },
  ranger: {
    glyph: "}",
    name: "Ranger",
    torch: true,
    hp: 40,
    armour: 0,
    damage: 7,
    attackInterval: 1.2,
    range: 5,
    speed: 1.1,
    sight: { inner: 5, outer: 8 },
    behaviour: "attack",
    projectile: "arrow",
  },
  // Workers, spawned by gatherer buildings. They work a resource every `attackInterval`
  // seconds (how often gold comes in); RESOURCES says what a tile pays and how long it takes.
  // `damage` is unused: workers never fight.
  lumberjack: {
    glyph: "j",
    name: "Lumberjack",
    torch: true,
    hp: 15,
    armour: 0,
    damage: 1,
    attackInterval: 3,
    range: 1,
    speed: 1.2,
    sight: { inner: 3, outer: 5 },
    behaviour: "gather",
    gathers: ["tree"],
    working: "chopping",
  },
  miner: {
    glyph: "p",
    name: "Miner",
    torch: true,
    hp: 18,
    armour: 1,
    damage: 1,
    attackInterval: 3,
    range: 1,
    speed: 1,
    sight: { inner: 3, outer: 5 },
    behaviour: "gather",
    gathers: ["rock", "goldRock"],
    working: "mining",
  },
  forager: {
    glyph: "f",
    name: "Forager",
    torch: true,
    hp: 12,
    armour: 0,
    damage: 1,
    attackInterval: 3,
    range: 1,
    speed: 1.4,
    sight: { inner: 3, outer: 5 },
    behaviour: "gather",
    gathers: ["berries"],
    working: "foraging",
  },
} satisfies Record<string, UnitKind>;

export type UnitKindId = keyof typeof UNIT_KINDS;

/** Unit kinds in order; a unit's index here is its kind on the wire. */
export const UNIT_KIND_ORDER = Object.keys(UNIT_KINDS) as UnitKindId[];

/** How long a ranged unit's shot is seen flying (an archer tower's arrow takes as long). */
export const UNIT_SHOT_FLIGHT_TICKS = 4;

/** Most unit path searches in one tick; units left waiting go first next tick. */
export const UNIT_PATH_SEARCHES_PER_TICK = 8;

export const ENEMY = {
  /** Chance (0-1) at each tile that an enemy steps to a random open neighbour instead of following the path. */
  wanderChance: 0.1,
};

/** Which tiles an enemy can cross and what each costs; one cached flow field per profile. */
export type MovementProfile = "follower" | "breacher" | "marine";

/**
 * Breachers price a blocking structure at the tiles they could have walked while breaking it:
 * 1 + ceil(HP / referenceDps x referenceSpeed). A full 50 HP wall costs 8 tiles.
 */
export const BREACH = { referenceDps: 8, referenceSpeed: 1 };

/** What marines pay to swim each kind of water (land is 1). Nobody else can enter water. */
export const MARINE_COSTS = { river: 2, sea: 4 };

/** What an enemy does on top of following its profile's field (see sim/behaviours.ts). */
export type BehaviourId = "follower" | "bomber" | "healer" | "siege" | "digger";

/** Numbers for behaviours that need them. Distances in tiles, intervals in seconds. */
export interface EnemyAbility {
  /** How far it notices a target, straight-line, ignoring fog. */
  sight?: number;
  /** Bombers: the blast reaches this many tiles each way (1 = the 3x3). Healers: heal range. */
  radius?: number;
  /** Bombers: blast damage. Healers: HP per heal. */
  amount?: number;
  /** Healers: seconds between heals. */
  interval?: number;
  /** Bombers: speed multiplier while sprinting. */
  sprint?: number;
  /** Longest walk it will take to reach a target it has noticed. */
  search?: number;
}

/** How band members keep up with their leader, by field distance in tiles. */
export const BAND = {
  /** A member waits rather than get further ahead than this. */
  maxLead: 1,
  /** Further behind than this, it hurries. */
  catchUpBehind: 4,
  catchUpSpeed: 1.3,
};

/** A version of a kind, rolled at spawn. Multipliers apply to the kind's stats. */
export interface EnemyVariant {
  name: string;
  /** How often it's rolled, relative to the kind's other variants. */
  weight: number;
  hp: number;
  speed: number;
  damage: number;
  /** Glyph size. Variants never change colour. */
  size: "small" | "normal" | "large";
}

/** Stats at wave 1, before the variant. The first variant is the standard one (all multipliers 1). */
export interface EnemyKind {
  glyph: string;
  name: string;
  /** One line for the monster journal. */
  description: string;
  /** Which tiles it can cross and what walls cost it (see BREACH). */
  profile: MovementProfile;
  behaviour: BehaviourId;
  /** How heavy it is: tramples farmland by this much a step (0 = light, harmless); knockback later. */
  weight: number;
  ability?: EnemyAbility;
  /** Band members: the kind they follow. Kind ids are strings here (an EnemyKindId would be a
   * circular type); tests/sim/config.test.ts checks they name real kinds. */
  leader?: string;
  /** Leaders: the band spawned with them (stopgap mix). */
  band?: { kind: string; min: number; max: number };
  hp: number;
  speed: number; // tiles per second
  /** Per hit, against a structure in the way or the keep. */
  damage: number;
  attackInterval: number; // seconds between hits
  bounty: number;
  /** What one costs out of a wave's threat budget (a goblin is 1). */
  threat: number;
  /** The first wave it can appear in. */
  firstWave: number;
  /** How likely it is to be drawn for a wave, relative to other kinds (stopgap mix). */
  mixWeight: number;
  variants: EnemyVariant[];
}

export const ENEMY_KINDS = {
  goblin: {
    glyph: "g",
    name: "Goblin",
    description: "Weak all round, but cheap and plentiful.",
    profile: "follower",
    behaviour: "follower",
    weight: 0,
    hp: 20,
    speed: 1.5,
    damage: 5,
    attackInterval: 1,
    bounty: 2,
    threat: 1,
    firstWave: 1,
    mixWeight: 10,
    variants: [
      { name: "grunt", weight: 6, hp: 1, speed: 1, damage: 1, size: "normal" },
      { name: "runt", weight: 3, hp: 0.7, speed: 1.15, damage: 0.8, size: "small" },
      { name: "brute", weight: 1, hp: 1.4, speed: 0.9, damage: 1.3, size: "large" },
    ],
  },
  zerg: {
    glyph: "z",
    name: "Zerg",
    description: "Tiny and cheap, comes in numbers.",
    profile: "follower",
    behaviour: "follower",
    weight: 0,
    hp: 6,
    speed: 1.8,
    damage: 2,
    attackInterval: 0.6,
    bounty: 1,
    threat: 0.4,
    firstWave: 3,
    mixWeight: 6,
    variants: [{ name: "drone", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  wolfRider: {
    glyph: "w",
    name: "Wolf rider",
    description: "Fast and fragile.",
    profile: "follower",
    behaviour: "follower",
    weight: 1,
    hp: 14,
    speed: 3,
    damage: 4,
    attackInterval: 0.8,
    bounty: 3,
    threat: 2,
    firstWave: 4,
    mixWeight: 4,
    variants: [
      { name: "raider", weight: 3, hp: 1, speed: 1, damage: 1, size: "normal" },
      { name: "scout", weight: 2, hp: 0.8, speed: 1.1, damage: 0.9, size: "small" },
    ],
  },
  barbarian: {
    glyph: "b",
    name: "Barbarian",
    description: "Quick hits, tougher than a goblin. Follows its chief.",
    profile: "follower",
    behaviour: "follower",
    weight: 1,
    leader: "barbarianChief",
    hp: 30,
    speed: 1.8,
    damage: 4,
    attackInterval: 0.6,
    bounty: 3,
    threat: 2,
    firstWave: 5,
    mixWeight: 5,
    variants: [
      { name: "raider", weight: 3, hp: 1, speed: 1, damage: 1, size: "normal" },
      { name: "berserker", weight: 1, hp: 0.8, speed: 1.1, damage: 1.4, size: "small" },
    ],
  },
  dwarf: {
    glyph: "d",
    name: "Dwarf",
    description: "Slow, with solid hits. Follows its thane.",
    profile: "breacher",
    behaviour: "follower",
    weight: 1,
    leader: "dwarfThane",
    hp: 45,
    speed: 1,
    damage: 8,
    attackInterval: 1.2,
    bounty: 4,
    threat: 3,
    firstWave: 6,
    mixWeight: 4,
    variants: [
      { name: "warrior", weight: 3, hp: 1, speed: 1, damage: 1, size: "normal" },
      { name: "miner", weight: 2, hp: 1, speed: 1, damage: 0.9, size: "small" },
      { name: "ironclad", weight: 1, hp: 1.4, speed: 0.85, damage: 1, size: "large" },
    ],
  },
  barbarianChief: {
    glyph: "B",
    name: "Barbarian chief",
    description: "Leads barbarians. Slow, but hits very fast.",
    profile: "follower",
    behaviour: "follower",
    weight: 2,
    band: { kind: "barbarian", min: 2, max: 4 },
    hp: 90,
    speed: 1.2,
    damage: 8,
    attackInterval: 0.5,
    bounty: 10,
    threat: 6,
    firstWave: 7,
    mixWeight: 1.5,
    variants: [{ name: "warlord", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  dwarfThane: {
    glyph: "D",
    name: "Dwarf thane",
    description: "Leads dwarves. A stronger dwarf.",
    profile: "breacher",
    behaviour: "follower",
    weight: 2,
    band: { kind: "dwarf", min: 2, max: 3 },
    hp: 120,
    speed: 0.9,
    damage: 14,
    attackInterval: 1.2,
    bounty: 12,
    threat: 8,
    firstWave: 9,
    mixWeight: 1,
    variants: [{ name: "thane", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  golem: {
    glyph: "G",
    name: "Golem",
    description: "Rare, slow and huge, with slow crushing hits.",
    profile: "breacher",
    behaviour: "follower",
    weight: 4,
    hp: 250,
    speed: 0.6,
    damage: 40,
    attackInterval: 3,
    bounty: 20,
    threat: 15,
    firstWave: 10,
    mixWeight: 0.5,
    variants: [
      { name: "stone", weight: 3, hp: 1, speed: 1, damage: 1, size: "normal" },
      { name: "iron", weight: 1, hp: 1.3, speed: 0.9, damage: 1.2, size: "large" },
    ],
  },
  marine: {
    glyph: "m",
    name: "Marine",
    description: "Swims rivers and the sea when that's the quicker way in.",
    profile: "marine",
    behaviour: "follower",
    weight: 1,
    hp: 25,
    speed: 1.4,
    damage: 5,
    attackInterval: 1,
    bounty: 3,
    threat: 2,
    firstWave: 7,
    mixWeight: 3,
    variants: [{ name: "raider", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  marineCaptain: {
    glyph: "M",
    name: "Marine captain",
    description: "A tougher marine, just as happy in the water.",
    profile: "marine",
    behaviour: "follower",
    weight: 2,
    hp: 60,
    speed: 1.2,
    damage: 10,
    attackInterval: 1,
    bounty: 8,
    threat: 5,
    firstWave: 11,
    mixWeight: 1,
    variants: [{ name: "captain", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  shaman: {
    glyph: "s",
    name: "Shaman",
    description: "Heals the enemies around it.",
    profile: "follower",
    behaviour: "healer",
    weight: 1,
    ability: { radius: 2.5, amount: 6, interval: 2 },
    hp: 30,
    speed: 1.2,
    damage: 3,
    attackInterval: 1,
    bounty: 6,
    threat: 4,
    firstWave: 8,
    mixWeight: 2,
    variants: [{ name: "elder", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  dwarfBomber: {
    glyph: "x",
    name: "Dwarf bomber",
    description: "Spots a wall, tower or house, runs at it and blows it up.",
    profile: "follower",
    behaviour: "bomber",
    weight: 1,
    ability: { sight: 3, radius: 1, amount: 60, sprint: 2.5, search: 6 },
    hp: 18,
    speed: 1,
    damage: 3,
    attackInterval: 1,
    bounty: 4,
    threat: 3,
    firstWave: 8,
    mixWeight: 2,
    variants: [{ name: "sapper", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  dwarfDemolisher: {
    glyph: "X",
    name: "Dwarf demolisher",
    description: "A bigger bomber with a bigger bang.",
    profile: "follower",
    behaviour: "bomber",
    weight: 2,
    ability: { sight: 3, radius: 1, amount: 120, sprint: 2.5, search: 6 },
    hp: 40,
    speed: 0.9,
    damage: 5,
    attackInterval: 1,
    bounty: 9,
    threat: 6,
    firstWave: 11,
    mixWeight: 1,
    variants: [{ name: "demolisher", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  digger: {
    glyph: "t", // for tunneller
    name: "Digger",
    description: "Digs under a nearby wall until it falls, then walks on.",
    profile: "follower",
    behaviour: "digger",
    weight: 1,
    ability: { sight: 4, search: 8 },
    hp: 20,
    speed: 1.2,
    damage: 6,
    attackInterval: 1,
    bounty: 4,
    threat: 3,
    firstWave: 9,
    mixWeight: 2,
    variants: [{ name: "tunneller", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
  batteringRam: {
    glyph: "R",
    name: "Battering ram",
    description: "Huge and slow. Smashes straight through walls.",
    profile: "breacher",
    behaviour: "siege",
    weight: 6,
    hp: 400,
    speed: 0.5,
    damage: 60,
    attackInterval: 2.5,
    bounty: 30,
    threat: 18,
    firstWave: 12,
    mixWeight: 0.5,
    variants: [{ name: "ram", weight: 1, hp: 1, speed: 1, damage: 1, size: "normal" }],
  },
} satisfies Record<string, EnemyKind>;

export type EnemyKindId = keyof typeof ENEMY_KINDS;

/** A leader's band, or undefined for kinds that don't lead one. */
export function bandOf(
  kind: EnemyKindId,
): { kind: EnemyKindId; min: number; max: number } | undefined {
  const band = (ENEMY_KINDS[kind] as EnemyKind).band;
  return band && { ...band, kind: band.kind as EnemyKindId };
}

/** Roster order; an enemy's index here is its id on the wire. */
export const ENEMY_KIND_ORDER = Object.keys(ENEMY_KINDS) as EnemyKindId[];

/**
 * The game's clock (games that use one), in hours on a 24-hour clock: the day runs from
 * `sunrise` to `sunset` in `dayMinutes` of game time, the night in `nightMinutes`. A game starts at
 * `startHour`: early evening, so in a night game the first enemies come soon.
 */
export const GAME_CLOCK = {
  sunrise: 6,
  sunset: 18,
  dayMinutes: 5,
  nightMinutes: 3,
  startHour: 17,
};

/** Night spawns: with enemies at night, waves run from `from` (early evening) until sunrise. */
export const NIGHT_SPAWNS = { from: 17 };

export const WAVES = {
  countdownSeconds: 20, // before wave 1, and after each wave finishes spawning
  spawnIntervalSeconds: 0.5,
  baseCount: 5,
  countPerWave: 3,
  hpGrowthPerWave: 0.15,
  bountyStepWaves: 5, // bounty +1 every this many waves
  earlySendGoldPerSecond: 1,
};

/** PvP: a tougher keep (towers are all that can hurt it), and gold for wrecking the rival's builds. */
export const PVP = {
  keepHp: 300,
  /** Destroying a rival structure pays this fraction of what they paid for it. */
  destroyBounty: 0.5,
  /** Keeps sit this fraction of the map's width in from the left and right edges. */
  keepInset: 0.3,
};

/** Selling refunds this fraction of cost, scaled by remaining HP. */
export const SELL_REFUND = 0.5;
/** Build discounts in enclosed areas: inside the keep's walls, and inside any other walls. */
export const ENCLOSURE_DISCOUNT = { keep: 0.5, outer: 0.25 };

export interface TerrainStats {
  name: string;
  walkable: boolean;
  /** What can be built on it: anything, only bridges, or nothing. */
  buildable: "any" | "bridgeOnly" | "none";
}

export const TERRAIN = {
  ground: { name: "Ground", walkable: true, buildable: "any" },
  ford: { name: "Ford", walkable: true, buildable: "any" },
  river: { name: "River", walkable: false, buildable: "bridgeOnly" },
  sea: { name: "Sea", walkable: false, buildable: "none" },
  rock: { name: "Rock", walkable: false, buildable: "none" },
  tree: { name: "Tree", walkable: false, buildable: "none" },
  goldRock: { name: "Gold-veined rock", walkable: false, buildable: "none" },
  berries: { name: "Berry bush", walkable: true, buildable: "none" },
} satisfies Record<string, TerrainStats>;

/**
 * What a resource tile pays and how long it takes (see sim/resources.ts). Each worker hit pays
 * the share of `worth` its work earned, so a tile pays exactly its worth over exactly `seconds`
 * of one worker's work. Tune freely: tests read these.
 */
export interface ResourceStats {
  /** Gold a tile pays in all, rolled per tile from the map seed: [least, most]. */
  worth: [number, number];
  /** Seconds one worker takes to clear a tile (more workers share it). */
  seconds: number;
  /** What it's called, for hover info. */
  word: string;
}

export const RESOURCES = {
  tree: { worth: [20, 40], seconds: 90, word: "timber" },
  rock: { worth: [30, 60], seconds: 135, word: "ore" },
  goldRock: { worth: [90, 180], seconds: 135, word: "ore" },
  berries: { worth: [15, 30], seconds: 60, word: "berries" },
} satisfies Record<string, ResourceStats>;

/** Terrain that holds a resource. */
export type ResourceTerrain = keyof typeof RESOURCES;

export const MAP_GEN = {
  maxAttempts: 20, // regenerate (deterministically) this many times before falling back to open ground
  keepClearRadius: 4, // open ground this far around the keep
  spawnClearColumns: 2, // open ground this many columns in front of the spawn zone
  coastDepth: [2, 5] as [number, number],
  riverFords: [1, 2] as [number, number],
  riverMeander: 0.35, // chance per step that the river shifts sideways
  // Counts are per 1,000 tiles so bigger maps get proportionally more.
  rockClustersPer1000: [2, 4] as [number, number],
  rockClusterSize: [2, 8] as [number, number],
  forestsPer1000: [2, 3.3] as [number, number],
  forestSize: [4, 15] as [number, number],
  ruinsPer1000: [2.6, 5.2] as [number, number],
  ruinHp: [0.4, 0.8] as [number, number], // fraction of full HP each ruin fragment starts with
  chestsPer1000: [2, 4] as [number, number],
  chestGold: [20, 60] as [number, number], // nearest the keep pays the least
  // Resources (placed last, so the rest of a seed's map never changes).
  goldVeinChance: 0.12, // share of rock tiles that are gold-veined (RESOURCES.goldRock)
  berryPatchesPer1000: [1.5, 3] as [number, number],
  berryPatchSize: [3, 8] as [number, number],
};

/** The map editor (SPEC-map-editor.md) and `.map` files. */
export const MAP_EDITOR = {
  brushSizes: [1, 3, 5],
  ruinHpSteps: [0.2, 0.4, 0.6, 0.8, 1], // a placed ruin's starting HP, as a fraction of full
  defaultRuinHp: 0.6,
  chestGold: { min: 25, max: 200, step: 25, default: 75 },
  undoSteps: 100,
  keepNearSpawnTiles: 10, // warn when a spawn tile is this close to a keep
  maxFileBytes: 2_000_000,
};

/** Gold of timber for clearing one tree with the sell tool. */
export const TREE_CLEAR_GOLD = 1;

/** How long a sound cue stays in the state: long enough to reach online clients in an update. */
export const CUE_TICKS = 10;
