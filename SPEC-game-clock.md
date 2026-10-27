# Spec: game-clock

Status: APPROVED (2026-10-27)
Module: `game-clock`, on the capability map's Day and night section. Builds on `day-night` ([`SPEC-day-night.md`](SPEC-day-night.md)). `night-spawns` builds on it.

## Objective

Make the time of day part of the game. Today the day and night clock is drawing only, set from the Debug menu. For enemies to come at night, the time must be game state: it moves with the game, stops when the game is paused, runs faster on fast-forward, and is the same for every player online. The sky (sun, shadows, night) is drawn from it, so players tell the time from the light, not from a clock on screen.

1. As a player in a game with a clock, the sun rises, crosses and sets, and night falls, in step with the game: a whole day and night in 8 minutes (5 of day, 3 of night) at normal speed.
2. As a player online, I see the same time as everyone else.
3. As a developer, Debug > Day/night shows the game's time, and in a solo game its Time slider moves the game's clock (to try night straight away).

## Rules

**The clock**
- `state.clock` is `{ hour, day }` or null. `hour` runs from 0 to 24; `day` counts the days started (1 on the first). It's null in games that don't use a clock: today, every game except Endless with enemies at night (`night-spawns`). Those games behave exactly as now.
- It advances every tick, so it pauses with the game and speeds up with fast-forward. Day hours (sunrise 6:00 to sunset 18:00) pass at one rate and night hours at another, so the day takes `GAME_CLOCK.dayMinutes` (5) and the night `GAME_CLOCK.nightMinutes` (3) of game time.
- A game starts at `GAME_CLOCK.startHour` (17:00, early evening), on day 1, so in a night game the first enemies come soon (see `night-spawns`). When the hour passes midnight it wraps to 0; `day` goes up at sunrise.
- The clock has no randomness, so it stays the same on every machine.

**Drawing**
- The sky is drawn from the first of these that's set: the game's clock, else the Debug clock (`ui.clock`), else full daylight with the default sun (as now).
- The Sun sliders (Debug) are a preview of how the light would look with the sun somewhere else. They can nudge the drawn sun, and the game pulls it back to its own time as its clock moves (straight away unless the game is paused). This is how they already behave with the Debug clock.
- There's no clock on screen. The light shows the time.

**Debug**
- In a game with a clock, Debug > Day/night shows the game's time and its Time slider sends a debug command that sets the game's hour (offline only, like the other debug options; online it's refused). There's no Play button then: the game runs the clock (pause the game to stop it).
- In a game without a clock, Debug > Day/night works as now (a local clock with Play).

**Online**
- `clock` goes in the welcome snapshot and in every update (it changes every tick). Clients draw from the latest one, like the rest of the state.

## Out of scope

- Choosing whether a game has a clock: `night-spawns` adds the setup option.
- The clock in other modes, or as a look-only option (later).
- Anything else changing with the time (enemy strength, sight, income).
- A clock or "night in 0:40" readout on screen.

## Data and code

- `src/sim/config.ts`: `GAME_CLOCK` with `dayMinutes`, `nightMinutes`, `startHour`. Sunrise and sunset hours move from `DAY_NIGHT` (render) to the sim, which owns the clock; `DAY_NIGHT` keeps the look (arcs, twilight, darkness).
- `src/sim/clock.ts` (new): `createClock()`, `advanceClock(state)` (per tick), `hoursPerTick(hour)`, `isNight(hour)`.
- `src/sim/types.ts`, `src/sim/game.ts`: `GameState.clock`; `GameOptions.clock?: boolean` (default off), used by `night-spawns`. The tick advances it.
- A `debugClock { hour }` command (offline only).
- `src/net/snapshot.ts`, protocol, `applyUpdate`: `clock` in the snapshot and updates.
- `src/render/canvas.ts`: the drawn hour comes from one function, `skyHour(state, ui)`, applying the order above. `ui.sun` stays the drawn sun; whenever the game's clock moves, `main.ts` sets it from the clock (as the Debug clock does now).
- `src/ui/clockControls.ts`, `src/ui/sunSlider.ts`, `src/main.ts`: the Debug box with a game clock; the Sun sliders follow it.

## Testing

- Unit tests: a day and night take 8 minutes of ticks at normal speed (5 and 3); the clock stops when paused and runs faster on fast-forward; it wraps at midnight and `day` goes up at sunrise; a game without a clock never gets one; `debugClock` sets the hour offline and is refused online.
- Determinism: the existing same-seed tests still match, with a clock.
- Network: a client's clock matches the server's after updates (`tests/net/view.test.ts`).
- Browser, by hand: a clocked game (from a test switch until `night-spawns` adds the option) shows the day passing; pausing stops it.

## Success criteria

- [ ] With a clock, the sky follows the game's time: 8 minutes a day at normal speed, paused with the game, faster on fast-forward.
- [ ] Every player online sees the same time.
- [ ] Games without a clock are unchanged.
- [ ] Debug Day/night shows and (offline) sets the game's time; the Sun sliders preview a sun, and the game's clock pulls it back.
- [ ] Unit, determinism and network tests, the typecheck and the build pass.

## Open questions

None.
