# Tasks: map-gen

Spec: [`SPEC-map-gen.md`](../SPEC-map-gen.md) | Plan: [`plan.md`](plan.md) | Map: [`CAPABILITIES.md`](../CAPABILITIES.md)

Standard verification for every task (in addition to task-specific checks):
`npm run typecheck && npm test && npm run build`

---

## Phase C: Terrain and the generator

## Task 1: Terrain rules for walking and building

**Description:** Extend `Terrain` to `"ground" | "ford" | "river" | "sea" | "rock" | "tree"` with a `TERRAIN` table in config (walkable; buildable `any` / `bridgeOnly` / `none`). Add grid helpers `terrainAt` and `isWalkable` (terrain walkable, or a bridge on it once bridges exist). Pathfinding skips non-walkable tiles entirely. `canBuild` rejects sea, rock and trees ("Can't build on rock" etc.) and allows only bridges on rivers (the bridge kind arrives in Task 2, so for now every build on a river is rejected). The renderer draws terrain colours and glyphs. Tests set terrain by hand.

**Acceptance criteria:**
- [x] Enemy routes never include sea, river, rock or tree tiles. Fords behave like ground.
- [x] Building on sea, rock, tree or river is rejected with a clear reason. Ground and fords work as before.
- [x] Terrain is drawn by the renderer (visual check moved to Checkpoint C, once the generator puts terrain on the map)

**Verification:**
- [x] `npm test` (new `tests/sim/terrain.test.ts`)
- [x] Manual: terrain renders with the spec's glyphs and colours (checked at Checkpoint C)

**Dependencies:** None

**Files likely touched:** `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/grid.ts`, `src/sim/pathfinding.ts`, `src/render/canvas.ts` + `palette.ts`, `tests/sim/terrain.test.ts`

**Estimated scope:** M

---

## Task 2: Bridges over rivers

**Description:** Add the `bridge` structure (base layer, cost 10, no HP, doesn't block, doesn't accept a mount, key `8`, glyph `=`). It can be built only on river tiles, and `isWalkable` treats a bridged river as walkable. Selling a bridge is rejected while an enemy is on it.

**Acceptance criteria:**
- [x] A bridge can be built only on a river tile, and anything else on a river is still rejected
- [x] A river that blocked the only route becomes crossable once bridged; enemies reroute over it
- [x] Selling a bridge with an enemy on it is rejected; otherwise it refunds as usual

**Verification:**
- [x] `npm test` (`tests/sim/terrain.test.ts` bridge cases)
- [x] Manual: bridge a river and watch the path overlay (`D`) reroute (checked at Checkpoint C)

**Dependencies:** Task 1

**Files likely touched:** `src/sim/config.ts`, `src/sim/grid.ts`, `src/sim/economy.ts`, `src/ui/state.ts`, `src/render/palette.ts`, `tests/sim/terrain.test.ts`

**Estimated scope:** S

---

## Task 3: Map generator with coast, river, fords and guarantees

**Description:** Add `src/sim/mapgen.ts` with `generateMap(state)` using the game's seeded rng and `MAP_GEN` config:
- coast band on a random non-spawn edge
- one meandering river in any direction, with 1-2 fords
- clear zones (a 4-tile ring around the keep, the spawn plus 2 columns)
- route validation with capped, deterministic regeneration

`createGame(seed, options?)` runs it unless `options.blankMap` is set. Existing tests move to blank maps through the test helpers. Show the seed in the panel.

**Acceptance criteria:**
- [x] Same seed gives an identical map, and different seeds give different maps
- [x] For 500 seeds: a walkable route exists from every spawn tile to the keep, the keep ring and spawn columns are clear, there's exactly one coast and one river, and each river has 1-2 fords
- [x] Works on a 96x64 state with the same guarantees. Regeneration attempts are capped and the fallback is tested.

**Verification:**
- [x] `npm test` (new `tests/sim/mapgen.test.ts`; all existing tests green on `blankMap`)
- [x] Manual: reload a few times. Each map has a coast and a river, and enemies cross only at fords.

**Dependencies:** Task 2

**Files likely touched:** `src/sim/mapgen.ts`, `src/sim/game.ts`, `src/sim/config.ts`, `src/sim/types.ts`, `tests/sim/mapgen.test.ts`, `tests/sim/helpers.ts` (+ `createGame` calls in existing tests)

**Estimated scope:** M (the test-file updates are mechanical)

---

### Checkpoint C: generated maps
- [x] All tests pass, including the 500-seed guarantee tests
- [x] Browser: several seeds look right; enemies use fords or bridges and never cross water (found and fixed: fords that did not cross, path arrows drawn on water)
- [ ] Review with human before adding the remaining features

---

## Phase D: Map features

