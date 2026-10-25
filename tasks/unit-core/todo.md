# Tasks: unit-core

Spec: [`SPEC-unit-core.md`](../../SPEC-unit-core.md) · Plan: [`plan.md`](../plan.md) ("AoE update: unit-core")

Starts once `enemy-pathing` is finished. These tasks then move to `tasks/todo.md`.

Standard verification for every task: `npm run typecheck && npm test && npm run build`

## Task 1: Unit entity, militia and hold

`UnitKind`, `UNIT_KINDS` (militia `i`), `UnitKindId` in config; `Unit` and `state.units` in types; `src/sim/units.ts` with `spawnUnit`, `damageUnit` (`max(1, damage - armour)`), `isHostileUnit`, the behaviour table with `hold`, `updateUnits` and `removeDeadUnits`; `debugUnit` command; units step before enemies in `tick`. No movement yet.

- [ ] A militia hits an adjacent enemy every `attackInterval` and ignores one 2 tiles away
- [ ] The enemy's bounty goes to the militia's owner
- [ ] Armour reduces damage, never below 1; a unit at 0 HP is gone after the tick, with no bounty paid
- [ ] `debugUnit` spawns for the sending player only on a tile a unit can stand on
- [ ] The existing suite passes untouched

Files: `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/units.ts` (new), `src/sim/game.ts`, `tests/sim/units.test.ts` (new). Size: M. Depends on: none.

## Task 2: Enemies fight units

Per-tick occupancy index (units by tile) built at the start of `updateUnits`; `unitBlocking`. In `chooseNextTile`, an enemy checks its own tile, its next tile and the four beside it for a hostile unit and attacks it instead of moving (in its way first, then lowest HP, then lowest id). Rams ignore units. Bombers damage units in their blast.

- [ ] A goblin whose next tile holds a militia stops and attacks it, and walks on once it dies
- [ ] A goblin walking past a militia on the tile beside it stops and attacks it
- [ ] A militia 2 tiles off the path is ignored
- [ ] With two militia in reach, the one in the way is hit first
- [ ] A ram walks through a militia's tile without stopping
- [ ] A bomber's blast damages a militia

Files: `src/sim/units.ts`, `src/sim/enemies.ts`, `tests/sim/enemies.test.ts`, `tests/sim/units.test.ts`. Size: M. Depends on: 1.

**Checkpoint A:** a militia and a goblin fight to the death in a test, both ways round; the existing suite passes untouched.

## Task 3: Paths and movement

`src/sim/unitPaths.ts` with `findPath(state, from, isGoal)` (breadth-first, multi-goal, capped at the tile count). Units store a path and `pathVersion`, search again when `gridVersion` changes or the next step is blocked, and move tile to tile like enemies. `UNIT_PATH_SEARCHES_PER_TICK` budget, with waiting units first in line next tick. A test-only `walkTo` behaviour.

- [ ] Shortest route round a wall; null when the goal is walled off
- [ ] Stops at the nearest of several goal tiles
- [ ] A stored path is searched again after a wall is built across it
- [ ] No more than the budget of searches run in one tick; the rest go first next tick
- [ ] A unit moves at its kind's speed and never stands on water, the keep or a blocking structure

Files: `src/sim/unitPaths.ts` (new), `src/sim/units.ts`, `src/sim/config.ts`, `tests/sim/unitPaths.test.ts` (new), `tests/sim/units.test.ts`. Size: M. Depends on: 1.

## Task 4: Spawners

`SpawnerStats` and `spawner?` on `StructureStats`; `updateSpawners` runs first in `tick`, using `cooldown` as the timer. A test-only spawner kind, injected through test config and not in `STRUCTURES`. Removing a spawner sets its units' `home` to null.

- [ ] First unit on placement, the next after exactly `intervalSeconds`
- [ ] Never more than `quota` alive; at quota, a replacement right after a death
- [ ] Spawns on the facing tile, else the next open neighbour clockwise, else waits
- [ ] Selling the spawner leaves its units alive with no home; none are replaced
- [ ] A new spawner counts from zero even with homeless units nearby

Files: `src/sim/config.ts`, `src/sim/units.ts`, `src/sim/game.ts`, `src/sim/grid.ts` (removal hook), `tests/sim/units.test.ts`. Size: M. Depends on: 3.

## Task 5: Units give fog sight

Units are sight sources for their owner's team, from their tile, with their kind's `sight`. The sight cache is invalidated when a unit changes tile (a `sightVersion` alongside `gridVersion`), not every tick.

- [ ] A militia lifts fog around it for its own team, and not for a rival in PvP
- [ ] Sight isn't recomputed on ticks where no unit changed tile
- [ ] Measured: sight rebuild on XL with 200 units, recorded in the PR

Files: `src/sim/fog.ts`, `src/sim/units.ts`, `src/sim/types.ts`, `tests/sim/fog.test.ts`. Size: S. Depends on: 1.

## Task 6: PvP towers shoot units

`findSiegeTarget` gains rival units (from the occupancy index) as targets, sorted before structures and keep tiles; splash damages rival units in the blast. Endless `findTarget` is unchanged.

- [ ] A rival archer shoots a unit in its arc before a wall in its arc
- [ ] A rival cannon's splash damages units in the blast
- [ ] Same-team units are never targeted; Endless towers never target units
- [ ] The existing tower tests pass unchanged

Files: `src/sim/towers.ts`, `tests/sim/pvp.test.ts`. Size: S. Depends on: 1.

## Task 7: Drawing, hover and the U key

Units drawn as their glyph in the owner's colour, above terrain and below effects, with an HP bar when damaged. Rival units in fog are hidden. Hover shows `Militia (i) - <owner> - HP 24/30`. `U` over a tile sends `debugUnit`.

- [ ] Browser: `U` places a militia; goblins stop for it; fog lifts; HP bars show
- [ ] Hover text matches the spec

Files: `src/render/canvas.ts`, `src/render/palette.ts`, `src/ui/tileInfo.ts`, `src/ui/input.ts`, `src/main.ts`. Size: M. Depends on: 2-6.

**Checkpoint B:** offline browser check with George.

## Task 8: Units over the network

Units in the welcome snapshot; updates carry position and HP, with kind and owner sent once per unit (as for enemies); clients smooth unit movement; `debugUnit` validated in the protocol, with the owner taken from the sender.

- [ ] Snapshot and update tests: new units carry kind and owner, later updates don't
- [ ] A client-supplied owner is ignored
- [ ] Browser: a second player sees the militia and its HP bar move smoothly

Files: `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/view.ts`, `src/net/networkSession.ts`, `tests/server/snapshot.test.ts`. Size: M. Depends on: 7.

## Task 9: Determinism, timing test and docs

- [ ] Two runs of the same seed and commands (including `debugUnit`) end in identical states
- [ ] 200 units and 200 enemies on XL: one tick under 50 ms
- [ ] README: units, the `U` dev key, hover info; CAPABILITIES and plan statuses updated
- [ ] `src/sim/` coverage stays at 80% or more

Files: `tests/sim/game.test.ts` (determinism block), `tests/sim/units.test.ts`, `README.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: 8.

**Checkpoint C:** online check with two browsers, then review.
