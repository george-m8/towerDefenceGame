# Tasks: long-shadows, game-clock, night-spawns

Specs: [`SPEC-long-shadows.md`](../../SPEC-long-shadows.md), [`SPEC-game-clock.md`](../../SPEC-game-clock.md), [`SPEC-night-spawns.md`](../../SPEC-night-spawns.md) · Plan: [`plan.md`](../plan.md) ("Day and night: long-shadows, game-clock, night-spawns")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, each checked by its result before committing. Tests read their numbers from config (`SUN`, `DAY_NIGHT`, `GAME_CLOCK`, `NIGHT_SPAWNS`, `WAVES`), never repeat them. One commit per task, files staged by name.

---

## long-shadows

## Task 1: Shadows up to 2 tiles

`SUN.maxLength` 2.5; `DAY_NIGHT.arcAtSunrise` 10°, `arcAtSunset` 170°. `CASTERS` becomes the 24 offsets within 2 tiles, worked out once.

- [x] The tallest block's shadow stays under 2 tiles; `CASTERS` has the 24 offsets
- [x] A block 2 tiles away shades a lower one when the shadow is long enough, and not when it's short
- [x] Existing sun and day/night tests pass (updated only where they state the old numbers)

Files: `src/render/sun.ts`, `src/render/palette.ts`, `tests/render/sun.test.ts`. Size: S. Depends on: none.

Built: `SUN.reachTiles` (2) sets both how far a shadow may fall and which tiles `CASTERS` lists.

## Task 2: Renderer reach and speed

The ground-shadow pass starts `SHADOW_REACH_TILES` (2, from `SUN`) beyond the view. Block heights for the view plus that margin are worked out once per frame and read from there by both shadow passes. A timing test draws an XL map covered in walls and towers through a stub canvas, before and after.

- [x] Long shadows from blocks just off screen still show
- [x] The timing test: no more than 2ms slower per frame than before this module (else fall back to 1.5 tiles)

Files: `src/render/canvas.ts`, `tests/render/canvasTiming.test.ts` (new). Size: S. Depends on: 1.

Built: timed with a benchmark script outside the repo, not a test (millisecond budgets in tests flake on a busy machine): an XL map, all on screen, every tile a random tree, rock, bush or ground, long dawn shadows, through a stub canvas. Before this module 720 ms a frame (the stub is slow; only the comparison counts); after Task 1 alone 1,230 ms; with the height cache and the out-of-reach skip 600 ms, faster than before. No `tests/render/canvasTiming.test.ts`.

## Checkpoint A: after Task 2

- [x] Standard verification passes
- [ ] By hand: Debug > Day/night, Play: long shadows at dawn and dusk, about 2 tiles, joined to their blocks

---

## game-clock

## Task 3: The clock in the sim

`GAME_CLOCK = { sunrise: 6, sunset: 18, dayMinutes: 5, nightMinutes: 3, startHour: 17 }` in `src/sim/config.ts` (sunrise and sunset move here from `DAY_NIGHT`; `dayNight.ts` reads them). `src/sim/clock.ts`: `createClock()`, `hoursPerTick(hour)`, `advanceClock(state)` (wraps at midnight, `day` up at sunrise), `isNight(hour)`, `setClockHour(state, hour)`. `GameState.clock` (null unless `GameOptions.clock`); `tick()` advances it.

- [ ] A day and night take `dayMinutes + nightMinutes` of ticks at normal speed, split 5 / 3
- [ ] Paused, the clock stops; fast-forward runs it faster; it wraps at midnight and `day` goes up at sunrise
- [ ] Without the option, `state.clock` stays null; the determinism tests still match

Files: `src/sim/config.ts`, `src/sim/clock.ts` (new), `src/sim/types.ts`, `src/sim/game.ts`, `src/render/dayNight.ts`, `tests/sim/clock.test.ts` (new). Size: M. Depends on: none.

## Task 4: The clock online

`clock` joins the update fields; the welcome snapshot and `applyUpdate` carry it.

- [ ] A client's clock matches the server's after updates (`tests/net/view.test.ts`)

Files: `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/view.ts`, `tests/net/view.test.ts`. Size: S. Depends on: 3.

## Task 5: The sky and Debug follow the game's clock

