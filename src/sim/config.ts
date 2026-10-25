// All tunable game numbers live here.

export const GRID_WIDTH = 153;
export const GRID_HEIGHT = 102;
export const TICK_RATE = 20; // simulation ticks per second
export const FAST_FORWARD_SPEED = 2; // game-speed multiplier while fast-forwarding

export const KEEP_SIZE = 3;
export const KEEP_HP = 99;

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
}

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
}

export const STRUCTURES = {
  wall: {
    name: "Wall",
    layer: "base",
    acceptsMount: true,
    cost: 5,
    maxHp: 50,
    blocksMovement: true,
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
    },
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
    },
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
    },
  },
  floorSpikes: {
    name: "Floor spikes",
    layer: "base",
    cost: 15,
    maxHp: 0, // walkable and never attacked
    blocksMovement: false,
    trap: { damage: 15, fireIntervalSeconds: 1.5 },
  },
  wallSpikes: {
    name: "Wall spikes",
    layer: "base",
    cost: 20,
    maxHp: 50,
    blocksMovement: true,
    directional: true,
    trap: { damage: 20, fireIntervalSeconds: 2 },
  },
  house: {
    name: "House",
    layer: "base",
    cost: 40,
    maxHp: 30,
    blocksMovement: true,
    income: { gold: 2, intervalSeconds: 5 },
  },
  bridge: {
    name: "Bridge",
    layer: "base",
    cost: 10,
    maxHp: 0, // walkable and never attacked
    blocksMovement: false,
    spansWater: true,
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
  baseHp: 20,
  speed: 1.5, // tiles per second
  keepDamage: 5,
  structureDps: 5,
  baseBounty: 2,
  /** Chance (0-1) at each tile that an enemy steps to a random open neighbour instead of following the path. */
  wanderChance: 0.1,
};

export const WAVES = {
  countdownSeconds: 20, // before wave 1, and after each wave finishes spawning
  spawnIntervalSeconds: 0.5,
  baseCount: 5,
  countPerWave: 3,
  hpGrowthPerWave: 0.15,
  bountyStepWaves: 5, // bounty +1 every this many waves
  earlySendGoldPerSecond: 1,
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
