# Implementation Plan: Post-MVP Phases

Capability map: [`CAPABILITIES.md`](../CAPABILITIES.md)
Current module spec: [`SPEC-unit-core.md`](../SPEC-unit-core.md) (AoE update)
Task list (current module only): `tasks/todo.md`, written when the next module's spec is approved
Finished modules: [`tasks/tile-layers/`](tile-layers/todo.md), [`tasks/tower-aiming/`](tower-aiming/todo.md), [`tasks/audio/`](audio/todo.md), [`tasks/map-gen/`](map-gen/todo.md), [`tasks/players/`](players/todo.md), [`tasks/game-server/`](game-server/todo.md) (awaiting the cross-machine probe and review), [`tasks/net-client/`](net-client/todo.md)
Previous plan (MVP, complete except a Firefox/Safari smoke test): [`tasks/mvp/`](mvp/plan.md)

## How this plan works

Modules are built one at a time in the approved order. Each module goes spec -> plan -> tasks -> build:

- **The current module** (`tower-aiming`) has an approved spec, so its tasks are fully written in `tasks/todo.md`.
- **Later modules** have a provisional outline below. Each outline is refined into real tasks only after that module's spec is written and approved. Outlines will change as earlier modules teach us things.
- When a module is finished, its `todo.md` moves to `tasks/<module-id>/` (as the MVP's did), and the next module's tasks take its place.

## Roadmap

| Phase | Module | Status |
|---|---|---|
| 1. Basics | `tile-layers` | Done |
| | `map-gen` | Done (merged in PR #4) |
| 1b. Multiplayer (co-op) | `players` | Done |
| | `game-server` | Built; cross-machine probe and review pending |
| | `net-client` | Done (play-tested) |
| | `lobby` | **Spec approved; tasks in [`tasks/lobby/`](lobby/todo.md)** |
| 1. Basics (continued) | `tower-aiming` | Done |
| | `line-of-sight` | Spec drafted |
| 1d. Armies (see below) | `enemy-kinds` | Done (tasks in [`tasks/enemy-kinds/`](enemy-kinds/todo.md)) |
| | `bestiary` | Built; browser check with George pending (tasks in [`tasks/bestiary/`](bestiary/todo.md)) |
| | `enemy-pathing` | Built and merged (PR #32); browser checkpoints C and D pending (tasks in [`tasks/enemy-pathing/`](enemy-pathing/todo.md)) |
| | `enemy-targeting` | Outline (moved after `field-units` by the AoE update) |
| | `wave-director` | Outline (moved after `field-units` by the AoE update) |
| 1e. AoE update (see [`CAPABILITIES.md`](../CAPABILITIES.md)) | `unit-core` | **Spec approved; tasks in [`tasks/todo.md`](todo.md)** |
| | `resources` | Spec needed (gold only) |
| | `town-economy` | Spec needed |
| | `units` | Outline (guard towers only; entity moves to `unit-core`) |
| | `field-units` | Outline |
| | `game-setup` | Spec drafted; deferred until `food` |
| | `food` | Deferred |
| 1c. Presentation | `audio` | Done |
| | `music-packs` | Done (tasks in [`tasks/music-packs/`](music-packs/todo.md)) |
| | `music-director` | Outline only (see below); intro hand-over now part of `music-packs` |
| 2. Setup and modes | `game-setup` | Moved to 1e (deferred) |
| | `mode-ramparts` | Spec needed |
| 3. Economy | `resources`, `town-economy` | Moved to 1e |
| 4. Multiplayer-style | `mode-barbarians` | Spec needed |

---

## Module 1: `tile-layers` (done)

### Overview

Split each tile into a base layer (ground, keep, wall, spikes, house) and a mount layer (towers), so towers can stand on walls or on open ground. Gameplay is otherwise unchanged.

### Architecture decisions

- **Refactor first, behaviour second.** Task 1 swaps `tiles[]` for `terrain[]` + `base[]` + `mount[]` while keeping a temporary `structureAt` (returning the top layer), so nothing else changes and all 73 tests stay green. Task 2 moves every caller onto explicit helpers and deletes `structureAt`. Only then do new rules arrive.
- **One rule source.** `blocksAt` (pathfinding and enemy movement) and `attackTargetAt` (what an enemy hits) live in `grid.ts`. Pathfinding and enemies call them instead of reading stats themselves.
- **Layer comes from config.** Each structure kind declares `layer: "base" | "mount"` and walls declare `acceptsMount: true`. Placement rules read these, so future kinds (bridges, keep turrets) are config rows plus small rule changes.
- **Collapse lives in `removeStructure`.** Removing a base also removes its mount, so destruction, selling and any future demolition share one path.

### Dependency graph

```
T1 Layer data model (temporary structureAt shim)
 └─ T2 Callers use explicit helpers; shim removed
     └─ T3 Towers can be placed on walls
         ├─ T4 Walls protect, and drop, their towers
         └─ T5 Selling takes the top layer first
              └─ T6 Visuals, hover info, docs
```

T4 and T5 both depend only on T3.

### Task list

- [x] Task 1: Layer data model behind grid helpers
- [x] Task 2: Move callers to explicit layer helpers

**Checkpoint A: refactor complete, no behaviour change**
- [x] All 73 MVP tests pass, plus the new helper tests
- [x] Browser smoke test: build, waves, towers, selling all behave exactly as before

- [x] Task 3: Towers can be placed on walls
- [x] Task 4: Walls protect, and drop, their towers
- [x] Task 5: Selling takes the top layer first
- [x] Task 6: Wall-mounted visuals, hover info and docs

**Checkpoint B: module complete**
- [x] All 7 success criteria in `SPEC-tile-layers.md` met
- [x] Coverage of 80% lines or more for `src/sim/` (98.7%)
- [ ] Review with human

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The refactor silently changes behaviour (pathfinding, attacks) | High | Tasks 1-2 add no rules. The full MVP suite must stay green, plus a browser smoke test at Checkpoint A. |
| Ghost tower on a wall looks valid but the build is rejected (UI and sim disagree) | Med | The ghost already calls `canBuild`. Keep it that way, so there is one rule source. |
| An enemy attacks a ground tower that isn't actually on its route | Med | No new attack logic: enemies still only attack the tile their flow-field step lands on. Covered by the existing "no damage when an open route exists" test, extended to ground towers. |
| Two-click selling (tower, then wall) feels fiddly | Low | Accepted per spec. Revisit after play-testing. |

---

## Module 2: `map-gen` (done)

Spec: [`SPEC-map-gen.md`](../SPEC-map-gen.md)

### Overview

Every game starts on a seeded, generated map: sea along one edge, a river with fords, rock clusters, forests, pre-damaged ruins and treasure chests. Terrain is truly impassable (unlike walls), bridges open river tiles, trees can be cleared, ruins work as free damaged walls, and building on a chest claims its gold. The generator is size-agnostic, because the map will grow a lot later.

### Architecture decisions

- **Terrain rules before terrain content.** Task 1 makes pathfinding and placement understand terrain (set by hand in tests) before any generator exists, so the rules are proven on simple, readable cases.
- **Impassable is a separate concept from blocking.** `isWalkable` (terrain, plus bridges) is checked before `blocksAt` (structures). Pathfinding skips non-walkable tiles entirely, while blocking structures keep their "very expensive but breakable" cost. The "break in only when sealed" rule is untouched.
- **One generator module, one pass per feature.** `src/sim/mapgen.ts` runs coast -> river -> rocks -> forests -> ruins -> chests from the game's seeded rng, then validates the guarantees. On failure it retries with a seed derived from the original, so maps stay deterministic.
- **Sizes and counts come from config.** Feature counts are densities per 1,000 tiles in `MAP_GEN`, and every pass reads `state.width` / `state.height`. A 96x64 test keeps us honest.
- **Tests opt out of generation.** `createGame(seed, { blankMap: true })` gives today's open field. Existing tests switch to it (via the test helpers), so they keep testing exactly what they test now.
- **Features are a list, not a layer.** Chests live in `state.features`, so `resources` can add deposits, animals and crops as new kinds without another data-model change.

### Dependency graph

```
T1 Terrain rules (walkable / buildable)
 └─ T2 Bridges
     └─ T3 Generator: coast, river, fords, guarantees
         ├─ T4 Rocks, forests, clearing trees
         ├─ T5 Ruins
         └─ T6 Treasure chests
              └─ T7 Seed display, hover info, README
```

T4, T5 and T6 each depend only on T3.

### Task list

- [x] Task 1: Terrain rules for walking and building
- [x] Task 2: Bridges over rivers
- [x] Task 3: Map generator with coast, river, fords and guarantees

**Checkpoint C: generated maps**
- [x] All tests pass, including 500-seed guarantee tests
- [x] Browser: several seeds show a coast and a river; enemies use fords or bridges and never cross water
- [ ] Review with human

- [x] Task 4: Rocks, forests and clearing trees
- [x] Task 5: Ruins
- [x] Task 6: Treasure chests
- [x] Task 7: Seed display, terrain hover info and docs

**Checkpoint D: module complete**
- [x] All 7 success criteria in `SPEC-map-gen.md` met
- [x] Coverage of 80% lines or more for `src/sim/` (99.3%)
- [ ] Review with human

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A generated map cuts the keep off from the spawn | High | A route check runs after every generation, with deterministic regeneration on failure. Tested on 500 seeds and on a 96x64 map. |
| Regeneration loops forever on a pathological size or config | Med | Cap the attempts (e.g. 20), then fall back to a map with only the features that passed (or a blank map) and log it. The cap is tested. |
| Generated maps feel samey or ugly | Med | All shapes and densities live in `MAP_GEN` config. Review several seeds at Checkpoint C before adding more features. |
| The terrain change breaks existing tests | Med | Existing tests move to `blankMap` in Task 3, the same commit that turns generation on. The suite must stay green. |
| Enemies walk onto impassable tiles mid-move after a tree is cleared or a bridge is sold | Low | Terrain only ever gets more walkable at runtime (clearing trees, building bridges). Selling a bridge is rejected while an enemy is on it, like building. |


---

## Module 3: `players` (done)

Spec: [`SPEC-players.md`](../SPEC-players.md). First module of the Multiplayer map in [`CAPABILITIES.md`](../CAPABILITIES.md).

### Overview

The simulation learns about several players: own gold, owned structures, kill credit, and unanimous votes for pause and fast-forward. It's pure `src/sim/` work with no networking. A one-player game must behave exactly as today.

### Architecture decisions

- **Data first, behaviour second.** Task 1 adds `owner`, `killedBy` and a single `damageEnemy` helper while gold is still shared, so kill credit is wired through towers and traps before anything depends on it. Nothing visible changes.
- **Remove `state.gold` outright** rather than keeping an alias. The compiler then lists every place that used the shared pool, and none is missed.
- **The player is an argument, not part of the command.** `applyCommand(state, playerId, command)` lets `game-server` stamp the sender's id, so a client can never act as someone else.
- **`paused` and `speed` stay as fields but are derived** from votes and connections by one function in `players.ts`. `main.ts`, the panel and the renderer keep reading them unchanged.
- **Single-player is the regression test.** `createGame` makes player 1 by default, and the existing suite (after a mechanical `goldOf(state)` swap) must pass untouched otherwise.

### Dependency graph

```
T1 Ownership and kill-credit data (gold still shared)
 └─ T2 Players with their own gold
     ├─ T3 Ownership rules (sell and mount)
     └─ T4 Votes and connections
          └─ T5 Determinism check and docs
```

T3 and T4 each depend only on T2.

### Task list

- [x] Task 1: Ownership and kill-credit data
- [x] Task 2: Players with their own gold

**Checkpoint E: single-player unchanged**
- [x] All existing tests pass after the mechanical gold swap
- [x] Browser smoke test: build, sell, waves, bounties, houses, chests, trees, pause and fast-forward all behave as before

- [x] Task 3: Ownership rules for selling and mounting
- [x] Task 4: Votes and connections
- [x] Task 5: Determinism check and docs

**Checkpoint F: module complete**
- [x] All 7 success criteria in `SPEC-players.md` met
- [x] Coverage of 80% lines or more for `src/sim/` (99.3%)
- [x] Review with human, then move `todo.md` to `tasks/players/` and write the `game-server` spec

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The gold refactor quietly changes single-player behaviour | High | Task 2 removes `state.gold` so the compiler finds every use; the full existing suite must stay green; browser smoke test at Checkpoint E. |
| A damage path skips `damageEnemy`, so some kills pay nobody | Med | Task 1 routes every `enemy.hp -=` through it and adds a test per damage source (single target, splash, trap). A grep for `hp -=` on enemies in review. |
| Splash hits an already-dead enemy and steals the credit | Med | `damageEnemy` ignores enemies at 0 HP or below; tested with two towers on one target. |
| Derived `paused` disagrees with what the UI shows | Low | One function computes it and is called on every vote, connection or player change; the panel only reads it. |
| Task 2 touches many test files | Low | The test changes are mechanical (`state.gold` -> `goldOf(state)`, and `applyCommand(state, cmd)` -> `applyCommand(state, 1, cmd)`); behaviour changes stay in their own tests. |

---

## Module 4: `game-server` (built)

Spec: [`SPEC-game-server.md`](../SPEC-game-server.md). Branch `game-server`, stacked on `multiplayer-players` (PR #5) until that merges.

### Overview

A Node WebSocket server that hosts rooms, runs one simulation per room at 20 Hz, applies each connection's commands as its own player, and sends snapshots and 10 Hz updates. It runs locally and is reachable on the LAN. The browser doesn't use it until `net-client`; until then it's proven by unit tests, socket integration tests and a probe script.

### Architecture decisions

- **Shared, pure message code in `src/net/`.** Message types, validation and the state-to-update conversion have no Node or DOM, so `net-client` imports the same code. The server's Node-only code lives in `server/`.
- **Rooms are driven, not timed.** `advanceRoom(room, elapsedMs)` and an injected `send` function make room logic testable without sockets or sleeping. `server/main.ts` owns the only real timer.
- **Validate at the edge.** `connection.ts` turns raw socket data into a typed `ClientMessage` or an error before anything reaches a room. Rooms trust only typed messages and the connection's own player id.
- **Grid only when it changes.** Updates carry tile layers and features only when `gridVersion` moved since the last update, which keeps 10 Hz updates small without a diffing system.
- **Same origin in dev.** Vite proxies `/ws` to the game server, so the client will never need a server address. Production serves `dist/` and `/ws` from one process.

### Dependency graph

```
T1 Tooling and a bare server
 ├─ T2 Message types and validation
 └─ T3 Snapshots and updates
      └─ T4 A room: players, commands, ticks, restart   (needs T2 too)
           └─ T5 Rooms, connections and sockets
                └─ T6 Hardening: limits, tokens, expiry
                     └─ T7 Probe script, production start, docs
```

T2 and T3 each depend only on T1.

### Task list

- [x] Task 1: Tooling and a bare server
- [x] Task 2: Message types and validation
- [x] Task 3: Snapshots and updates

**Checkpoint G: shared pieces**
- [x] All tests pass; the update size test is under 30 KB (about 21 KB)
- [x] `npm run server` starts and logs its LAN address

- [x] Task 4: A room: players, commands, ticks and restart
- [x] Task 5: Rooms, connections and sockets

**Checkpoint H: two clients play over sockets**
- [x] Integration test: two clients create and join, B's build is owned by B and both see it
- [x] Review with human

- [x] Task 6: Hardening: limits, tokens and expiry
- [x] Task 7: Probe script, production start and docs

**Checkpoint I: module complete**
- [ ] All 7 success criteria in `SPEC-game-server.md` met
- [x] Coverage of 80% lines or more for `src/sim/`, `src/net/` and `server/` (except `main.ts`) (98.7%)
- [ ] Manual: probe from another machine on the network
- [ ] Review with human, then move `todo.md` to `tasks/game-server/` and write the `net-client` spec

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Sim code doesn't run under Node (DOM types, `import.meta.env`, extensionless imports) | High | Task 1 runs `createGame` and `tick` from `server/main.ts` under `tsx` before anything else is built; a separate server tsconfig without DOM catches accidental DOM use in `src/sim`. |
| Updates too big at 10 Hz | Med | Task 3 has the 200-enemy / 150-structure size test; grid fields only on change. |
| Timer drift or a slow tick stalls a room | Med | `advanceRoom` uses elapsed time with the same catch-up cap as `main.ts`; tested with large elapsed values. |
| A malformed or hostile message crashes the server | High | Validation in `connection.ts` before any room code; every handler wrapped so one bad socket can't throw out of the event loop; tests for malformed, oversized and flooded input. |
| Socket tests are flaky (ports, timing) | Med | Port 0 per test, await explicit messages instead of sleeping, close everything in `afterEach`. |
| Integration with the browser is unproven until `net-client` | Med | The message types are shared code, and the probe script exercises the real protocol from another machine. |

---

## Module 5: `net-client` (done)

Spec: [`SPEC-net-client.md`](../SPEC-net-client.md). Branch `net-client`, stacked on `game-server`.

### Overview

The browser plays online through the game server, with a minimal URL-based create/join so it's playable before `lobby`. Offline play is unchanged.

### Architecture decisions

- **A `Session` between `main.ts` and the game.** `LocalSession` is today's loop; `NetworkSession` speaks the protocol. `main.ts`, the panel and input only see a session, so offline and online share all UI code.
- **The view is a real `GameState`.** Server messages are expanded into a full `GameState` (missing fields defaulted), so the renderer, panel, hover info and sim helpers (`canBuild` for ghosts, `getFlowField` for the debug overlay) work unchanged.
- **Results through one callback.** Commands no longer return results synchronously to their callers; both sessions report through `onResult`, which shows refusals. Offline it fires immediately.
- **Dependencies injected.** `NetworkSession` takes the WebSocket constructor, storage and clock, so it's tested in Node against a real server with the `ws` client.
- **Smoothing is presentation only.** Interpolated enemy positions are written into the view each frame from the two buffered updates; the buffered server data is never changed.

### Dependency graph

```
T1 View state from server messages, interpolation
 └─ T2 Session interface; LocalSession; main.ts on sessions (offline unchanged)
     └─ T3 NetworkSession: join, updates, commands, results
         └─ T4 Joining by URL; room code and invite link     -> playable
             └─ T5 Smoothing, ghosts, reconnect
                 └─ T6 Players list, votes, owner colours, restart, docs
```

### Task list

- [x] Task 1: View state from server messages
- [x] Task 2: Sessions, with offline unchanged
- [x] Task 3: NetworkSession

**Checkpoint J: offline unchanged, network session tested**
- [x] All tests pass; offline smoke test in the browser

- [x] Task 4: Joining by URL, room code and invite link 

**Checkpoint K: playable online**
- [x] Manual: two tabs create and join, and build in the same game

- [x] Task 5: Smoothing, ghosts and reconnect 
- [x] Task 6: Players, votes, owner colours, restart and docs 

**Checkpoint L: module complete**
- [x] All 6 success criteria in `SPEC-net-client.md` met
- [x] Coverage of 80% lines or more (98.6%)
- [x] Review with human (including the *(Claude)* decisions), then `lobby`

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Moving `main.ts` onto sessions changes offline play | High | Task 2 is a refactor with no behaviour change; existing tests plus a browser smoke test before any network code is wired in. |
| Defaulted fields in the view mislead UI code (e.g. a ghost says buildable but the server refuses) | Med | The server's result is final and shown; ghosts are advisory. `canBuild` only uses fields the view has. |
| Enemies jitter or jump | Med | Interpolate one update behind with a buffered previous update; unit tests for midpoint, spawn and removal; manual check at 2x speed. |
| Reconnect loops or duplicate players | Med | Rejoin by token only; code 4000 stops retrying; backoff capped at 5 s; tested against a real server. |
| A malformed server message crashes the page | Low | Parse in one place with try/catch; ignore unknown message types. |

---

## Module 6: `tower-aiming` (done)

Spec: [`SPEC-tower-aiming.md`](../SPEC-tower-aiming.md)

### Overview

Every tower is placed facing N, E, S or W (`R` to rotate, as for wall spikes) and can only fire inside its arc. Archers are fixed with a 90° arc. Cannons (90°/s) and catapults (30°/s) can face anywhere but have to turn onto a target, firing only once their aim is within 5°. The placement overlay shows exactly the tiles a tower could hit for its current facing.

### Architecture decisions

- **One source of truth for angles.** A pure `src/sim/aiming.ts` (`facingAngle`, `angleTo`, `angleBetween`, `inArc`, `turnTowards`) is used by tower targeting *and* the overlay, so what you see is what the tower can hit. It's built and tested first, on its own.
- **Fixed and turning towers share one path.** Targeting filters by range and minimum range as today, plus "inside the arc" for fixed towers. Turning towers (360°) can target anything in range, then turn their `aim` towards the chosen target and only fire inside the aim tolerance. Target choice (closest to the keep) is unchanged.
- **Facing is recorded for every tower, but only traps draw as arrows.** `glyphFor` currently turns *any* faced structure into `▲▶▼◀`. It changes to use arrows only for directional traps, and towers show their facing with a small notch on the tile edge instead. Without this, archers would turn into arrows.
- **Tests express intent, not geometry.** Existing tests that placed archers with the default facing (N) and an enemy to the east get an explicit facing towards the enemy, so they keep testing what they tested before.

### Dependency graph

```
T1 Angle maths (aiming.ts)
 └─ T2 Facing on every tower, arc-limited targeting (fixed towers)
     └─ T3 Turning towers (aim, turn speed, aim tolerance)
         └─ T4 Arc overlay, facing notch, aim line
              └─ T5 Hover info and docs
```

### Task list

- [x] Task 1: Angle maths module
- [x] Task 2: Facing on every tower and arc-limited targeting
- [x] Task 3: Turning towers

**Checkpoint E: aiming works**
- [x] All tests pass (existing tower tests updated to face their targets)
- [x] Browser: an archer ignores enemies behind it; a cannon visibly swings onto targets before firing
- [x] Review with human

- [x] Task 4: Arc overlay, facing notch and aim line
- [x] Task 5: Hover info and docs
- [x] Task 6: Play-test fixes for turning towers (target nearest the barrel; fire once the blast would hit)

**Checkpoint F: module complete**
- [x] All 6 success criteria in `SPEC-tower-aiming.md` met
- [x] Coverage of 80% lines or more for `src/sim/` (99.3%)
- [x] Review with human

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Towers silently turn into arrow glyphs once they have a facing | Med | `glyphFor` restricted to directional traps in Task 2, with a render check at Checkpoint E |
| Turning maths flips direction or jitters across 0°/360° | Med | `turnTowards` tested across the wrap-around, never overshooting; a turning tower settles exactly on its target angle |
| The overlay disagrees with what towers can actually hit | Med | The overlay calls the same `inArc`/range checks as targeting, never its own maths |
| Existing tests break because archers now face N by default | Low | Update those tests to give an explicit facing towards their enemy (same intent). Count the touched tests in the commit message. |
| A fixed 90° archer feels too weak in play | Low | Arc and turn numbers live in config. Tune them at Checkpoint E. |


---

## Module 7: `lobby` (in progress)

Spec: [`SPEC-lobby.md`](../SPEC-lobby.md). Tasks: [`tasks/lobby/todo.md`](lobby/todo.md) (kept apart while `tower-aiming`'s list in `tasks/todo.md` awaits review).

A start screen (name, Play solo, Create room, Join by code) and a waiting room where the host starts the game. The server gains a waiting phase: no ticks and no commands until the host's `start`, with the host passing to the next connected player if they leave.

---

## Module 8: `audio` (done)

Spec: [`SPEC-audio.md`](../SPEC-audio.md)

### Overview

Chiptune sound effects driven by simulation cues, and MIDI music on the title screen and menus, all played by our own small Web Audio synth (pulse with PWM, triangle, saw, sine, noise; ADSR and semitone pitch envelopes). No new dependencies.

### Architecture decisions

- **Pure where possible, Web Audio at the edge.** Note maths, envelopes, cue selection, throttling, MIDI reading and sequencing are pure and unit-tested. Only `synth.ts` touches Web Audio, behind an `AudioEngine` interface with a fake for tests.
- **Sounds come from data, not calls.** The sim appends cues with increasing ids to `state.cues`; the audio layer plays each id once. The same path serves local play and online play (cues ride in snapshots), and network snapshots replacing the state can't cause repeats.
- **Audio starts on the intro screen's gesture.** Browsers block audio until a click or key press. The intro's dismiss is that gesture, which is also exactly when the title theme should start.
- **Tune by ear with a dev sound test.** A dev-only `?soundtest` page lists every sound effect with a play button, so the table in `sounds.ts` can be tuned without playing a game.
- **Original placeholder theme first.** Music is wired up and tested with a short theme we write ourselves; your MIDI files drop into the manifest later.

### Dependency graph

```
T1 Synth voice + pure maths
 └─ T2 Engine, gesture unlock, settings, speaker button
     ├─ T3 Sound table, cue player, UI cues, dev sound test
     │    └─ T4 Sim cues, local and online
     └─ T6 Sequencer, manifest, title and menu music  <── T5 MIDI reader (independent)
          └─ T7 Docs
```

### Task list

- [x] Task 1: Synth voice and pure note maths
- [x] Task 2: Audio engine, gesture unlock and sound settings
- [x] Task 3: Sound-effect table, cue player and UI sounds
- [x] Task 4: Sound cues from the simulation

**Checkpoint G: sound effects**
- [x] Every sound effect heard in a local and an online game; a busy wave stays under the hit cap (measured; listening is yours)
- [x] Review with human (tune the sounds with `?soundtest`)

- [x] Task 5: MIDI file reader
- [x] Task 6: Sequencer and title/menu music
- [x] Task 7: Docs

**Checkpoint H: module complete**
- [x] All 7 success criteria in `SPEC-audio.md` met
- [x] Coverage of 80% lines or more for `src/sim/` and the pure audio modules
- [x] Review with human

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| PWM via two sawtooths and a modulated delay sounds wrong or clicks | Med | Pure test of the delay-time limits for each duty cycle; listen in the sound test early (Task 1/3); fall back to fixed-duty pulses if needed |
| Hit sounds pile up in big waves | Med | Per-cue throttle caps in the table, tested in the cue player |
| Duplicate sounds after network snapshots | Med | Play by cue id, never by state diffing; tested |
| Music timing drifts or stutters | Med | Schedule against the audio clock with a lookahead window; tested in the pure sequencer |
| Too many Web Audio nodes in long sessions | Low | Each voice disconnects itself when it ends; check node counts in a stress wave |
| Browsers block audio | Low | Start only on a gesture; every engine call is a no-op until unlocked; never throws into the game |

---

## Module: `music-packs`

Spec: [`SPEC-music-packs.md`](../SPEC-music-packs.md). A music pack is a folder of MIDI files per category (intro, menu, in-play, game-over) that replaces the built-in songs for any category it has files in. The intro plays once and hands over to menu music; games get in-play music and a game-over song.

**Architecture decisions**
- A Vite plugin (`tools/musicPacks.ts`) scans the pack folders at dev start and build time and exposes `virtual:music-packs`, because a browser can't list a folder.
- Which songs play where is pure (`src/audio/playlist.ts`); the player only plays songs and reports when a play-once song ends.
- Pack contents are git-ignored (copyrighted arrangements stay local).

**Dependency graph**
```
T1 MIDI reader keeps good tracks        (independent)
T2 Pack scan + Vite plugin + gitignore
 └─ T3 Playlist + chosen pack setting
     └─ T4 Player: places, play-once, shuffle, switch
         └─ T5 Wiring in main + Music dropdown
             └─ T6 Docs
```

**Task list** (details in [`tasks/music-packs/todo.md`](music-packs/todo.md))
- [x] Task 1: MIDI reader keeps the good tracks of a file with a broken track
- [x] Task 2: Pack scan and Vite plugin (`virtual:music-packs`), pack contents git-ignored
- [x] Task 3: Playlist (pack songs or defaults, random pick without repeats) and the chosen pack setting
- [x] Task 4: Music player: new places, play-once with an ended callback, shuffle chaining, switch after a fade
- [x] Task 5: Wiring: intro to menu hand-over, in-play, game-over, restart, unlock on direct links; Music dropdown
- [x] Task 6: Docs (README, SPEC-audio, CAPABILITIES)

**Checkpoint (after Task 5):** all tests pass; in the browser the intro hands over to menu music, a game switches to in-play, game over plays its song.

| Risk | Impact | Mitigation |
|---|---|---|
| Busy pack songs (12 channels) get loud or muddy | Low | The limiter catches peaks; channel mapping can be tuned later |
| A song starts during the previous one's fade | Low | Switching starts the next song after the fade ends |

---

## Armies: enemy roster, enemy AI, waves, journal, player units

Capability map: "Armies" in [`CAPABILITIES.md`](../CAPABILITIES.md). Seven modules, built in order. Each slice below becomes a proper task (acceptance criteria, verification, files) in `tasks/todo.md` once that module's spec is approved. The sizes are estimates.

### Overview

Today: one enemy (`g`, 20 HP, speed 1.5, 5 damage per second to structures), one keep-bound flow field, a fixed spawn strip on the left edge, and enemies that vanish after one hit on the keep. After Armies there are 13+ enemy kinds with variants, five kinds of AI, enemies that choose between the keep, houses and towers, waves made up of groups that enter from different edge points, a monster journal, and player units that guard, explore and attack.

### Architecture decisions

- **Stats are resolved at spawn.** `Enemy` gets `kind` and `variant`. HP, speed, attack, attack interval and keep damage are copied onto the enemy when it spawns (kind row x variant multipliers x wave scaling), so per-tick code never looks anything up. The global `STEP` in `enemies.ts` becomes per-enemy speed.
- **Refactor first, behaviour second** (as in `tile-layers` and `players`). The first slice of `enemy-kinds` makes today's enemy "goblin, grunt variant" with identical numbers, so the existing suite passes untouched before anything new arrives.
- **Fields are keyed by (profile, goal), never by enemy.** `state.flow` becomes `state.flows: Map<"follower:keep" | "breacher:house" | ..., FlowField>`. Each is created lazily the first time an enemy needs it and rebuilt when `gridVersion` changes. That's at most 3 profiles x 3 goals = 9 fields. `getFlowField(state)` keeps working as `follower:keep` until callers move over.
- **Behaviours are a table.** `BEHAVIOURS: Record<BehaviourId, (state, enemy) => void>`, with follower as the default, so a new kind is a config row plus at most one function, as SPEC.md already promises.
- **All randomness goes through the state RNG** (variant rolls, wave composition, spawn points, wandering), so online games and tests stay deterministic.
- **Small numbers on the wire.** Snapshots carry `kind` and `variant` as small integers and the client looks up glyph, colour and name. Bump the protocol version.
- **The journal lives in the client only.** Unlocks come from enemies the viewer can see (`canSeeEnemiesAt`), saved per device with every storage call wrapped in try/catch. The simulation knows nothing about it.
- **Edge reachability uses a terrain-only field** (computed from the keep, ignoring structures, cached by `gridVersion`). It's used to check spawn points and replaces `spawnTiles` as the source that `enclosures` and `fog-of-war` measure from.
- **Units are a separate array with a shared combat helper.** `units[]` sits beside `enemies[]`. One `dealDamage(target, amount, by)` applies armour and records kill credit for both. A tile occupancy index, rebuilt each tick, answers "who is on or near this tile" so enemies and units find blockers and targets without O(n²) scans.
- **Field units find their own paths** with A* over explored, walkable tiles. They replan only when their target or `gridVersion` changes, with a per-tick replan budget.

### Dependency graph

```
enemy-kinds ──┬─ bestiary
              ├─ enemy-pathing ── enemy-targeting
              │        └──────────────┐
              ├─ wave-director ◄──────┘ (marine spawns, group templates use leaders)
              └─ units (also tile-layers, fog-of-war)
                   └─ field-units
```

`bestiary` and `units` only need `enemy-kinds`, so they could be built alongside the pathing work if useful. The approved order is still followed by default.

### `enemy-kinds`

| # | Slice | Size |
|---|---|---|
| 1 | Kind and variant table in config; `Enemy.kind`/`variant`; stats copied at spawn; today's enemy becomes goblin (grunt) with identical numbers. Existing suite passes untouched. | M |
| 2 | Per-enemy speed, attack damage and attack interval against structures; roster rows for `G`, `b`/`B`, `d`/`D`, `z`, `w`, spawnable from test helpers | M |
| 3 | Enemies stand and attack the keep with their own stats instead of vanishing; keep-hit cue throttled | M |
| 4 | Variants: a seeded roll at spawn, stat multipliers and a colour shade | S |
| 5 | Drawing, hover info and network: glyph, colour and name per kind and variant; snapshot and protocol carry kind and variant | M |
| 6 | Stopgap mix: until `wave-director`, each wave draws from the kinds unlocked by that wave number, so the roster can be played straight away | S |
| 7 | Docs: README enemy table, SPEC.md "Since `enemy-kinds`" | XS |

**Checkpoint A (after 3):** all tests pass; in the browser a goblin-only game plays as before, except enemies now stay at the keep and hit it. **Review the keep balance with you here.**
**Checkpoint B (after 6):** mixed waves play locally and online; each kind is recognisable on the map.

### `bestiary`

| # | Slice | Size |
|---|---|---|
| 1 | Pure unlock tracker (enemies the viewer can see -> newly unlocked kinds, first wave seen) with device storage | S |
| 2 | Journal panel: unlocked entries (glyph, name, variants, stats, behaviour line), locked entries shown as `?` | M |
| 3 | "New in the journal" notice and sound on unlock | S |

### `enemy-pathing`

Spec: [`SPEC-enemy-pathing.md`](../SPEC-enemy-pathing.md) (approved). Tasks: [`tasks/enemy-pathing/todo.md`](enemy-pathing/todo.md).

**Architecture decisions**
- **Refactor first, fix second, behaviour third.** Task 1 keys fields by profile with only `follower` in use (no behaviour change). Task 2 fixes the existing wander bug on its own, so its effect on the suite is visible in isolation. Only then do new profiles and behaviours arrive.
- **One walkability rule per profile.** `canCross(state, profile, x, y)` is used by the field builder, wandering and the bomber/digger short searches, so no code path can disagree about where an enemy may stand.
- **Behaviours run before movement** and return true when they've used the enemy's turn (`BEHAVIOURS[kind.behaviour]`). Followers, breachers and marines need no behaviour code at all; the profile does the work.
- **Bands borrow the leader's profile** rather than having their own pathing: they read the leader's field and only add "wait if ahead, hurry if behind". When the leader dies they read their own.
- **Short targeted searches are bounded** (6 tiles for bombers, 8 for diggers) breadth-first searches over `canCross` tiles, run only when a target is first spotted, never per tick over the whole map.

**Dependency graph**
```
T1 Fields keyed by profile (refactor)
 └─ T2 Wander respects terrain (bug fix)
     ├─ T3 Breacher profile ─────────────┐
     ├─ T4 Marine profile + m/M          │
     │   (Checkpoint C after T4)         │
     └─ T5 Behaviour table + bombers     │
         ├─ T6 Bands (uses T3: chiefs/thanes breach)
         ├─ T7 Shaman + heal effect
         └─ T8 Ram + diggers
             └─ T9 Hover words and network (mode, banded)
                 └─ T10 Determinism test and docs  (Checkpoint D after T9)
```

| # | Task | Size |
|---|---|---|
| 1 | Fields keyed by profile, follower only (refactor, behaviour unchanged) | S |
| 2 | Wandering only onto tiles the profile can cross (fixes enemies on rock, trees and water) | S |
| 3 | Breacher profile; `d`, `D`, `G` become breachers | M |
| 4 | Marine profile (river 2, sea 4); `m`/`M`; XL field-rebuild timing test | M |
| 5 | Behaviour table and bombers `x`/`X` (sight, sprint, 3x3 blast, explosion cue) | M |
| 6 | Bands: `b` with `B`, `d` with `D`; stopgap mix spawns leaders with bands | M |
| 7 | Shaman `s` and the heal effect | S |
| 8 | Battering ram `R` and diggers `n` (still attackable while digging) | M |
| 9 | Hover words (`sprinting`, `digging`, `with its chief`) and `mode`/`banded` on the wire | S |
| 10 | Determinism test with every kind; README and SPEC.md | S |

**Checkpoint C (after 4):** breachers break through a long maze and followers don't; marines take a river route; nobody stands on rock, trees or water; field rebuild time on an XL map. **Checkpoint D (after 9):** each behaviour seen in the browser via `E`; an online game with two clients stays in sync.

| Risk | Impact | Mitigation |
|---|---|---|
| The wander fix changes existing test outcomes | Med | Its own task and commit; any test that relied on wandering into terrain is a test of the bug |
| Three fields rebuilt on every grid change slow XL maps | Med | Lazy per profile; timing test in Task 4 (under 20 ms for all three) |
| Breachers too eager or too timid | Low | `BREACH` numbers in config; tuned at Checkpoint C |
| Bands bunch up or jitter around a slow leader | Low | Wait-if-ahead uses field distance, not position; hurry factor and leash in config |
| Bomber or digger searches get expensive with many on screen | Low | Searches are bounded and run once per target spotted |
| New kinds need journal descriptions | Low | `description` is required by the type, so the compiler insists |

### `enemy-targeting`

| # | Slice | Size |
|---|---|---|
| 1 | Goal fields for houses and towers per profile (lazy, cached) | M |
| 2 | Scoring (liking x value / reach cost) with low and high intelligence: low always goes for the keep; high chooses at spawn and again on grid change or target loss | M |
| 3 | Medium intelligence: heads for the keep, turns aside to a house or tower it sees if it's cheap to reach | M |
| 4 | Liking and intelligence values per kind in config; hover info shows the current target | S |

**Checkpoint E:** low-intelligence kinds never leave the keep route (test); a raid on houses is seen in play; the balance is reviewed with you.

### `wave-director`

| # | Slice | Size |
|---|---|---|
| 1 | Pure wave composition: a growing threat budget spent on group templates, with kinds unlocked by wave; deterministic from the seed | M |
| 2 | Group spawning: each group spawns from one point, staggered; replaces the stopgap mix | S |
| 3 | Edge spawn points: candidate edge tiles (walkable, nothing built, terrain route to the keep); different groups use different points | M |
| 4 | Remove the fixed spawn zone: `enclosures` and `fog-of-war` measure from the edge; spawn-strip build rules removed | M |
| 5 | Edge warning marker (also shown in fog) and a horn cue when a group is about to enter | S |
| 6 | Marine groups can enter from sea edges | S |

**Checkpoint F (after 4):** enclosure discounts and fog behave sensibly with edge spawns (test with 500 seeds: every chosen spawn point can reach the keep over terrain).

### `units`

> AoE update (2026-10-25): slices 1 and 3 move to `unit-core`. Slice 5 is dropped: guard towers cost gold and their units spawn free. This outline gets rewritten when the `units` spec is drafted.

| # | Slice | Size |
|---|---|---|
| 1 | Unit entity (owner, faction, HP, armour, attack, range, speed, sight), shared `dealDamage`, tile occupancy index; enemies stop and fight a unit on their next tile | M |
| 2 | Guard tower: spawns swordsmen up to a limit, respawn timer, guard spot set by its facing | M |
| 3 | Units give fog sight; drawing, hover info, snapshot and protocol | M |
| 4 | Archer (guards and shoots, moves a little) and paladin (stays put, blocks, high armour) | S |
| 5 | Costs `{ gold, food }` in config; gold charged, food recorded until `resources` | S |
| 6 | Stress test: 200 enemies + 60 units at 20 Hz on an L map, within the tick budget | S |

**Checkpoint G (after 4):** a guard tower's units hold a choke point in play, locally and online.

### `field-units`

| # | Slice | Size |
|---|---|---|
| 1 | A* over explored, walkable land with a replan budget | M |
| 2 | Barracks and scouts: walk to the nearest fog frontier and reveal it | M |
| 3 | Soldier, knight, ranger (part 1): patrol the fog edge and fight enemies they meet (Endless) | M |
| 4 | Part 2: go to a known enemy keep, else to its walls; circle them to see inside, else break through (PvP) | M |
| 5 | Horsemen: explored land only, available once an enemy keep, wall or tower is known | S |

**Checkpoint H:** scouts reveal the map; in PvP, soldiers reach and attack the rival keep.

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Enemies standing at the keep makes games end far sooner | High | Slice 3 is its own checkpoint with your review; keep damage per kind and keep HP are config; tune before moving on |
| Up to 9 fields rebuilt on every grid change slow down XL maps | Med | Lazy fields (only goals in use); measure at Checkpoint C; fall back to rebuilding only on demand per field |
| Edge spawns change what counts as an enclosure | Med | `wave-director` slice 4 is isolated; existing enclosure tests rewritten to state the edge rule; 500-seed reachability test |
| Followers jitter around a moving leader | Low | Followers aim for a spot near the leader on the leader's field, not the leader itself; tune radius in config |
| Many units and enemies make per-tick searches O(n²) | Med | Occupancy index in `units` slice 1; stress test in slice 6 |
| Offensive units have little to do in Endless | Low | Endless behaviour is explore and hunt; full behaviour is tested in PvP and arrives with `mode-barbarians` |
| Online drift from new randomness | Med | All rolls through the state RNG; a determinism test runs the same seed twice and compares state |

### Open questions

1. Keep the stopgap mix (`enemy-kinds` slice 6) so new kinds are playable early, or wait for `wave-director`? Proposed: keep it; it's small and is deleted in `wave-director` slice 2.
2. The other module-level questions are listed in the map and settled in each spec.

---

## AoE update: unit-core

Spec: [`SPEC-unit-core.md`](../SPEC-unit-core.md) (approved). Tasks: [`tasks/todo.md`](todo.md).

### Architecture decisions

- **Sim first, all of it tested offline,** then drawing, then the network. Each sim task ends with a green suite and changes nothing for existing play.
- **Units are their own list,** not a kind of enemy. They share `damageEnemy`, `damageStructure` and the tile-to-tile movement maths, and nothing else.
- **One occupancy index per tick** (units by tile). Enemy blocking, hold targets and PvP towers all read it, so no one scans every unit.
- **Paths are per unit, with a per-tick budget,** found by a multi-goal breadth-first search. Flow fields stay as they are, for enemies only.
- **The spawner is a config row** (`spawner` on `StructureStats`), using `cooldown` as its timer like income does. `unit-core` tests it with a test-only kind, so `STRUCTURES` doesn't change.

### Dependency graph

```
T1 Unit entity, militia, hold, debugUnit
 ├─ T2 Enemies fight units
 ├─ T3 Paths and movement
 │   └─ T4 Spawners
 ├─ T5 Units give fog sight
 └─ T6 PvP towers shoot units
      (T2-T6 all done)
       └─ T7 Drawing, hover, U key
           └─ T8 Network
               └─ T9 Determinism, timing test, docs
```

T2, T3, T5 and T6 each depend only on T1. T4 needs T3, because spawned units have to be able to walk.

### Checkpoints

- **A (after T2):** a militia and a goblin fight to the death in a test, both ways round, and the existing suite passes untouched.
- **B (after T7):** offline browser check: `U` places a militia, goblins stop for it, fog lifts, and HP bars show.
- **C (after T9):** online check with two browsers; 200 units and 200 enemies on XL stay within a 50 ms tick.

### Risks

See the spec's risk table. The main one is sight recomputation now that sight sources move: T5 measures it on an XL map before moving on.

## Later modules: provisional outlines

These are rough vertical slices, not tasks. Each becomes a proper task list after its spec is approved.

### `music-director` (outline only; builds on `audio`)

**Goal:** music follows what the player is doing: an intro piece, menu music, and gameplay music that is either one standard track or switches between **peaceful** and **fight**.

**Behaviour (proposed):**
- **Places:** `intro`, `menu`, `gameplay`, `peaceful` and `fight` join the song manifest's `plays` list. Each place can have **a list of songs** (several fight songs, several peaceful songs, and so on), and the director picks one from the list each time.
- **Intro plays once, to the end.** It starts at the first gesture and isn't cut off by moving to the start screen or starting a game. When it finishes, the director picks what fits *now*: `menu` on the start screen or waiting room, gameplay music once a game is running.
- **Gameplay music has two modes, decided by the song lists** (not a player setting):
  - **Standard:** only `gameplay` songs are listed, so they play all game.
  - **Peaceful/fight:** once `fight` and `peaceful` songs are listed, a `peaceful` song plays while building between waves and a `fight` song while a wave is on. There's a minimum time in each state (e.g. 8 s) so the music doesn't flip with every enemy.
- **Fallbacks:** a missing `fight` or `peaceful` track falls back to `gameplay`; with no gameplay songs at all, it's silent. Missing tracks never cause errors.
- **Transitions** between songs crossfade, or wait for the end of the current phrase (to decide in the spec).
- **Game over** can play a short sting, then return to menu music.
- **Online:** each client decides from its own view of the game. No new server data is needed.

**Slices:**

| # | Slice | Size |
|---|---|---|
| 1 | Pure music director: given the screen (intro, menu, game), whether the intro is still playing, fight/peaceful, and which places have songs listed, which place should be playing; with fallbacks, tested | S |
| 2 | Player and engine support: play once and report when finished; crossfade between two songs (two music sub-buses) | M |
| 3 | Intro to the end, then hand over to menu or gameplay | S |
| 4 | Pure combat detector from game state (wave spawning or enemies on the map, with the minimum-time rule), then peaceful/fight switching in game | M |
| 5 | Song lists: several songs per place, picked from the list each time a place starts; README docs for the new places and lists | S |

**Open questions for its spec:**
1. Can a click skip the intro straight to the menu music?
2. What counts as "fight": any enemy on the map, enemies near the keep, or only while a wave is spawning?
3. Crossfade (smooth, but two songs can clash) or wait for the current phrase or loop to end (more musical, but slower)?
4. Stings for game over, wave cleared, or the keep in danger?
5. How a song is picked from a list: in turn, shuffled, or shuffled without repeats?

**Decided (2026-10-25):** peaceful/fight isn't a player setting. It's decided by the song lists: there's a list of fight songs and a list of peaceful songs, and with only gameplay songs the music is standard.


### `line-of-sight`
1. Grid line-of-sight check between tower and target
2. Ground towers blocked by walls. Elevated towers see over walls and ground towers. Lobbed weapons ignore line of sight.
3. Overlay shows which tiles in range are actually visible

### `units`
Moved to the Armies plan above (now split into `units` and `field-units`).

### `game-setup`
1. Setup screen: pick a mode and the economy toggle, passed into `createGame` as a rules config
2. Endless runs as the first mode with identical behaviour

### `mode-ramparts`
1. Round state machine: build phase -> End turn -> defend (building disabled) -> keep falls
2. Banking: round earnings plus house income carried over; structures repaired
3. Waves restart from wave 1; best-wave tracking

### `resources`
1. Food as a second currency (economy on). Units cost food; with the economy off, units cost gold only.
2. Map deposits (timber, copper, iron, gold ore) with sell values; animals; crops; all finite
3. Gatherer buildings (timber mill, mine, butcher, mill) and worker units that travel, collect and return

### `town-economy`
1. Civic build tab
2. Farm land + farm house (food). Houses + shops (gold); with the economy on, houses consume food.
3. Business price modifiers: cheaper towers, better sell prices

### `mode-barbarians`
1. Larger map and scrolling camera
2. Factions and ownership on every entity; one flow field per target keep
3. AI barbarian scripts: build a keep, walls, towers and units, then send attacks
4. Elimination: an eliminated player's walls stay on the map as neutral ruins

## Open questions

None for `tower-aiming`. Each later module's questions are settled in its spec.
