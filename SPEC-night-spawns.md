# Spec: night-spawns

Status: APPROVED (2026-10-27)
Module: `night-spawns`, on the capability map's Day and night section. Builds on `game-clock` ([`SPEC-game-clock.md`](SPEC-game-clock.md)). `edge-spawns` (where enemies come from) will add a second option beside this one, with `wave-director`.

## Objective

A new way to play Endless: enemies come at night. Days are for building and clearing up stragglers; nights are for surviving. Success is counted in nights survived.

1. As a player setting up an Endless game (solo or co-op), I choose **Enemies come: All the time** (as now) or **At night**.
2. At night: from early evening, today's waves start (a wave, the countdown, the next wave, each bigger than the last). At sunrise they stop. Enemies already on the map stay until they're killed.
3. The next evening the waves carry on from where they stopped.
4. The HUD shows which night it is, and the game-over screen says how many nights I survived.

## Rules

**When enemies come**
- **All the time**: exactly as now. No clock.
- **At night**: the game has a clock (`game-clock`), starting at 17:00 on day 1: early evening, so spawning time starts at once and the first wave comes after the usual countdown (20 seconds), as today. Waves run only between `NIGHT_SPAWNS.from` (17:00, early evening, while the sun is low) and sunrise (6:00), the "spawning time".
  - When spawning time starts, the wave countdown starts as it does before wave 1 today, so the first wave of each night comes `WAVES.countdownSeconds` after early evening.
  - Within spawning time, waves run as now: spawn, countdown, next wave.
  - At sunrise, spawning stops at once: a wave still spawning loses whatever it hadn't spawned yet, and the countdown stops. Enemies on the map stay and keep attacking until they're killed.
  - Wave numbers carry on across nights (night 2 starts with the wave after night 1's last), and wave strength grows with the wave number as now.
- **Send wave early** works only in spawning time (otherwise: "Enemies come at night").
- PvP has no waves, so the option only appears for Endless.

**Counting nights**
- A night is survived when the sun rises on it with the keep still standing.
- HUD: with enemies at night, the Wave stat shows the night too, e.g. "Night 2 · Wave 7". By day the next-wave stat shows "At dusk" instead of a countdown.
- Game over (at night): "You survived 3 nights (reached wave 9) and held out for 24:10." With enemies all the time, the message is as now.

**Setting it up**
- The Endless settings step (beside Map size) gets **Enemies come: All the time / At night**, a two-way choice like Map size. Default: All the time.
- Online: the host's choice goes with the room (in `create`, like `size`), and every player plays it. Restart keeps it.
- `?solo&night` starts a solo game at night (a test switch, like `?fog=off`).

## Out of scope

- Where enemies come from (`edge-spawns`, with `wave-director`).
- Night-only waves being stronger, longer or different; enemies acting differently at night or by day.
- Town lighting at night.
- The cycle as a look-only option in other modes (later; the Debug menu has it).
- High scores or saving nights survived.

## Data and code

- `src/sim/config.ts`: `NIGHT_SPAWNS = { from: 17 }`.
- `src/sim/types.ts`, `src/sim/game.ts`: `GameOptions.enemiesCome?: "always" | "night"` (default always); `GameState.enemiesCome`; with "night", `createGame` turns the clock on. `state.nights`: nights survived.
- `src/sim/waves.ts`: `updateWaves` runs only in spawning time when `enemiesCome` is "night", and sunrise ends the current wave's spawning; `sendWaveEarly` refuses outside it.
- `src/sim/clock.ts`: `isSpawningTime(state)`; sunrise counts a survived night.
- `src/ui/startScreen.ts`: the choice; `src/net/join.ts` (`?night`); `src/net/protocol.ts` and the server: `enemiesCome` on `create`, validated, kept for restarts.
- `src/ui/stats.ts`, `src/ui/gameOver.ts`: the night in the HUD and game-over text.
- README (setup and how waves work), `SPEC.md` "Since" line, `CAPABILITIES.md`.

## Testing

- Unit tests (`tests/sim/nightSpawns.test.ts`): no enemies spawn by day; the first wave comes a countdown after 17:00; waves run through the night; at sunrise spawning stops, the unspawned rest is dropped and the enemies on the map remain; the next night continues the wave numbers; send-early is refused by day; nights survived counts sunrises; "all the time" is unchanged.
- Determinism: a night game with the same seed and commands matches itself.
- Protocol: `create` with a bad `enemiesCome` is refused; a room started at night plays at night for every player.
- Browser, by hand: a solo game at night through two days, a co-op one; HUD and game-over text.

## Success criteria

- [ ] Endless setup offers Enemies come: All the time / At night, solo and online.
- [ ] At night, waves run from early evening until sunrise, then stop; stragglers stay until killed; the next night carries on.
- [ ] The HUD shows the night; game over says how many nights were survived.
- [ ] All the time plays exactly as now.
- [ ] Unit, determinism and protocol tests, the typecheck and the build pass; docs updated.

## Open questions

None. Settled 2026-10-27: the first day starts at 17:00, so the first wave comes as soon as it does today.