`skyHour(state, ui)`: the game's clock, else `ui.clock`, else none. The renderer takes darkness and shadow strength from it. In the frame loop, whenever the game's hour moves, `ui.sun = sunAt(hour)` and the Debug boxes sync. A `debugClock { hour }` command (offline only, in `isDebugCommand`) sets the game's hour through `setClockHour`. With a game clock, the Debug Day/night box shows the game's time, its slider sends `debugClock`, and it has no Play button.

- [ ] With a game clock the sky follows it; without, Debug Day/night works as before
- [ ] `debugClock` sets the hour offline and is never sent online
- [ ] The Sun sliders can nudge the sun; the game's clock pulls it back as it moves

Files: `src/render/dayNight.ts`, `src/render/canvas.ts`, `src/ui/clockControls.ts`, `src/main.ts`, `src/sim/types.ts` + `src/sim/game.ts` (the command), `tests/ui/clockControls.test.ts`, `tests/sim/clock.test.ts`. Size: M. Depends on: 3.

---

## night-spawns

## Task 6: Night spawns in the sim

`GameOptions.enemiesCome` ("always" | "night", default always) and `GameState.enemiesCome`; "night" turns the clock on (from 17:00). `NIGHT_SPAWNS = { from: 17 }`. `isSpawningTime(state)`. `updateWaves` runs only in spawning time; entering it starts the countdown; at sunrise no new wave starts (the countdown stops) but a wave already spawning finishes. `sendWaveEarly` refuses by day ("Enemies come at night"). `state.nights` counts sunrises with the keep standing.

- [ ] No spawns by day; the first wave comes a countdown after 17:00; waves run through the night, wave numbers carrying on to the next night
- [ ] At sunrise no new wave starts; a wave already spawning finishes; enemies on the map remain; `nights` goes up
- [ ] "always" is unchanged (existing wave tests pass); a night game is deterministic

Files: `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/game.ts`, `src/sim/waves.ts`, `src/sim/clock.ts`, `tests/sim/nightSpawns.test.ts` (new). Size: M. Depends on: 3.

## Task 7: Solo: the setup choice and `?solo&night`

The Endless settings step gets **Enemies come: All the time / At night** (laid out like Fog of war); `ModeSettings.enemiesCome` reaches `createGame`. `?solo&night` starts a solo night game.

- [ ] Choosing At night starts a game at 17:00 with night spawns; All the time as now
- [ ] `?solo&night` does the same (join intent test)

Files: `src/ui/startScreen.ts`, `src/net/join.ts`, `src/main.ts`, `tests/net/join.test.ts`. Size: S. Depends on: 6.

## Checkpoint B: after Task 7

- [ ] Standard verification passes
- [ ] By hand, `?solo&night`: first wave about 20 s in; waves through the night; sunrise stops spawning and stragglers stay; the next night carries on; Debug Day/night jumps the game's time

## Task 8: Online: the host's choice

`enemiesCome` on `create` (validated; a bad value is refused), stored on the room, used by `createGame` and kept by restarts. The co-op setup sends it.

- [ ] A room created at night plays at night for every player, and after a restart
- [ ] A bad value is refused (protocol test)

Files: `src/net/protocol.ts`, `server/room.ts`, `server/rooms.ts`, `server/connection.ts`, `tests/server/room.test.ts`. Size: M. Depends on: 6.

## Task 9: HUD and game-over text

With enemies at night: the Wave stat reads "Night 2 · Wave 7"; by day the next-wave stat reads "At dusk"; game over reads "You survived 3 nights (reached wave 9) and held out for 24:10." All the time: unchanged.

- [ ] HUD and game-over text as above, from pure functions with tests

Files: `src/ui/stats.ts`, `src/ui/gameOver.ts`, `tests/ui/stats.test.ts` (new). Size: S. Depends on: 6.

## Checkpoint C: after Task 9

- [ ] Standard verification passes
- [ ] By hand: a co-op game at night (two tabs); the HUD by day and night; the game-over text

## Task 10: Docs

README (setup choice, how night waves work, Debug Day/night with a game clock), `SPEC.md` "Since" lines, `CAPABILITIES.md` statuses, each spec's "Last updated".

- [ ] Docs updated and accurate

Files: `README.md`, `SPEC.md`, `CAPABILITIES.md`, the three specs. Size: S. Depends on: 9.
