# Tasks: players

Spec: [`SPEC-players.md`](../../SPEC-players.md) | Plan: [`plan.md`](../plan.md) | Map: [`CAPABILITIES.md`](../../CAPABILITIES.md)

Standard verification for every task (in addition to task-specific checks):
`npm run typecheck && npm test && npm run build`

---

## Phase E: Players in the sim, single-player unchanged

## Task 1: Ownership and kill-credit data

**Description:** Add `owner: PlayerId | null` to `Structure` and `killedBy: PlayerId | null` to `Enemy`, plus `export type PlayerId = number`. `placeStructure` takes an owner: player-built structures get `1` for now (from `applyCommand`) and generated ruins get `null`. Add `damageEnemy(enemy, amount, by)` to `enemies.ts`, which ignores enemies already at 0 HP or below and records `killedBy` on the hit that takes HP to 0 or below. Route every enemy damage in `towers.ts` (single target and splash) and `traps.ts` through it, passing the structure's owner. Gold is still shared, so nothing visible changes.

**Acceptance criteria:**
- [x] Built structures have `owner: 1`, and generated ruins have `owner: null`
- [x] Every enemy damage goes through `damageEnemy` (no `enemy.hp -=` / `target.hp -=` left in `towers.ts` or `traps.ts`)
- [x] `killedBy` is set on the killing blow for a single-target kill, a splash kill and a trap kill. A second hit on a dead enemy doesn't change it.

**Verification:**
- [x] New tests in `tests/sim/enemies.test.ts` (the `damageEnemy` rules) and `tests/sim/towers.test.ts` / `tests/sim/traps.test.ts` (each damage source sets `killedBy`)
- [x] All existing tests pass unchanged
- [x] `grep -n "hp -=" src/sim` shows only structure damage

**Dependencies:** None

**Files likely touched:** `src/sim/types.ts`, `src/sim/enemies.ts`, `src/sim/towers.ts`, `src/sim/traps.ts`, `src/sim/grid.ts`, `src/sim/game.ts`, tests

**Estimated scope:** M

---

## Task 2: Players with their own gold

**Description:** Add `Player`, `state.players` and `state.nextPlayerId`, and remove `state.gold`. New `src/sim/players.ts` with `addPlayer(state, name)` (starting gold, ids never reused) and `playerName`. `createGame(seed, { players?: string[] })` creates player 1 by default. `applyCommand(state, playerId, command)` rejects unknown players with "Unknown player" and passes the player to `canBuild` (checks their gold) and `placeStructure` (sets the owner). Gold flows per the spec: bounties to `killedBy`, house income to the owner, and build cost, sell refund, tree clearing, ruin salvage, chest claim and early-send bonus to the acting player. `main.ts` defines `LOCAL_PLAYER = 1` and passes it on every dispatch, and the panel shows that player's gold and disables unaffordable tools by it. Existing tests switch mechanically to `goldOf(state, id = 1)` (new helper) and `applyCommand(state, 1, command)`.

**Acceptance criteria:**
- [x] `state.gold` no longer exists, and the game plays as before with one player
- [x] With two players, each player's gold changes only through their own builds, sales, kills, houses, chests, trees and early sends
- [x] A command from an unknown player id is rejected and changes nothing

**Verification:**
- [x] New `tests/sim/players.test.ts`: two-player gold separation for every gold source, unknown player, `addPlayer` ids and starting gold
- [x] All existing tests pass after only the mechanical swap
- [x] Manual: browser game shows gold, bounties and house income as before

**Dependencies:** Task 1

**Files likely touched:** `src/sim/types.ts`, `src/sim/players.ts`, `src/sim/game.ts`, `src/sim/grid.ts`, `src/sim/economy.ts`, `src/sim/waves.ts`, `src/main.ts`, `src/ui/panel.ts`, `tests/sim/helpers.ts`, `tests/sim/players.test.ts`, plus mechanical edits to existing tests

