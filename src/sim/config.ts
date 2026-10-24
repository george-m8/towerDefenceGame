// All tunable game numbers live here.

export const GRID_WIDTH = 48;
export const GRID_HEIGHT = 32;
export const TICK_RATE = 20; // simulation ticks per second
export const FAST_FORWARD_SPEED = 2; // game-speed multiplier while fast-forwarding

export const KEEP_SIZE = 3;
export const KEEP_HP = 99;

// Spawn zone: a strip on the left edge of the map.
export const SPAWN_ZONE = { x: 0, y: 10, width: 2, height: 12 };

export const STARTING_GOLD = 250;

export interface TowerStats {
  range: number; // tiles, measured centre to centre
  minRange: number;
  damage: number;
  fireIntervalSeconds: number;
  /** Splash hits every enemy within this many tiles (Chebyshev) of the target. 0 = single target. */
  splashRadius: number;
}

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
    tower: { range: 5, minRange: 0, damage: 6, fireIntervalSeconds: 1, splashRadius: 0 },
  },
  cannon: {
    name: "Cannon",
    layer: "mount",
    cost: 50,
    maxHp: 60,
    blocksMovement: true,
    tower: { range: 4, minRange: 0, damage: 15, fireIntervalSeconds: 2.5, splashRadius: 1 },
  },
  catapult: {
    name: "Catapult",
    layer: "mount",
    cost: 80,
    maxHp: 40,
    blocksMovement: true,
    tower: { range: 9, minRange: 3, damage: 30, fireIntervalSeconds: 5, splashRadius: 2 },
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
} satisfies Record<string, StructureStats>;

/** How long shot and splash effects stay on screen. */
export const EFFECT_TICKS = 4;

export const ENEMY = {
  baseHp: 20,
  speed: 1.5, // tiles per second
  keepDamage: 5,
  structureDps: 5,
  baseBounty: 2,
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
