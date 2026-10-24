// All tunable game numbers live here.

export const GRID_WIDTH = 48;
export const GRID_HEIGHT = 32;
export const TICK_RATE = 20; // simulation ticks per second

export const KEEP_SIZE = 3;
export const KEEP_HP = 100;

// Spawn zone: a strip on the left edge of the map.
export const SPAWN_ZONE = { x: 0, y: 10, width: 2, height: 12 };

export const STARTING_GOLD = 150;

export interface StructureStats {
  name: string;
  cost: number;
  maxHp: number;
  blocksMovement: boolean;
}

export const STRUCTURES = {
  wall: { name: "Wall", cost: 5, maxHp: 50, blocksMovement: true },
} satisfies Record<string, StructureStats>;

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
