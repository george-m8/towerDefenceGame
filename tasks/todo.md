# Tasks: units (guards)

Spec: [`SPEC-units.md`](../SPEC-units.md) · Plan: [`plan.md`](plan.md) ("AoE update: units (guards)")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests read their numbers from config (`UNIT_KINDS`, `STRUCTURES`), never repeat them.

## Task 1: Guard kinds and buildings

`UNIT_KINDS` rows swordsman `/`, archer `)` and paladin `]` (behaviour `guard`, `chase` 3 / 0 / 0, archer `projectile: "arrow"`); `STRUCTURES` rows guardhouse `G`, archeryPost `A` and paladinHall `K`: directional spawners, quota 3, every 30 s, blocking, in the Defence tab. Until Task 3, `guard` behaves like `hold`.

- [x] Each building spawns its own guard kind, up to 3, one every 30 s, once built
- [x] They're placed facing a direction (like towers) and are in the Defence tab
- [x] Selling one leaves its guards alive with no home

Files: `src/sim/config.ts`, `src/sim/units.ts`, `src/ui/state.ts`, `src/render/palette.ts`, `tests/sim/guards.test.ts` (new). Size: M. Depends on: none.

Built: guard buildings show a facing notch like cannons, and the placing preview only highlights a target tile for traps (it had assumed every directional structure was wall spikes).

## Task 2: Guard spots

`src/sim/guards.ts`: `guardSpots(state, building)` (the open, reachable tiles of the two rows of three in front, in order: near middle, near sides, far middle, far sides) and `guardSpotOf(state, unit)` (its building's spot by age among its living guards, sharing when short; its `goal` when homeless; beside its building when no spot is open).

- [x] Facing east, spots run straight ahead, then the sides, then the far row; blocked or unreachable tiles are skipped
- [x] One open tile in front: every guard shares it
- [x] Building over a spot moves its guard to the next open spot
- [x] A homeless guard keeps its last spot

Files: `src/sim/guards.ts` (new), `tests/sim/guards.test.ts`. Size: S. Depends on: 1.

Built: a spot counts as reachable if it's within 12 steps of the building's sides; spots are cached per building and grid version. With no open spot, `guardSpotOf` returns null and the guard stays put.

## Task 3: Guard behaviour: holding a spot

`guard`: fight what's in reach, otherwise walk to its spot and stand. `walkTowards` searches again when a path runs out short of the goal (needed for moving goals in Task 4).

- [x] Guards walk to their spots in age order and stay there
- [x] A paladin never leaves its spot; a goblin stops at it and its armour cuts each hit
- [x] A guard knocked off its spot (spot built over) walks to its new one

Files: `src/sim/units.ts`, `src/sim/guards.ts`, `tests/sim/guards.test.ts`. Size: M. Depends on: 2.

Built: `Unit.path` now tells "no way there" (null: wait for the grid to change) from "walked it all" (empty: search again if not at the goal yet).

## Task 4: Swordsmen chase and return

With nothing in reach, a guard with `chase` > 0 walks to the tile next to the nearest enemy in its sight that's within `chase` tiles of its spot, then walks back when there's none.

- [x] A swordsman chases and kills an enemy within `chase` of its spot, then walks back
- [x] It ignores an enemy further than `chase` from its spot
- [x] It follows a moving target

Files: `src/sim/units.ts`, `tests/sim/guards.test.ts`. Size: S. Depends on: 3.

## Task 5: Archers shoot arrows

A unit kind with a `projectile` fires a shot effect (from it to the target, `flight` like the archer tower) with each hit, plus the hit cue; damage lands at once, as for towers.

- [x] An archer hits an enemy within `range` from its spot, with a shot effect and a hit cue
- [x] It never leaves its spot

Files: `src/sim/units.ts`, `src/sim/config.ts`, `tests/sim/guards.test.ts`. Size: S. Depends on: 3.

Built: also filled a gap the spec asked for but no task covered. In PvP, units now attack a rival's units in reach when no enemy is (until now `unit-core` only ever targeted enemies).

**Checkpoint A:** in tests, paladins hold a gap with archers behind and the goblins die there; a swordsman runs out and back. Done: the checkpoint A test and the swordsman tests in `tests/sim/guards.test.ts`.

## Task 6: Hover and drawing

Hover adds `guarding` / `fighting` / `chasing` / `returning` for guards. Glyphs and colours for the buildings and guards.

- [x] Hover words for a guard on its spot, fighting, chasing and returning
- [ ] Browser: guards walk out and hold a gap; swordsmen chase and return; arrows fly; replacements arrive (with `town-economy` checkpoint B)

Files: `src/ui/tileInfo.ts`, `src/render/palette.ts`, `tests/ui/tileInfo.test.ts`. Size: S. Depends on: 4, 5.

Built: the guard word comes from `guardActivity`, which only uses what online clients also have (positions and enemies, not paths): fighting, else chasing or returning while moving, else guarding. Glyphs and colours went in with Task 1. The browser check is still to do.

**Checkpoint B:** browser check with George.

## Task 7: Determinism, timing and docs

- [ ] The 2,000-tick determinism test gains a paladin hall and an archery post at the keep's gate
- [ ] Measured standalone: 30 guard buildings (90 guards) and 200 enemies on XL, within the tick budget; the unit test guards a loose bound
- [ ] README: guards and their buildings (structures table, a Guards section), Tuning rows; SPEC.md "Since `units`"; plan and CAPABILITIES statuses
- [ ] `src/sim/` coverage stays at 80% or more

Files: `tests/sim/game.test.ts`, `tests/sim/guards.test.ts`, `README.md`, `SPEC.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: 6.
