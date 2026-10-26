# Tasks: field-units

Spec: [`SPEC-field-units.md`](../SPEC-field-units.md) · Plan: [`plan.md`](plan.md) ("AoE update: field-units")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests read their numbers from config, never repeat them.

## Task 1: No notch; doors and door markers

Remove the facing notch everywhere (built and while placing). `spawnTileOf(state, structure)` in `units.ts` is the one door rule (facing tile, else next open clockwise, else none), used by spawning and drawing. Gatherer buildings become directional. While placing a spawner, its door gets a white border (guard buildings: their guard spots too, fainter); built spawners show a faint `S` on their current door.

- [ ] `spawnTileOf` returns the facing tile, else the next open one clockwise, else null
- [ ] A timber yard placed facing west sends its lumberjacks out to the west
- [ ] Browser: no notches; door borders while placing; faint `S` on built doors, moving when the door is blocked

Files: `src/sim/units.ts`, `src/sim/config.ts`, `src/render/canvas.ts`, `src/render/palette.ts`, `tests/sim/units.test.ts`. Size: M. Depends on: none.

## Task 2: Two-letter building labels

`GLYPHS` entries for buildings that spawn or earn become the two-letter labels in the spec (`Ho`, `Sh`, `Fa`, `Ti`, `Mi`, `Fo`, `Gu`, `Ap`, `Pa`), drawn in a smaller font when two letters; the build picker uses them too.

- [ ] Every structure's label is one symbol or two letters, and the spec's table matches
- [ ] Browser: two-letter labels fit their tiles and read clearly

Files: `src/render/palette.ts`, `src/render/canvas.ts`, `src/ui/hud.ts`, `tests/render/` (labels test). Size: S. Depends on: none.

## Task 3: Explored-only and breaching paths

`findPath(state, from, isGoal, { exploredBy, breach })`: `exploredBy` keeps to tiles that team has explored; `breach: { owner, dps }` lets the search cross that owner's rivals' structures at `1 + ceil(HP / dps)` extra tiles each (Dijkstra, typed-array heap). `walkTowards` passes the options through and keys its cache by them.

- [ ] An explored-only search never crosses an unexplored tile, and is null when the goal lies beyond one
- [ ] A breaching search goes round when that's cheaper, through the weakest wall when it isn't
- [ ] Without options, searches are exactly as before (existing tests untouched)

Files: `src/sim/unitPaths.ts`, `src/sim/units.ts`, `tests/sim/unitPaths.test.ts`. Size: M. Depends on: none.

## Task 4: Buildings, unit kinds and the Offence tab

`UNIT_KINDS` scout `!`, soldier `&`, ranger `}` (projectile arrow); `STRUCTURES` scoutCamp `Sc`, barracks `Ba`, archeryRange `Ra`, directional spawners per the spec's table; their tools in the Offence tab, which is no longer greyed out. Until Tasks 5-6, scouts and attackers behave like `hold`.

- [ ] Each building spawns its own kind up to its quota, one per interval, once built
- [ ] The Offence tab lists the three and is no longer greyed out; `3` opens it

Files: `src/sim/config.ts`, `src/sim/units.ts`, `src/ui/state.ts`, `src/render/palette.ts`, `tests/sim/fieldUnits.test.ts` (new), `tests/ui/hud.test.ts`. Size: S. Depends on: none.

## Task 5: Scouts

`src/sim/fieldUnits.ts`: `isFrontier` (explored, standable, next to unexplored, for a team); `scout` behaviour: walk (explored-only) to the nearest frontier tile, then the next; with none, go home and wait; never fight.

- [ ] A scout walks to the nearest frontier and explores past it, again and again
- [ ] With nothing left to explore it walks home and waits
- [ ] It never attacks, and never steps on unexplored land

Files: `src/sim/fieldUnits.ts` (new), `src/sim/units.ts`, `tests/sim/fieldUnits.test.ts`. Size: M. Depends on: 3, 4.

## Task 6: Hunt and patrol

`attack` behaviour: fight what's in reach (rangers shoot); else walk (explored-only) to the nearest enemy (or rival unit) the team can see; else patrol to the nearest frontier.

- [ ] A soldier walks to and kills an enemy its side can see; a ranger shoots one from range
- [ ] With no enemy in sight it patrols to the frontier
- [ ] It never steps on unexplored land, and in Endless attacks nothing but enemies

Files: `src/sim/fieldUnits.ts`, `tests/sim/fieldUnits.test.ts`. Size: M. Depends on: 5.

## Task 7: PvP siege

`knownRivalKeep(state, owner)`: a rival keep with any tile the owner's team has explored. Attackers walk to it (explored-only, breaching); a rival structure on the next step is hit (the wall before a tower on it) until it falls, paying the tower bounty; next to the keep they hit the keep. Never their own side's buildings or ruins.

- [ ] Once the rival keep is explored, soldiers walk to it and damage it
- [ ] With a wall ring round it, they break the weakest wall and get in
- [ ] They hit the wall before the tower on it, and wrecking pays the owner the bounty
- [ ] They never hit their own side's buildings or ruins

Files: `src/sim/fieldUnits.ts`, `src/sim/towers.ts` (share the rival-target rule), `tests/sim/fieldUnits.test.ts`. Size: M. Depends on: 6.

**Checkpoint A:** scouts explore; soldiers hunt a visible goblin; in PvP they break the weakest wall of a ringed keep and damage the keep.

## Task 8: Hover words

Scouts: `scouting` / `waiting: nothing left to explore`. Soldiers and rangers: `fighting` / `besieging` / `hunting` / `patrolling`, worked out from what clients can see (like guards).

- [ ] Hover words for each
- [ ] Browser checkpoint B (with the open `town-economy` and `units` checks)

Files: `src/sim/fieldUnits.ts`, `src/ui/tileInfo.ts`, `tests/ui/tileInfo.test.ts`. Size: S. Depends on: 7.

**Checkpoint B:** browser check with George, PvP with two browsers.

## Task 9: Determinism, timing and docs

- [ ] The 2,000-tick determinism test gains a scout camp and a barracks; a PvP determinism run with a siege
- [ ] Timing: 20 offensive buildings (60 units) and 200 enemies on XL, median and 95th percentile as the other timing tests; measured standalone and recorded here
- [ ] README: Offence tab, scouts, soldiers, rangers, doors and labels (structures table), Tuning rows; SPEC.md "Since `field-units`"; plan and CAPABILITIES statuses
- [ ] `src/sim/` coverage stays at 80% or more

Files: `tests/sim/game.test.ts`, `tests/sim/fieldUnits.test.ts`, `README.md`, `SPEC.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: 8.
