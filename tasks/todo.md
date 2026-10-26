# Tasks: field-units

Spec: [`SPEC-field-units.md`](../SPEC-field-units.md) · Plan: [`plan.md`](plan.md) ("AoE update: field-units")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests read their numbers from config, never repeat them.

## Task 1: No notch; doors and door markers

Remove the facing notch everywhere (built and while placing). `spawnTileOf(state, structure)` in `units.ts` is the one door rule (facing tile, else next open clockwise, else none), used by spawning and drawing. Gatherer buildings become directional. While placing a spawner, its door gets a white border (guard buildings: their guard spots too, fainter); built spawners show a faint `S` on their current door.

- [x] `spawnTileOf` returns the facing tile, else the next open one clockwise, else null
- [x] A timber yard placed facing west sends its lumberjacks out to the west
- [ ] Browser: no notches; door borders while placing; faint `S` on built doors, moving when the door is blocked

Files: `src/sim/units.ts`, `src/sim/config.ts`, `src/render/canvas.ts`, `src/render/palette.ts`, `tests/sim/units.test.ts`. Size: M. Depends on: none.

Built: the notch code is gone (`needsNotch`, `drawFacingNotch`, its constants and colour). `guardSpotsFor` works out a not-yet-placed building's guard spots for the preview. The faint `S` only shows where the viewer has explored. The browser check is still to do.

## Task 2: Building symbols and the digger's glyph

Per the spec's table: the keep's tiles draw `⛫` (the middle still shows HP), houses `⌂`, farmland `𐤄`, shop `¤`, guardhouse `⛨`, paladin hall `✠`, archery post `➶`, scout camp `⚑`, archery range `◎`; two-letter codes as the last resort (`Fa`, `Ti`, `Mi`, `Fo`, `Ba`), drawn smaller. The digger enemy's glyph changes from `n` to `t` (README enemy table and journal follow, since they read config). The glyph font list gains symbol-font fallbacks. The build picker uses the same.

- [x] The digger is `t`, and no two enemy kinds share a glyph
- [x] Every structure's glyph is one symbol or a two-letter code, matching the spec's table and [`GLYPHS.md`](../GLYPHS.md) (planned marks there become current)
- [x] None of the symbols is an emoji-capable code point (a test lists the ones to avoid)
- [ ] Browser: every symbol draws as a plain glyph (no boxes, no colour emoji) on this Mac; any that doesn't falls back to its code, recorded here

Files: `src/render/palette.ts`, `src/render/canvas.ts`, `src/ui/hud.ts`, `src/sim/config.ts` (digger), `tests/render/` (glyphs test), `tests/sim/behaviours.test.ts`, `README.md`, `GLYPHS.md`. Size: S. Depends on: none.

Built: the emoji check is Unicode's `Emoji` property, which every symbol to avoid (⚔ ⚒ ⛏ ⚖ ⛺) has and none of the picks do. Two-letter codes draw in a smaller `CODE_FONT`, counting code points since 𐤄 is two UTF-16 units. The scout camp, barracks and archery range symbols arrive with their buildings in Task 4. The tree's `♣` is emoji-capable too, but it has always drawn as plain text, so it's worth a glance in the browser check. The browser check of the symbols is still to do.

## Task 3: Explored-only and breaching paths

`findPath(state, from, isGoal, { exploredBy, breach })`: `exploredBy` keeps to tiles that team has explored; `breach: { owner, dps }` lets the search cross that owner's rivals' structures at `1 + ceil(HP / dps)` extra tiles each (Dijkstra, typed-array heap). `walkTowards` passes the options through and keys its cache by them.

- [x] An explored-only search never crosses an unexplored tile, and is null when the goal lies beyond one
- [x] A breaching search goes round when that's cheaper, through the weakest wall when it isn't
- [x] Without options, searches are exactly as before (existing tests untouched)

Files: `src/sim/unitPaths.ts`, `src/sim/units.ts`, `tests/sim/unitPaths.test.ts`. Size: M. Depends on: none.

Built: `Unit.pathSight` records the `sightVersion` of the last search, so a unit limited to explored land with no way yet searches again once more land is explored (explored land changes sight, not the grid). The breaching search reuses the path buffers plus one reusable typed-array heap.

## Task 4: Buildings, unit kinds and the Offence tab

`UNIT_KINDS` scout `!`, soldier `&`, ranger `}` (projectile arrow); `STRUCTURES` scoutCamp `⚑`, barracks `Ba`, archeryRange `◎`, directional spawners per the spec's table; their tools in the Offence tab, which is no longer greyed out. Until Tasks 5-6, scouts and attackers behave like `hold`.

- [x] Each building spawns its own kind up to its quota, one per interval, once built
- [x] The Offence tab lists the three and is no longer greyed out; `3` opens it

Files: `src/sim/config.ts`, `src/sim/units.ts`, `src/ui/state.ts`, `src/render/palette.ts`, `tests/sim/fieldUnits.test.ts` (new), `tests/ui/hud.test.ts`. Size: S. Depends on: none.

## Task 5: Scouts

`src/sim/fieldUnits.ts`: `isFrontier` (explored, standable, next to unexplored, for a team); `scout` behaviour: walk (explored-only) to the nearest frontier tile, then the next; with none, go home and wait; never fight.

- [x] A scout walks to the nearest frontier and explores past it, again and again
- [x] With nothing left to explore it walks home and waits
- [x] It never attacks, and never steps on unexplored land

Files: `src/sim/fieldUnits.ts` (new), `src/sim/units.ts`, `tests/sim/fieldUnits.test.ts`. Size: M. Depends on: 3, 4.

Built: `state.exploredVersion` goes up only when a team explores a tile new to it, and explored-only paths go stale on that (`Unit.pathExplored`), not on `sightVersion`, which changes whenever any unit steps. So a scout with nothing left doesn't search again every tick. A scout waits at its building's door.

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
- [ ] README: Offence tab, scouts, soldiers, rangers, doors and symbols (structures table), Tuning rows; SPEC.md "Since `field-units`"; plan and CAPABILITIES statuses; `GLYPHS.md` has no "planned" marks left
- [ ] `src/sim/` coverage stays at 80% or more

Files: `tests/sim/game.test.ts`, `tests/sim/fieldUnits.test.ts`, `README.md`, `SPEC.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: 8.
