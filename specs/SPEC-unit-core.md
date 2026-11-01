# Spec: unit-core

Status: APPROVED (2026-10-25)
Module: `unit-core` (see "AoE update" in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `enemy-kinds` ([`SPEC-enemy-kinds.md`](SPEC-enemy-kinds.md)), `tile-layers` ([`SPEC-tile-layers.md`](SPEC-tile-layers.md)) and `fog-of-war` ([`SPEC-fog-of-war.md`](SPEC-fog-of-war.md)). Taken out of the Armies `units` row.
Last updated: 2026-10-25

## Objective

The player's own people on the map. A **unit** belongs to a player and has HP, armour, an attack, a speed and sight. It finds its own way to a target and fights what its behaviour tells it to. Enemies fight back, and in PvP rival towers shoot it. A **spawner** is any building that makes units of one kind, free, one per interval, up to a quota.

This module is the shared base for three later ones. Workers (`resources`), guards (`units`) and field units (`field-units`) each become a unit kind, a behaviour and a spawner row, with no further changes to the core.

`unit-core` ships no building the player can buy. It is played and tested through a dev-only **militia** unit that stands where it's put and fights enemies within reach, plus a test-only spawner kind.

**Player-facing outcome (dev):** press `U` over open ground and a militia `i` appears there in your player colour, with an HP bar. A goblin walking into it stops and trades blows. The militia hits back, the goblin dies and its bounty goes to you. Fog lifts around the militia. If the goblin wins, the militia disappears and the goblin walks on. In PvP, a rival's archer tower shoots your militia if it stands in the tower's arc.

### Units

- Units live in `state.units`, separate from `state.enemies`. They move tile to tile exactly as enemies do: whole steps between tile centres, at their own speed, no collision with each other or with enemies.
- A unit can stand on any tile its movement allows: walkable terrain and bridges, but not blocking structures, the keep, or water.
- Each unit has an **owner** (a player) and a **home** (the spawner that made it, or none for dev units).
- **Hostility:** a unit is hostile to every enemy, and in PvP to rival players' units and structures. Units on the same team (`teamOf`) are never hostile. Endless co-op players are all one team.
- **Damage taken:** `max(1, damage - armour)`, a whole number, so HP never shows fractions.
- **Death:** a unit at 0 HP is removed at the end of the tick. Killing a unit pays no bounty.
- **Losing its home:** when a spawner is sold or destroyed, its units **live on** with `home` set to `null` and carry on with their behaviour. Nothing replaces them when they die.

### Kinds and behaviours

Unit kinds are config rows, like enemy kinds:

| Field | Meaning |
|---|---|
| `glyph`, `name` | What's drawn and shown on hover. The glyph is drawn in the owner's player colour. |
| `hp`, `armour` | Health, and flat damage reduction. |
| `damage`, `attackInterval`, `range` | Hit strength, seconds between hits, reach in tiles (1 = adjacent, Chebyshev distance). |
| `speed` | Tiles per second. |
| `sight` | `{ inner, outer }`, as for structures. |
| `behaviour` | Behaviour id: what the unit does each tick. |

A behaviour is a function `(state, unit) => void` in a behaviour table (the same pattern as the enemy behaviour table from `enemy-pathing`). `unit-core` ships one:

- **hold:** stays on its tile. Attacks the nearest hostile within `range`, enemies first, then (PvP) rival units.

The first row is **militia** `i` (dev only): HP 30, armour 0, damage 4 every 1s, range 1, speed 1, sight 3 / 5, behaviour `hold`. These numbers are for testing, not balance.

### Movement and paths

- Enemy flow fields all lead to the keep, so units need their own paths. `findPath(state, from, isGoal, profile)` runs a breadth-first search from the unit's tile and stops at the first tile where `isGoal(x, y)` holds. That makes "the nearest tile next to any tree" one search, not one search per tree.
- The path is stored on the unit. It's thrown away and searched again when `gridVersion` changes, when the target changes, or when the next step turns out to be blocked.
- **Search budget:** at most `UNIT_PATH_SEARCHES_PER_TICK` (proposed 8) searches per tick. A unit waiting for a search stands still and is first in line next tick. One search is capped at the map's tile count.
- A unit with no path to any goal stands still and searches again when the grid changes.
- Militia never move, so movement is tested through a test-only behaviour, **walkTo**, which walks to a fixed tile. It isn't in the dev roster.

### Combat both ways

- **Units hit enemies** with `damageEnemy(enemy, damage, unit.owner)`, so bounties go to the unit's owner as they do for towers.
- **Enemies fight units in their way or next to them.** Before stepping, an enemy checks its own tile, the tile it's about to step onto, and the four tiles beside it. If any holds a hostile unit, it stops and attacks that unit on its own attack timer instead of moving. The unit in its way comes first, then the one with the lowest HP, then the lowest id. When no hostile unit is in reach, it carries on along its path. Enemies don't leave their path to chase units further away. (`enemy-targeting` may change that later.)
- Bombers explode on units as they do on structures (the `enemy-pathing` bomber already damages "structures and units"). Rams ignore units, since they only attack structures. A unit standing in a ram's way doesn't stop it.
- **Towers:** in Endless, towers shoot only enemies, exactly as today. In PvP, a tower shoots rival units in its arc before rival structures and keep tiles. Within each group, today's order applies (least turning, then distance, then position). That's one extra first element in the key `findSiegeTarget` already sorts by. Splash hits rival units in the blast.

### Spawners

A structure kind becomes a spawner by adding a config row:

```ts
spawner?: { unit: UnitKindId; quota: number; intervalSeconds: number };
```

- **Free:** spawning costs nothing. The building's gold cost pays for it.
- **Quota:** at most `quota` living units whose home is this building. A new building starts its own count from zero, even if units from a sold one are still alive nearby.
- **Timer:** the first unit appears as soon as the building is finished (build time, PR #33: a construction site does nothing). After that the spawn timer counts down each tick. When it reaches 0 and the building is below quota, a unit spawns and the timer resets to `intervalSeconds`. A building at quota keeps its timer at 0, so it spawns again straight away once a unit dies.
- **Where:** on the tile the building faces if it's open, otherwise the first open neighbour going clockwise from the facing. Buildings with no facing count as facing south. If no neighbour is open, it waits and tries again next tick.
- The structure's `cooldown` field holds the spawn timer, as it does for income buildings.
- `unit-core` adds a **test-only** spawner kind in a test config, not in `STRUCTURES`, so the first real spawner is the timber yard in `resources`.

### Sight, drawing and the network

- Units give their owner's team fog sight, from their tile, with their kind's `sight`. Sight is recomputed when a unit moves to a new tile, not every tick.
- Drawn as the kind's glyph in the owner's colour, on top of terrain and below effects, with a small HP bar when damaged. Enemies in fog are hidden, and rival units in fog are hidden by the same rule.
- Hover shows `Militia (i) - George's - HP 24/30`.
- Snapshot and protocol carry units the way they carry enemies: kind and owner once per unit, then position and HP each update. Clients smooth unit movement the same way.
- **Dev:** `U` over a tile sends `debugUnit { kind, x, y }`, which spawns a unit for the sending player if it can stand there. It's allowed wherever `debugSpawn` is.

## Out of scope

- Any building the player can buy, and any unit kind besides militia: `resources`, `units`, `field-units`
- Unit commands from the player (select, move, attack-here)
- Units fighting rival units with their own behaviours (militia `hold` does fight PvP rivals in reach; offensive AI is `field-units`)
- Food costs, upkeep, healing, experience
- Line of sight for unit attacks (`line-of-sight` adds `canSee` later)
- Units in the monster journal

## Data model

```ts
// src/sim/config.ts
export type UnitBehaviourId = "hold";
export interface UnitKind {
  glyph: string;
  name: string;
  hp: number;
  armour: number;
  damage: number;
  attackInterval: number; // seconds
  range: number;          // tiles, Chebyshev
  speed: number;          // tiles per second
  sight: SightStats;
  behaviour: UnitBehaviourId;
}
export const UNIT_KINDS = { militia: { glyph: "i", /* ... */ } } satisfies Record<string, UnitKind>;
export type UnitKindId = keyof typeof UNIT_KINDS;
export interface SpawnerStats { unit: UnitKindId; quota: number; intervalSeconds: number }
export interface StructureStats { ...existing; spawner?: SpawnerStats }
export const UNIT_PATH_SEARCHES_PER_TICK = 8;

// src/sim/types.ts
export interface Unit {
  id: number;
  kind: UnitKindId;
  owner: PlayerId;
  /** The spawner that made it; null for dev units. */
  home: number | null;
  x: number; y: number;   // fractional while moving, as for enemies
  tx: number; ty: number; // tile it's moving to
  hp: number;
  maxHp: number;
  attackCooldown: number; // ticks
  /** Remaining steps, and the gridVersion they were found for. */
  path: Point[] | null;
  pathVersion: number;
}
export interface GameState { ...existing; units: Unit[] }
export type Command = ...existing | { type: "debugUnit"; kind: UnitKindId; x: number; y: number };

// src/sim/units.ts
export function spawnUnit(state: GameState, kind: UnitKindId, owner: PlayerId, x: number, y: number, home?: number): Unit | null;
export function damageUnit(state: GameState, unit: Unit, amount: number): void;
export function isHostileUnit(state: GameState, unit: Unit, player: PlayerId | null): boolean;
export function unitBlocking(state: GameState, x: number, y: number): Unit | undefined; // for enemies
export function updateUnits(state: GameState): void;    // behaviours, movement, path budget
export function updateSpawners(state: GameState): void;
export function removeDeadUnits(state: GameState): void;

// src/sim/unitPaths.ts
export function findPath(
  state: GameState,
  from: Point,
  isGoal: (x: number, y: number) => boolean,
): Point[] | null;
```

**Tick order** (in `tick`): spawners -> units -> enemies -> towers -> traps -> bounties and dead units. Units act before enemies, so a unit that steps in front of an enemy blocks it in the same tick.

**Occupancy:** `unitBlocking` and target searches use a per-tick index of units by tile (built at the start of `updateUnits`), so enemies don't scan every unit. This is the "occupancy index" from the Armies plan's risk table.

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/config.ts`: `UNIT_KINDS`, `SpawnerStats`, budget constant
- `src/sim/types.ts`: `Unit`, `units` on the state, `debugUnit`
- `src/sim/units.ts` (new): spawning, damage, hostility, behaviours, spawners, occupancy index
- `src/sim/unitPaths.ts` (new): `findPath`
- `src/sim/enemies.ts`: stop and fight a blocking unit
- `src/sim/towers.ts`: PvP towers target rival units
- `src/sim/fog.ts`: units as sight sources; sight invalidated when a unit changes tile
- `src/sim/game.ts`: tick order, `debugUnit`; removing a spawner clears its units' `home`
- `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/view.ts`, `src/net/networkSession.ts`: units in welcome and updates, smoothing
- `src/render/canvas.ts`, `src/ui/tileInfo.ts`, `src/ui/input.ts`: drawing, hover, `U`
- Tests: `tests/sim/units.test.ts`, `tests/sim/unitPaths.test.ts`, additions to `enemies`, `towers`, `fog`, `snapshot` tests

## Code style

Same shape as `enemies.ts`: plain data, small functions, a behaviour table.

```ts
const BEHAVIOURS: Record<UnitBehaviourId, (state: GameState, unit: Unit) => void> = {
  hold: (state, unit) => attackNearestHostile(state, unit),
};

function attackNearestHostile(state: GameState, unit: Unit) {
  if (unit.attackCooldown > 0) return;
  const kind = UNIT_KINDS[unit.kind];
  const enemy = nearestEnemyWithin(state, unit, kind.range);
  if (!enemy) return;
  damageEnemy(enemy, kind.damage, unit.owner);
  unit.attackCooldown = kind.attackInterval * TICK_RATE;
}
```

## Testing strategy

Vitest, written before each change, on blank maps with fog off unless a test is about fog:

- **Damage:** armour reduces damage, never below 1; a unit at 0 HP is gone after the tick; no bounty for killing one.
- **Hold:** a militia hits an adjacent enemy on its interval; ignores one 2 tiles away; the bounty goes to its owner.
- **Blocking:** a goblin whose next tile holds a militia stops and attacks it; one walking past a militia on the next tile to the side stops and attacks it too; once the militia dies it walks on; a goblin with a militia 2 tiles off its path doesn't turn aside; with two militia in reach it hits the one in its way first; a ram walks through a militia's tile without stopping.
- **Paths:** `findPath` finds the shortest route round a wall; returns null when the goal is walled off; stops at the nearest of several goal tiles; a stored path is searched again after a wall is built across it; no more than the budget of searches run in one tick.
- **Spawners:** first unit on placement; next after exactly `intervalSeconds`; never more than `quota` alive; a replacement right away after a death at quota; spawns on the facing tile, else the next open neighbour clockwise, else waits; selling the spawner leaves its units alive with no home, and none are replaced.
- **Towers:** in PvP, a rival archer shoots a unit in its arc before a wall in its arc; splash damages rival units in the blast. Endless towers never target units, and the existing tower tests pass unchanged. Same-team units are never hostile.
- **Fog:** a militia lifts fog around it for its owner's team only.
- **Network:** units appear in the welcome snapshot; updates carry position and HP; kind and owner are sent once.
- **Determinism:** two runs of the same seed with the same commands (including `debugUnit`) end in identical states.
- **Performance:** 200 units and 200 enemies on an XL map: one tick stays under 50 ms.

Browser checks: `U` places a militia; a goblin stops at it and they fight; fog lifts; online, a second player sees the militia and its HP bar move smoothly. Coverage for `src/sim/` stays at 80% or more.

## Boundaries

- **Always:** keep unit kinds, behaviours and spawners as config rows; reuse `damageEnemy` and `damageStructure`; keep the sim deterministic (RNG only through `state.rngState`); update README (`U` dev key, units) and the hover docs.
- **Ask first:** player commands for units; letting enemies leave their path to chase units; changing tower targeting in Endless; any player-buyable building.
- **Never:** search paths without a budget; let a client choose a unit's owner (the server assigns it from the sender); pay bounties for units.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Many units searching paths at once (5 workers x many gatherers) | Tick over budget | Per-tick search budget; one search for the nearest of many goals; 200-unit timing test |
| Sight recomputed too often now that sight sources move | Slow frames on big maps | Invalidate only when a unit changes tile; cache per team as today |
| Units make `tick` order matter more | Subtle one-tick bugs | Fixed tick order written down above and tested |
| PvP tower targeting gets two target types | Regressions in siege rules | Existing PvP tower tests must pass unchanged; new tests only add units |

## Success criteria

1. A dev militia fights an adjacent enemy, the enemy stops for it, and bounties go to the militia's owner.
2. Units die at 0 HP, give fog sight to their team, and show online with smooth movement.
3. `findPath` and the test spawner meet every behaviour in the testing list, including the budget and quota rules.
4. In PvP, rival towers shoot units; in Endless, towers ignore them.
5. The 200 + 200 timing test passes, and the existing suite passes unchanged.
6. `npm run typecheck`, `npm test` and `npm run build` pass.

## Open questions

None.

## Resolved decisions (2026-10-25)

1. Units outlive their spawner: they keep going with no home and aren't replaced.
2. Enemies fight a unit in their way or right next to them.
3. PvP towers shoot rival units before structures. Endless targeting is unchanged. (A "shoot whatever is hitting the keep first" rule was considered and dropped.)
4. Militia glyph `i`.
