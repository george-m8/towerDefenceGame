# Implementation Plan: Post-MVP Phases

Capability map: [`CAPABILITIES.md`](../CAPABILITIES.md)
Current module spec: [`SPEC-tile-layers.md`](../SPEC-tile-layers.md)
Task list (current module only): [`tasks/todo.md`](todo.md)
Previous plan (MVP, complete except a Firefox/Safari smoke test): [`tasks/mvp/`](mvp/plan.md)

## How this plan works

Modules are built one at a time in the approved order. Each module goes spec -> plan -> tasks -> build:

- **The current module** (`tile-layers`) has an approved spec, so its tasks are fully written in `tasks/todo.md`.
- **Later modules** have a provisional outline below. Each outline is refined into real tasks only after that module's spec is written and approved. Outlines will change as earlier modules teach us things.
- When a module is finished, its `todo.md` moves to `tasks/<module-id>/` (as the MVP's did), and the next module's tasks take its place.

## Roadmap

| Phase | Module | Status |
|---|---|---|
| 1. Basics | `tile-layers` | **Spec approved, tasks ready** |
| | `map-gen` | Spec needed |
| | `tower-aiming` | Spec needed |
| | `line-of-sight` | Spec needed |
| | `units` | Spec needed |
| 2. Setup and modes | `game-setup` | Spec needed |
| | `mode-ramparts` | Spec needed |
| 3. Economy | `resources` | Spec needed |
| | `town-economy` | Spec needed |
| 4. Multiplayer-style | `mode-barbarians` | Spec needed |

---

## Module 1: `tile-layers` (current)

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
- [ ] Task 5: Selling takes the top layer first
- [ ] Task 6: Wall-mounted visuals, hover info and docs

**Checkpoint B: module complete**
- [ ] All 7 success criteria in `SPEC-tile-layers.md` met
- [ ] Coverage of 80% lines or more for `src/sim/`
- [ ] Review with human

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The refactor silently changes behaviour (pathfinding, attacks) | High | Tasks 1-2 add no rules. The full MVP suite must stay green, plus a browser smoke test at Checkpoint A. |
| Ghost tower on a wall looks valid but the build is rejected (UI and sim disagree) | Med | The ghost already calls `canBuild`. Keep it that way, so there is one rule source. |
| An enemy attacks a ground tower that isn't actually on its route | Med | No new attack logic: enemies still only attack the tile their flow-field step lands on. Covered by the existing "no damage when an open route exists" test, extended to ground towers. |
| Two-click selling (tower, then wall) feels fiddly | Low | Accepted per spec. Revisit after play-testing. |

---

## Later modules: provisional outlines

These are rough vertical slices, not tasks. Each becomes a proper task list after its spec is approved.

### `map-gen`
1. Terrain types (water, rock) in pathfinding and placement, unwalkable and unbuildable
2. Seeded generator: coastline and river shapes, rock clusters, with a guaranteed open route from spawn to keep
3. Bridges: a buildable base on river tiles that makes them walkable
4. Ruin wall fragments (neutral, pre-damaged, can be built on)
5. Loot caches that pay gold when reached or built over
6. Hooks for resource features (deposits, animals, crops) used later by `resources`

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

None for `tile-layers`. Each later module's questions are settled in its spec.
