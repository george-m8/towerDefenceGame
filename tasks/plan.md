# Implementation Plan: Post-MVP Phases

Capability map: [`CAPABILITIES.md`](../CAPABILITIES.md)
Current module spec: [`SPEC-players.md`](../SPEC-players.md)
Task list (current module only): [`tasks/todo.md`](todo.md)
Finished modules: [`tasks/tile-layers/`](tile-layers/todo.md), [`tasks/map-gen/`](map-gen/todo.md)
Previous plan (MVP, complete except a Firefox/Safari smoke test): [`tasks/mvp/`](mvp/plan.md)

## How this plan works

Modules are built one at a time in the approved order. Each module goes spec -> plan -> tasks -> build:

- **The current module** (`players`) has an approved spec, so its tasks are fully written in `tasks/todo.md`.
- **Later modules** have a provisional outline below. Each outline is refined into real tasks only after that module's spec is written and approved. Outlines will change as earlier modules teach us things.
- When a module is finished, its `todo.md` moves to `tasks/<module-id>/` (as the MVP's did), and the next module's tasks take its place.

## Roadmap

| Phase | Module | Status |
|---|---|---|
| 1. Basics | `tile-layers` | Done |
| | `map-gen` | Done (merged in PR #4) |
| 1b. Multiplayer (co-op) | `players` | **Spec approved, tasks written** |
| | `game-server` | Spec needed |
| | `net-client` | Spec needed |
| | `lobby` | Spec needed |
| 1. Basics (continued) | `tower-aiming` | Spec needed |
| | `line-of-sight` | Spec needed |
| | `units` | Spec needed |
| 2. Setup and modes | `game-setup` | Spec needed |
| | `mode-ramparts` | Spec needed |
| 3. Economy | `resources` | Spec needed |
| | `town-economy` | Spec needed |
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

## Module 3: `players` (current)

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
- [ ] Task 4: Votes and connections
- [ ] Task 5: Determinism check and docs

**Checkpoint F: module complete**
- [ ] All 7 success criteria in `SPEC-players.md` met
- [ ] Coverage of 80% lines or more for `src/sim/`
- [ ] Review with human, then move `todo.md` to `tasks/players/` and write the `game-server` spec

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The gold refactor quietly changes single-player behaviour | High | Task 2 removes `state.gold` so the compiler finds every use; the full existing suite must stay green; browser smoke test at Checkpoint E. |
| A damage path skips `damageEnemy`, so some kills pay nobody | Med | Task 1 routes every `enemy.hp -=` through it and adds a test per damage source (single target, splash, trap). A grep for `hp -=` on enemies in review. |
| Splash hits an already-dead enemy and steals the credit | Med | `damageEnemy` ignores enemies at 0 HP or below; tested with two towers on one target. |
| Derived `paused` disagrees with what the UI shows | Low | One function computes it and is called on every vote, connection or player change; the panel only reads it. |
| Task 2 touches many test files | Low | The test changes are mechanical (`state.gold` -> `goldOf(state)`, and `applyCommand(state, cmd)` -> `applyCommand(state, 1, cmd)`); behaviour changes stay in their own tests. |

---

## Later modules: provisional outlines

These are rough vertical slices, not tasks. Each becomes a proper task list after its spec is approved.

### `game-server`
1. Node WebSocket server (`ws`) that runs one sim per room at 20 Hz, with host and port from env vars
2. Typed message format shared with the client: commands in, state updates out (grid when it changes, enemies every update)
3. Join, leave and rejoin mapped to `addPlayer` / `setConnected`; `debugSpawn` blocked
4. LAN play: reachable from other machines; documented in the README

### `net-client`
1. Session interface: `LocalSession` (today's loop) and `NetworkSession`
2. Apply server updates; smooth enemy movement between them
3. Ghosts for placements waiting on the server; connection status; votes and owners shown in the panel

### `lobby`
1. Create or join a room by code or link, with a player name
2. See who's in; start the game

### `tower-aiming`
1. Facing at placement for all towers (reusing `R` rotation) and an arc per tower type
2. Targeting limited to the arc
3. Turn speed: rotating towers turn towards targets over time and fire once aligned
4. Arc overlay (simple now, red highlight later)

### `line-of-sight`
1. Grid line-of-sight check between tower and target
2. Ground towers blocked by walls. Elevated towers see over walls and ground towers. Lobbed weapons ignore line of sight.
3. Overlay shows which tiles in range are actually visible

### `units`
1. Unit entity with faction, HP and attack. Enemies stop and fight units that block them.
2. Spawner tower: spawn direction, unit limit, respawn timer
3. Behaviours one at a time: hold position (block), charge enemies in sight, guard and shoot
4. Unit stat variety (health, attack, range) in config

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

None for `players`. Each later module's questions are settled in its spec.
