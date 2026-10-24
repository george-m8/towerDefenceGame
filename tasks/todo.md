# Tasks: tile-layers

Spec: [`SPEC-tile-layers.md`](../SPEC-tile-layers.md) | Plan: [`plan.md`](plan.md) | Map: [`CAPABILITIES.md`](../CAPABILITIES.md)

Standard verification for every task (in addition to task-specific checks):
`npm run typecheck && npm test && npm run build`

---

## Phase A: Refactor (no behaviour change)

## Task 1: Layer data model behind grid helpers

**Description:** Replace `GameState.tiles` with `terrain: Terrain[]` (all `"ground"` for now), `base: number[]` and `mount: number[]`. Add `layer: "base" | "mount"` to every structure kind in `config.ts` (archer, cannon and catapult are mounts; everything else is base) and `acceptsMount: true` on walls. Add the grid helpers `baseAt`, `mountAt`, `topAt`, `blocksAt`, `attackTargetAt` and `isElevated`. `placeStructure` writes to the layer from config. Keep `structureAt` as a temporary alias for `topAt`, so no caller changes yet.

**Acceptance criteria:**
- [x] `createGame` builds `terrain`, `base` and `mount`. The keep lives in `base`. `tiles` no longer exists.
- [x] Towers placed on empty ground go into `mount`. Walls, spikes and houses go into `base`.
- [x] New helper unit tests pass, and all 73 existing tests pass unchanged (apart from tests that read `tiles` directly, if any)

**Verification:**
- [x] `npm test` (new `tests/sim/layers.test.ts` for the helpers)
- [x] `npm run typecheck && npm run build`

**Dependencies:** None

**Files likely touched:** `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/grid.ts`, `src/sim/game.ts`, `tests/sim/layers.test.ts`

**Estimated scope:** M

---

## Task 2: Move callers to explicit layer helpers

**Description:** Switch every caller off `structureAt` and delete it:
- pathfinding cost and keep sources use `blocksAt` / `base`
- enemy movement uses `blocksAt` and `attackTargetAt`
- selling and hover use `topAt`
- the renderer draws base then mount
- tests use the explicit helpers

No rule changes.

**Acceptance criteria:**
- [x] `structureAt` and every direct `state.base` / `state.mount` read outside `grid.ts` are gone (a grep check)
- [x] All existing tests pass, and the game looks and plays exactly as before

**Verification:**
- [x] `npm test`
- [x] `grep -rn "structureAt\|state\.base\|state\.mount" src --include=*.ts | grep -v src/sim/grid.ts` returns nothing
- [x] Manual: build walls, towers and spikes, sell something, run two waves. No visible difference.

**Dependencies:** Task 1

**Files likely touched:** `src/sim/pathfinding.ts`, `src/sim/enemies.ts`, `src/sim/economy.ts`, `src/render/canvas.ts`, `src/ui/tileInfo.ts` (plus test imports)

**Estimated scope:** M

---

### Checkpoint A: refactor complete
- [x] All MVP tests plus helper tests pass, build clean
- [x] Browser smoke test shows no behaviour change
- [ ] Review with human before adding new rules

---

## Phase B: Towers on walls

## Task 3: Towers can be placed on walls

**Description:** Update `canBuild` per the spec's placement rules:
- a base needs empty ground and no ground tower
- a mount goes on empty ground, or on a base with `acceptsMount` and no mount yet
- mounts are rejected on floor spikes, wall spikes, houses, the keep and the spawn zone
- the enemy-occupied check applies only to ground placements

The placement ghost already calls `canBuild`, so wall tiles show green for tower tools automatically.

**Acceptance criteria:**
- [x] Placement matrix passes: every kind against ground, wall, wall spikes, floor spikes, house, keep, spawn, and an occupied mount, with the expected result and reason
- [x] A tower can be placed on a wall even when an enemy is standing next to it, and the wall still blocks
- [x] A wall can't be built under an existing ground tower

**Verification:**
- [x] `npm test` (`tests/sim/layers.test.ts` placement matrix)
- [x] Manual: paint a wall line, place archers on it (green ghost), and try a tower on wall spikes (red ghost with a reason)

**Dependencies:** Task 2

**Files likely touched:** `src/sim/grid.ts`, `tests/sim/layers.test.ts`, `tests/sim/grid.test.ts`

**Estimated scope:** S

---

## Task 4: Walls protect, and drop, their towers

**Description:** Prove and finish the combat rules across layers:
- an enemy blocked at a wall-mounted tower's tile hits the wall, not the tower
- a ground tower in the way is hit directly
- `removeStructure` on a base removes its mount too, which bumps `gridVersion` so enemies reroute

**Acceptance criteria:**
- [x] With the keep sealed by a wall carrying an archer, the wall takes all the damage and the archer keeps full HP until the wall falls
- [x] When that wall falls, the archer is removed in the same tick, with no refund, and enemies continue through
- [x] A ground tower sealing the route is attacked directly, and ground towers with an open route around them take no damage

**Verification:**
- [x] `npm test` (`tests/sim/layers.test.ts` combat cases; extended "no damage when an open route exists" test in `tests/sim/enemies.test.ts`)
- [x] Manual: wall in the keep with archers on the wall, then watch the wall break and the archer vanish with it

**Dependencies:** Task 3

**Files likely touched:** `src/sim/grid.ts`, `tests/sim/layers.test.ts`, `tests/sim/enemies.test.ts`

**Estimated scope:** S

---

## Task 5: Selling takes the top layer first

**Description:** The sell command uses `topAt`: it sells a mount if present, otherwise the base. Refund rules are unchanged.

**Acceptance criteria:**
- [x] Selling a wall-mounted archer refunds the archer and leaves the wall. Selling again refunds the wall.
- [x] Selling a ground tower or a plain base works as before. Keep and empty-tile rejections are unchanged.

**Verification:**
- [x] `npm test` (`tests/sim/economy.test.ts` selling cases)
- [x] Manual: X-click a wall-mounted archer twice

**Dependencies:** Task 3

**Files likely touched:** `src/sim/economy.ts`, `tests/sim/economy.test.ts`

**Estimated scope:** XS

---

## Task 6: Wall-mounted visuals, hover info and docs

**Description:** Draw wall-mounted towers on the wall's colour with the tower glyph in the tower's colour and a thin top border. Ground towers are drawn as today. Hover info shows `Archer (on wall)` / `Archer (ground)` plus the HP of both layers. Update README (structures table and a short "towers on walls" note) and `SPEC.md` where its rules now differ (towers no longer block as walls).

**Acceptance criteria:**
- [x] Wall-mounted and ground towers are clearly distinguishable at a glance
- [x] Hover info shows the elevation and both HP values for a wall-mounted tower
- [x] README and `SPEC.md` describe the layered rules accurately

**Verification:**
- [x] `npm run build`
- [x] Manual: screenshot of a wall line with archers next to ground cannons; hover both

**Dependencies:** Tasks 4, 5

**Files likely touched:** `src/render/canvas.ts`, `src/render/palette.ts`, `src/ui/tileInfo.ts`, `README.md`, `SPEC.md`

**Estimated scope:** M

---

### Checkpoint B: tile-layers complete
- [x] All 7 success criteria in `SPEC-tile-layers.md` met
- [x] `npm run coverage` passes (98.7% lines for `src/sim/`)
- [ ] Review with human, then move this file to `tasks/tile-layers/` and start the `map-gen` spec
