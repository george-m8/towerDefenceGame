# Tasks: town-lights, skip-to-night

Specs: [`SPEC-town-lights.md`](../../SPEC-town-lights.md), [`SPEC-skip-to-night.md`](../../SPEC-skip-to-night.md) · Plan: [`plan.md`](../plan.md) ("Day and night: town-lights, skip-to-night")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, each checked by its result before committing. Tests read their numbers from config (`LIGHTS`, `NIGHT_SPAWNS`, `GAME_CLOCK`), never repeat them. One commit per task, files staged by name.

---

## town-lights

## Task 1: Light sources and the light map

`LIGHTS` in `src/render/palette.ts` (radius and strength per structure kind, an entry for units, none for scouts, a warm tint). `src/render/lights.ts`: `lightSources(state)` (built structures, not ruins or ones still being built; units except scouts) and `lightMap(sources, region)` (per tile: the brightest light reaching it, fading smoothly to nothing at its radius).

- [x] Built structures and units give light by kind; scouts, enemies, ruins and unfinished buildings don't
- [x] A tile's light is the brightest reaching it (lights don't add up), fading to 0 at the radius
- [x] Sources out of reach of the region are left out

Files: `src/render/lights.ts` (new), `src/render/palette.ts`, `tests/render/lights.test.ts` (new). Size: S. Depends on: none.

Built: farmland lights like walls (a thin line), as the spec has every built structure give light. The keep's light comes from `state.keeps` (it isn't a structure). The falloff is `strength x (1 - d²/r²)`.

## Task 2: Night through the light map

`drawNight` draws the darkness through the light map: a small canvas, one pixel per tile for the view plus the largest radius (clamped to the map), alpha `darkness x (1 - light)`, drawn scaled and smoothed; the warm tint over lit tiles the same way; off the map, flat night as now. No light map while it's light. Timed with the benchmark script at midnight on an XL map of walls.

- [x] At night the town lights the dark round it; by day nothing is drawn
- [x] Night frame time on the benchmark within 2ms of before

Files: `src/render/canvas.ts`. Size: S. Depends on: 1.

Built: also `src/render/lights.ts` (`nightLight`). The first version, working out every light each frame, cost about 3 ms on an XL map zoomed right out with 13,000 walls (1 ms on a normal view): over budget. Now what's built is lit once per grid change (the whole map, cached by `gridVersion`) and each frame copies out the region and adds units: 0.3 ms zoomed right out, 0.03 ms on a normal view (benchmark script, real arrays; a test checks it matches the uncached map).

## Checkpoint A: after Task 2

- [x] Standard verification passes
- [ ] By hand, `?solo&night` (Debug Day/night to jump to midnight): keep, towers, buildings and walls glow by kind; units a little; scouts dark; lights come up at dusk and go at dawn

---

## skip-to-night

## Task 3: The skip-to-night vote

`votes.skipToNight` on players (everywhere votes are built: new players, drop-outs, restarts). A `voteSkipToNight` command toggles the sender's vote; refused with enemies all the time ("No night to skip to") or in spawning time ("It's already night"). `updateVotes`: when the skip vote is unanimous, `skipToNight(state)` (the clock to `NIGHT_SPAWNS.from`, same day) and clear the votes. `tick()`: skip votes clear once spawning time starts.

- [x] Solo, the vote skips at once to 17:00, and the first wave comes after the countdown; no gold paid
- [x] With two players one vote doesn't skip and two do; a vote can be taken back; votes clear after the skip, at dusk and on a drop-out
- [x] Refused by night and with enemies all the time

Files: `src/sim/types.ts`, `src/sim/players.ts`, `src/sim/game.ts`, `src/sim/clock.ts`, `server/room.ts`, `tests/sim/skipToNight.test.ts` (new). Size: M. Depends on: none.

Built: `NO_VOTES` (players.ts) is the one place a fresh set of votes comes from (new players, drop-outs, restarts). `tests/sim/players.test.ts` now expects the third vote in a cleared set.

## Task 4: Online: the command

The protocol's command parser accepts `voteSkipToNight`; a room applies it as a vote.

- [x] It parses (protocol test) and two players' votes in a room skip the night (room test)

Files: `src/net/protocol.ts`, `tests/server/protocol.test.ts`, `tests/server/room.test.ts`. Size: S. Depends on: 3.

## Task 5: The HUD button and the Players mark

A **Skip to night** button beside Pause and Fast forward, shown only by day in night games, labelled with the vote count in co-op ("Skip to night 1/2"), lit when you've voted. The Players panel marks a skip vote.

- [x] Shown only by day in night games (a pure "should it show" helper, tested); the vote label and lit state as Pause's

Files: `src/ui/panel.ts`, `src/ui/players.ts`, `src/ui/votes.ts`, `tests/ui/votes.test.ts` (new, or the existing HUD tests). Size: S. Depends on: 3.

Built: also `src/styles.css` (a hidden HUD button). The Players panel marks a skip vote with ☾. `tests/ui/votes.test.ts` already existed: the new tests are added to it.

## Checkpoint B: after Task 5

- [x] Standard verification passes
- [ ] By hand: Skip to night solo by day (gone at night); a co-op vote in two tabs

## Task 6: Docs

README (night lights; the Skip to night button in the controls table and multiplayer votes), `SPEC.md` "Since" line, `CAPABILITIES.md` statuses, the specs' "Last updated".

- [ ] Docs updated and accurate

Files: `README.md`, `SPEC.md`, `CAPABILITIES.md`, `SPEC-town-lights.md`, `SPEC-skip-to-night.md`. Size: S. Depends on: 5.
