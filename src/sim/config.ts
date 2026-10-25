// All tunable game numbers live here.

/** Map sizes players pick from when starting a game, in tiles. M is the default. */
export const MAP_SIZES = {
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

// Spawn zone: a strip on the left edge of the map, centred vertically.
export const SPAWN_ZONE = { x: 0, width: 2, height: 12 };

export const STARTING_GOLD = 250;

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
  /** How far it lets players see (fog of war). Towers see in the shape of their arc. */
  sight?: SightStats;
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
export type BehaviourId = "follower" | "bomber";

/** Numbers for behaviours that need them. Distances in tiles, intervals in seconds. */
export interface EnemyAbility {
  /** How far it notices a target, straight-line, ignoring fog. */
  sight?: number;
  /** Bombers: the blast reaches this many tiles each way (1 = the 3x3). */
  radius?: number;
  /** Bombers: blast damage. */
  amount?: number;
  /** Bombers: speed multiplier while sprinting. */
  sprint?: number;
  /** Longest walk it will take to reach a target it has noticed. */
  search?: number;
}

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
  ability?: EnemyAbility;
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
  dwarfBomber: {
    glyph: "x",
    name: "Dwarf bomber",
    description: "Spots a wall, tower or house, runs at it and blows it up.",
    profile: "follower",
    behaviour: "bomber",
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
} satisfies Record<string, EnemyKind>;

export type EnemyKindId = keyof typeof ENEMY_KINDS;

/** Roster order; an enemy's index here is its id on the wire. */
export const ENEMY_KIND_ORDER = Object.keys(ENEMY_KINDS) as EnemyKindId[];

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
} satisfies Record<string, TerrainStats>;

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
};

/** Gold of timber for clearing one tree with the sell tool. */
export const TREE_CLEAR_GOLD = 1;

/** How long a sound cue stays in the state: long enough to reach online clients in an update. */
export const CUE_TICKS = 10;