**Estimated scope:** L (mostly mechanical; the behaviour change is contained in the gold call sites)

---

### Checkpoint E: single-player unchanged
- [x] All existing tests pass after the mechanical gold swap (plus owner `1` on three tests that place a paying structure directly)
- [x] Browser smoke test: build, sell, waves, bounties, houses, chests, trees, pause and fast-forward all behave as before
- [x] Review with human

---

## Phase F: Multiplayer rules

## Task 3: Ownership rules for selling and mounting

**Description:** Selling checks the top structure on the tile: allowed if it's the acting player's or neutral (`owner: null`), otherwise rejected with "That belongs to <name>". Clearing trees is unaffected. Mounting a tower is allowed on open ground, on your own wall, or on a neutral ruin, and rejected on another player's wall with "That wall belongs to <name>". The UI's build ghost already calls `canBuild`, so it shows the same rule.

**Acceptance criteria:**
- [x] A can't sell B's structure (the reason names B), and B's gold and structure are unchanged
- [x] Anyone can salvage a ruin, unless another player's tower stands on it
- [x] A can mount on A's wall or a ruin but not on B's wall

**Verification:**
- [x] Tests in `tests/sim/players.test.ts` for each case above
- [x] Existing sell and layer tests still pass (single player owns everything they build)

**Dependencies:** Task 2

**Files likely touched:** `src/sim/economy.ts`, `src/sim/grid.ts`, `tests/sim/players.test.ts`

**Estimated scope:** S

---

## Task 4: Votes and connections

**Description:** Each player has `connected` and `votes: { pause, fastForward }`. `togglePause` and `toggleFastForward` toggle the acting player's vote. `setConnected(state, id, connected)` marks a player as dropped or back and clears their votes when they drop. One function, `updateVotes(state)`, derives `state.paused` (every connected player voted, or nobody is connected) and `state.speed` (`FAST_FORWARD_SPEED` when every connected player voted, else 1). It's called after every vote, connection change and `addPlayer`. Nothing else writes `paused` or `speed`.

**Acceptance criteria:**
- [x] Pause and fast-forward happen only when every connected player has voted, and any withdrawal undoes them
- [x] A dropped player's votes are cleared and they stop counting. With everyone dropped the game is paused. A single player's vote decides alone.
- [x] A dropped player keeps their gold and structures, still earns house income and bounties, and has them all on reconnect

**Verification:**
- [x] Tests in `tests/sim/players.test.ts` for votes, drops, rejoin and income while dropped
- [x] Existing pause and fast-forward tests pass unchanged (apart from the Task 2 signature swap)
- [x] Manual: Space and F behave as before in the browser

**Dependencies:** Task 2

**Files likely touched:** `src/sim/types.ts`, `src/sim/players.ts`, `src/sim/game.ts`, `tests/sim/players.test.ts`

**Estimated scope:** M

---

## Task 5: Determinism check and docs

**Description:** Add a test that plays the same seed with two players and a fixed list of `(tick, playerId, command)` entries twice and gets identical state. That's the guarantee `game-server` relies on. Update `SPEC.md` (a "Since `players`" note on gold and commands) and the README (gold and pause are per player and vote-based in multiplayer; single-player unchanged).

**Acceptance criteria:**
- [x] The two-player replay test passes and compares the full state
- [x] `SPEC.md` and the README describe the player rules accurately

**Verification:**
- [x] `npm run coverage` (80% lines or more for `src/sim/`)
- [x] Manual: read through the README changes

**Dependencies:** Tasks 3, 4

**Files likely touched:** `tests/sim/players.test.ts`, `SPEC.md`, `README.md`

**Estimated scope:** S

---

### Checkpoint F: players complete
- [x] All 7 success criteria in `SPEC-players.md` met
- [x] `npm run coverage` passes (99.3% lines for `src/sim/`)
- [x] Review with human, then move this file to `tasks/players/` and write the `game-server` spec
