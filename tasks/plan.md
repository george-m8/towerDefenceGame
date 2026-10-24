# Implementation Plan: Post-MVP Phases

Capability map: [`CAPABILITIES.md`](../CAPABILITIES.md)
Current module spec: [`SPEC-tower-aiming.md`](../SPEC-tower-aiming.md)
Task list (current module only): [`tasks/todo.md`](todo.md)
Finished modules: [`tasks/tile-layers/`](tile-layers/todo.md), [`tasks/map-gen/`](map-gen/todo.md)
Previous plan (MVP, complete except a Firefox/Safari smoke test): [`tasks/mvp/`](mvp/plan.md)

## How this plan works

Modules are built one at a time in the approved order. Each module goes spec -> plan -> tasks -> build:

- **The current module** has an approved spec, so its tasks are fully written in `tasks/todo.md`.
- **Later modules** have a provisional outline below. Each outline is refined into real tasks only after that module's spec is written and approved. Outlines will change as earlier modules teach us things.
- When a module is finished, its `todo.md` moves to `tasks/<module-id>/` (as the MVP's did), and the next module's tasks take its place.

## Roadmap

| Phase | Module | Status |
|---|---|---|
| 1. Basics | `tile-layers` | Done |
| | `map-gen` | Done |
| | `tower-aiming` | **Built, awaiting review** |
| | `line-of-sight` | Spec drafted |
| | `units` | Spec drafted |
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
- [x] Review with human

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
- [x] Review with human

- [x] Task 4: Rocks, forests and clearing trees
- [x] Task 5: Ruins
- [x] Task 6: Treasure chests
- [x] Task 7: Seed display, terrain hover info and docs

**Checkpoint D: module complete**
- [x] All 7 success criteria in `SPEC-map-gen.md` met
- [x] Coverage of 80% lines or more for `src/sim/` (99.3%)
- [x] Review with human

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A generated map cuts the keep off from the spawn | High | A route check runs after every generation, with deterministic regeneration on failure. Tested on 500 seeds and on a 96x64 map. |
| Regeneration loops forever on a pathological size or config | Med | Cap the attempts (e.g. 20), then fall back to a map with only the features that passed (or a blank map) and log it. The cap is tested. |
| Generated maps feel samey or ugly | Med | All shapes and densities live in `MAP_GEN` config. Review several seeds at Checkpoint C before adding more features. |
| The terrain change breaks existing tests | Med | Existing tests move to `blankMap` in Task 3, the same commit that turns generation on. The suite must stay green. |
| Enemies walk onto impassable tiles mid-move after a tree is cleared or a bridge is sold | Low | Terrain only ever gets more walkable at runtime (clearing trees, building bridges). Selling a bridge is rejected while an enemy is on it, like building. |


---

## Module 3: `tower-aiming` (current)

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
- [ ] Review with human

- [x] Task 4: Arc overlay, facing notch and aim line
- [x] Task 5: Hover info and docs
- [x] Task 6: Play-test fixes for turning towers (target nearest the barrel; fire once the blast would hit)

**Checkpoint F: module complete**
- [x] All 6 success criteria in `SPEC-tower-aiming.md` met
- [x] Coverage of 80% lines or more for `src/sim/` (99.3%)
- [ ] Review with human

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Towers silently turn into arrow glyphs once they have a facing | Med | `glyphFor` restricted to directional traps in Task 2, with a render check at Checkpoint E |
| Turning maths flips direction or jitters across 0°/360° | Med | `turnTowards` tested across the wrap-around, never overshooting; a turning tower settles exactly on its target angle |
| The overlay disagrees with what towers can actually hit | Med | The overlay calls the same `inArc`/range checks as targeting, never its own maths |
| Existing tests break because archers now face N by default | Low | Update those tests to give an explicit facing towards their enemy (same intent). Count the touched tests in the commit message. |
| A fixed 90° archer feels too weak in play | Low | Arc and turn numbers live in config. Tune them at Checkpoint E. |


---

## Later modules: provisional outlines

These are rough vertical slices, not tasks. Each becomes a proper task list after its spec is approved.

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

None for `tile-layers`. Each later module's questions are settled in its spec.