## Task 4: Rocks, forests and clearing trees

**Description:** Generator passes for rock clusters (2-8 tiles) and forest patches (4-15 trees), with counts from per-1,000-tile densities, outside the clear zones and without breaking the route guarantee. The X tool on a tree clears it for `TREE_CLEAR_GOLD`, turning it into ground (bumps `gridVersion`). Rocks can't be cleared.

**Acceptance criteria:**
- [x] Maps contain rock clusters and forests, and guarantees still hold for 500 seeds
- [x] Clearing a tree pays its gold, makes the tile ground and lets enemies use it. Clearing rock is rejected.
- [x] Feature counts scale with map area (96x64 has noticeably more than 48x32)

**Verification:**
- [x] `npm test` (`tests/sim/mapgen.test.ts`, `tests/sim/terrain.test.ts`)
- [x] Manual: clear a line of trees with X and watch the path overlay change

**Dependencies:** Task 3

**Files likely touched:** `src/sim/mapgen.ts`, `src/sim/config.ts`, `src/sim/economy.ts`, `tests/sim/mapgen.test.ts`, `tests/sim/terrain.test.ts`

**Estimated scope:** S

---

## Task 5: Ruins

**Description:** Add the `ruin` structure (base layer, blocks, accepts a mount, not buildable by the player, glyph `#` in dark grey). The generator places fragments (lines, L shapes, broken squares) of 3-8 tiles at 40-80% HP, outside the clear zones. Selling a ruin pays `RUIN_SALVAGE_GOLD`, scaled by HP.

**Acceptance criteria:**
- [x] Ruins start damaged, block movement, can hold a tower, and are attacked only when sealing the route
- [x] Ruins aren't in the build tools, and `canBuild` rejects the ruin kind
- [x] Selling a ruin pays salvage scaled by HP. Guarantees hold for 500 seeds, and every ruin is reachable.

**Verification:**
- [x] `npm test` (`tests/sim/mapgen.test.ts`, `tests/sim/layers.test.ts`, `tests/sim/economy.test.ts`)
- [x] Manual: put an archer on a ruin; sell a ruin

**Dependencies:** Task 3

**Files likely touched:** `src/sim/config.ts`, `src/sim/mapgen.ts`, `src/sim/grid.ts`, `src/sim/economy.ts`, `src/render/palette.ts` (+ tests)

**Estimated scope:** M

---

## Task 6: Treasure chests

**Description:** Add `features: MapFeature[]` to the game state with a `chest` kind (gold 20-60, scaled by distance from the keep). The generator places chests on reachable open ground. Building anything on a chest tile adds its gold and removes it. Chests are drawn as `$`.

**Acceptance criteria:**
- [x] Building on a chest tile pays its gold once and removes the chest
- [x] Enemies walking over a chest leave it untouched
- [x] Chests further from the keep are worth more. Every chest is reachable (500 seeds).

**Verification:**
- [x] `npm test` (`tests/sim/mapgen.test.ts`, `tests/sim/economy.test.ts`)
- [x] Manual: build a wall on a `$` and watch gold jump

**Dependencies:** Task 3

**Files likely touched:** `src/sim/types.ts`, `src/sim/mapgen.ts`, `src/sim/game.ts` (or `grid.ts` placement), `src/render/canvas.ts` (+ tests)

**Estimated scope:** S

---

## Task 7: Seed display, terrain hover info and docs

**Description:** Hover info describes terrain ("River - bridge it to cross", "Tree - X to clear for 1g", "Ford"), ruins (salvage value) and chests (gold). The seed is shown in the panel (from Task 3) and on the game-over dialog. README gains a "The map" section (terrain table, bridges, trees, ruins, chests) and key `8`. `SPEC.md` gets a pointer to `SPEC-map-gen.md`.

**Acceptance criteria:**
- [x] Hovering every terrain type and feature gives a helpful description
- [x] The seed is visible during play and on game over
- [x] README and `SPEC.md` describe the map accurately

**Verification:**
- [x] `npm run build`
- [x] Manual: hover each terrain and feature type (swept in the browser); screenshot a generated map for review
- [ ] Manual: seed on the game-over dialog (not seen in the browser; covered by typecheck and build only)

**Dependencies:** Tasks 4, 5, 6

**Files likely touched:** `src/ui/tileInfo.ts`, `src/ui/gameOver.ts`, `src/ui/panel.ts`, `README.md`, `SPEC.md`

**Estimated scope:** M

---

### Checkpoint D: map-gen complete
- [x] All 7 success criteria in `SPEC-map-gen.md` met
- [x] `npm run coverage` passes (99.3% lines for `src/sim/`)
- [ ] Review with human, then move this file to `tasks/map-gen/` and start the `tower-aiming` spec
