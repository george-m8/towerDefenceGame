# Tasks: Tower Defence MVP - Endless Keep

Spec: [`SPEC.md`](../SPEC.md) | Plan: [`plan.md`](plan.md)

Standard verification for every task (in addition to task-specific checks):
`npm run typecheck && npm test && npm run build`

---

## Phase 1: Foundation

## Task 1: Project scaffold and empty grid render

**Description:** Set up Vite (vanilla-ts), strict TypeScript, Vitest and Prettier with the npm scripts from the spec. Render a 48x32 grid of coloured squares on a Canvas next to an empty side panel. Create the README with setup instructions. Run `git init` with a `.gitignore` (approved).

**Acceptance criteria:**
- [x] `npm install && npm run dev` serves a page showing a 48x32 grid on a canvas and a side panel placeholder
- [x] All scripts in SPEC.md "Commands" exist and run (`test` passes with one trivial test)
- [x] README.md covers install, dev, test and build

**Verification:**
- [x] `npm run typecheck && npm test && npm run build`
- [x] Manual: open http://localhost:5173, grid is visible, no console errors

**Dependencies:** None

**Files likely touched:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`, `README.md`, `.gitignore`

**Estimated scope:** M (mostly config)

---

## Task 2: Simulation core and game loop

**Description:** Create the pure simulation skeleton: `types.ts`, `config.ts`, seeded `rng.ts`, and `game.ts` with `createGame(seed)`, `tick(state)` and `applyCommand(state, cmd)`. The state contains the grid, a 3x3 keep at the centre with HP, a spawn zone on the left edge, gold, tick count and paused flag. `main.ts` runs a fixed-timestep loop (20 ticks/s, capped catch-up). The renderer draws the keep (`K`) and spawn zone from state. Space toggles pause.

**Acceptance criteria:**
- [x] `createGame` produces a grid with the keep centred and the spawn zone marked, and starting gold of 150
- [x] `tick` advances the tick count only when not paused. The `togglePause` command works.
- [x] Same seed + same commands -> identical state (determinism test)

**Verification:**
- [x] `npm test` (tests in `tests/sim/game.test.ts`, `tests/sim/rng.test.ts`)
- [x] Manual: keep and spawn zone render, and a tick counter in the panel stops when Space is pressed

**Dependencies:** Task 1

**Files likely touched:** `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/rng.ts`, `src/sim/game.ts`, `src/render/canvas.ts`, `src/render/palette.ts`, `src/main.ts`, `tests/sim/*`

**Estimated scope:** M

---

## Task 3: Wall placement with gold

**Description:** Add the `build` command and placement rules in `grid.ts`: in bounds, tile empty, not the keep, not the spawn zone, enough gold. Wall config row (cost 5, HP 50, `#`). `input.ts` maps mouse to tiles: selected tool + click places, drag paints. Right click / Esc clears the tool. The panel shows gold and the selected tool. Rejected placements show a brief reason.

**Acceptance criteria:**
- [x] Walls can be placed by click and by drag-painting, deducting 5 gold each
- [x] Placement is rejected (with a reason) on occupied, keep, spawn-zone or out-of-bounds tiles, or with too little gold
- [x] Placement works while paused

**Verification:**
- [x] `npm test` (`tests/sim/grid.test.ts` covers every rejection rule)
- [x] Manual: paint a wall line, watch gold drop, try building on the keep and spawn zone and see it rejected

**Dependencies:** Task 2

**Files likely touched:** `src/sim/grid.ts`, `src/sim/config.ts`, `src/sim/game.ts`, `src/ui/input.ts`, `src/ui/panel.ts`, `tests/sim/grid.test.ts`

**Estimated scope:** M

---

### Checkpoint 1: Foundation
- [x] `npm run typecheck && npm test && npm run build` pass
- [x] Grid, keep and spawn zone visible. Walls can be painted, gold decreases, pause works.
- [ ] Review with human before proceeding

---

## Phase 2: Enemies and Waves

## Task 4: Flow field pathfinding and debug overlay

**Description:** Implement `pathfinding.ts`: Dijkstra from all keep tiles outwards with a binary heap. Open/walkable tiles cost 1, blocking structures cost `BLOCKED_COST` (greater than the tile count). Store per-tile distance and a `nextStep` direction with fixed tie-breaking order. Recompute lazily when `gridVersion` changes. Add a debug overlay toggle (`D` key) that renders distances or arrows.

**Acceptance criteria:**
- [ ] On an open grid, every tile's path leads to the keep in Manhattan-distance steps
- [ ] A long open detour is preferred over a short route through one wall
- [ ] When the keep is fully enclosed, the path from the spawn zone crosses exactly the structure with the cheapest total route. Placing or removing a wall updates the field on the next tick.

**Verification:**
- [ ] `npm test` (`tests/sim/pathfinding.test.ts`: open grid, detour vs wall, fully enclosed, update after change, deterministic ties)
- [ ] Manual: press `D`, build a wall maze and watch the arrows reroute

**Dependencies:** Task 3

**Files likely touched:** `src/sim/pathfinding.ts`, `src/sim/types.ts`, `src/sim/game.ts`, `src/render/canvas.ts`, `src/ui/input.ts`, `tests/sim/pathfinding.test.ts`

**Estimated scope:** M

---

## Task 5: Enemies walk to the keep, keep HP, game over and restart

**Description:** Add the enemy entity (HP, speed 1.5 tiles/s, continuous position) and `enemies.ts` movement. Enemies choose their next tile on reaching a tile centre using the flow field. On reaching the keep they deal 5 damage and are removed. Keep HP is shown in the panel. At HP <= 0 the game stops, a game-over dialog shows the wave reached, and `restart` creates a new game. Temporary dev key `E` spawns one enemy (removed or hidden behind a dev flag in T7). Building on a tile occupied by an enemy is rejected.

**Acceptance criteria:**
- [ ] Spawned enemies follow the flow field and visibly route around walls
- [ ] Reaching the keep reduces keep HP by 5 and removes the enemy. HP 0 triggers game over and restart works.
- [ ] Building on an enemy-occupied tile is rejected

**Verification:**
- [ ] `npm test` (`tests/sim/enemies.test.ts`: reaches keep in the expected number of ticks on an open grid, reroutes after a wall is placed, keep damage, game over)
- [ ] Manual: spawn enemies with `E`, wall off a route and watch them go around, let the keep die, restart

**Dependencies:** Task 4

**Files likely touched:** `src/sim/enemies.ts`, `src/sim/types.ts`, `src/sim/game.ts`, `src/render/canvas.ts`, `src/ui/panel.ts`, `tests/sim/enemies.test.ts`

**Estimated scope:** M

---

## Task 6: Blocked path - enemies attack and destroy structures

**Description:** When an enemy's next tile holds a blocking structure, it stops and deals 5 damage/s to it. At 0 HP the structure is removed, `gridVersion` bumps, the field recomputes and enemies continue. Damaged structures render with a visual cue (dimmed colour or HP shading).

**Acceptance criteria:**
- [ ] With the keep fully enclosed, enemies attack the structure on the cheapest route and nothing else
- [ ] A destroyed structure is removed, and enemies continue through the gap
- [ ] With any open route available, no structure takes damage

**Verification:**
- [ ] `npm test` (`tests/sim/enemies.test.ts`: enclosed keep breach timing, no damage when an open route exists)
- [ ] Manual: fully wall in the keep, spawn enemies, watch them breach one wall

**Dependencies:** Task 5

**Files likely touched:** `src/sim/enemies.ts`, `src/sim/grid.ts`, `src/render/canvas.ts`, `tests/sim/enemies.test.ts`

**Estimated scope:** S

---

## Task 7: Endless waves with countdown and early send

**Description:** `waves.ts`: wave N spawns `5 + 3N` enemies with HP `20 * (1 + 0.15 * (N - 1))`, staggered 0.5s apart across random spawn-zone tiles (seeded rng). A 20s countdown starts after a wave finishes spawning. A `sendWave` command skips the countdown and awards +1 gold per full second skipped. The panel shows the wave number, countdown and a "Send next wave" button. The dev `E` key goes behind a dev flag.

**Acceptance criteria:**
- [ ] Wave N spawns exactly `5 + 3N` enemies with the scaled HP
- [ ] The countdown runs between waves, and `sendWave` starts the next wave immediately with the correct bonus gold. Waves can overlap.
- [ ] Waves continue indefinitely

**Verification:**
- [ ] `npm test` (`tests/sim/waves.test.ts`: counts and HP for waves 1, 5 and 20, countdown timing, early send, spawn stagger)
- [ ] Manual: play through 3+ waves, use "Send next wave"

**Dependencies:** Task 5 (Task 6 recommended first for the full experience, but not required)

**Files likely touched:** `src/sim/waves.ts`, `src/sim/config.ts`, `src/sim/game.ts`, `src/ui/panel.ts`, `tests/sim/waves.test.ts`

**Estimated scope:** M

---

### Checkpoint 2: Playable without defences
- [ ] All tests pass, build clean
- [ ] Waves spawn endlessly. Enemies route around walls, breach when fully enclosed, and can kill the keep. Restart works.
- [ ] Review with human before proceeding

---

## Phase 3: Defences and Economy

## Task 8: Archer tower, targeting, bounties and range overlay

**Description:** Add the Archer config row (cost 25, HP 40, range 5, 1 shot/s, `A`). `towers.ts` adds `updateTower` with cooldown and targeting (the in-range enemy with the lowest flow-field distance, ties broken by id), with instant-hit damage. Dead enemies award their bounty (2 gold, +1 every 5 waves). Show a brief shot line/flash. Show a range overlay when hovering a tower or holding a tower tool. Towers block movement and can be attacked like walls.

**Acceptance criteria:**
- [ ] Archers fire at most once per second at the in-range enemy closest to the keep
- [ ] Killing an enemy awards the correct bounty
- [ ] The range overlay shows on hover and while placing

**Verification:**
- [ ] `npm test` (`tests/sim/towers.test.ts`: range edge cases, fire rate, target selection; `tests/sim/economy.test.ts`: bounty by wave)
- [ ] Manual: build archers along the path and watch kills and gold rise

**Dependencies:** Task 7

**Files likely touched:** `src/sim/towers.ts`, `src/sim/economy.ts`, `src/sim/config.ts`, `src/sim/game.ts`, `src/render/canvas.ts`, `tests/sim/towers.test.ts`, `tests/sim/economy.test.ts`

**Estimated scope:** M

---

## Task 9: Cannon and Catapult (splash, minimum range)

**Description:** Add the Cannon config row (cost 50, HP 60, range 4, 0.4/s, splash radius 1, `C`) and the Catapult row (cost 80, HP 40, range 9, min range 3, 0.2/s, splash radius 2, `P`). Extend `updateTower` with `splashRadius` and `minRange`. Show a splash flash at the impact tile.

**Acceptance criteria:**
- [ ] Splash damages every enemy within the radius of the target
- [ ] The catapult never targets enemies closer than 3 tiles
- [ ] Both are buildable from the panel and keys

**Verification:**
- [ ] `npm test` (`tests/sim/towers.test.ts`: splash radius, min range, fire intervals)
- [ ] Manual: cannons and catapults hit groups, and a catapult ignores adjacent enemies

**Dependencies:** Task 8

**Files likely touched:** `src/sim/towers.ts`, `src/sim/config.ts`, `src/render/canvas.ts`, `src/ui/panel.ts`, `tests/sim/towers.test.ts`

**Estimated scope:** S

---

## Task 10a: Floor spikes

**Description:** Add `traps.ts` with `updateTrap`: a fixed fire cycle that starts when the trap is built and runs whether or not an enemy is there. Add the Floor spikes config row (cost 15, `^`, walkable, `blocksMovement: false`, no HP, fires every 1.5s for 15 damage to every enemy on its own tile). The flow field treats floor spikes as cost 1. Drag-painting works. A brief "spikes up" visual shows when they fire.

**Acceptance criteria:**
- [ ] Floor spikes fire every 30 ticks and damage every enemy on their tile, and no others
- [ ] Floor spikes don't change enemy routing and are never attacked
- [ ] The spikes-up visual is shown when they fire

**Verification:**
- [ ] `npm test` (`tests/sim/traps.test.ts`: cycle timing, own-tile only, multiple enemies on a tile, path unchanged)
- [ ] Manual: paint a spike strip across the path and watch enemies take damage in pulses

**Dependencies:** Task 8

**Files likely touched:** `src/sim/traps.ts`, `src/sim/config.ts`, `src/sim/pathfinding.ts`, `src/render/canvas.ts`, `tests/sim/traps.test.ts`

**Estimated scope:** S

---

## Task 10b: Wall spikes (directional)

**Description:** Add the Wall spikes config row (cost 20, HP 50, blocks movement, fires every 2s for 20 damage to every enemy on the one adjacent tile it faces). The structure stores `facing` (N/E/S/W) and is drawn as `▲▶▼◀`. `R` cycles the facing of the selected tool, and the build command carries the facing. The placement ghost shows the facing and highlights the target tile. It can be attacked and destroyed like a wall.

**Acceptance criteria:**
- [ ] Wall spikes hit only enemies on the faced adjacent tile, on a 40-tick cycle
- [ ] `R` rotates the facing before placement, and the ghost preview reflects it
- [ ] Wall spikes block movement and can be breached like walls

**Verification:**
- [ ] `npm test` (`tests/sim/traps.test.ts`: each facing hits the right tile, no hits on other sides, cycle timing, blocks path)
- [ ] Manual: line a corridor with wall spikes facing inwards and watch enemies get hit as they pass

**Dependencies:** Task 10a

**Files likely touched:** `src/sim/traps.ts`, `src/sim/config.ts`, `src/sim/types.ts`, `src/ui/input.ts`, `src/render/canvas.ts`, `tests/sim/traps.test.ts`

**Estimated scope:** M

---

## Task 11: Houses generate income

**Description:** Add the House config row (cost 40, HP 30, `h`, blocks movement). `economy.ts` makes each house add +2 gold every 5s (100 ticks). Houses can be attacked like walls. The panel shows income per wave/minute.

**Acceptance criteria:**
- [ ] Each house pays +2 gold every 100 ticks, and not while paused
- [ ] Destroyed houses stop paying

**Verification:**
- [ ] `npm test` (`tests/sim/economy.test.ts`: income timing, pause, destroyed house)
- [ ] Manual: build houses and watch gold tick up

**Dependencies:** Task 8

**Files likely touched:** `src/sim/economy.ts`, `src/sim/config.ts`, `src/ui/panel.ts`, `tests/sim/economy.test.ts`

**Estimated scope:** S

---

## Task 12: Sell / demolish with refunds

**Description:** Add the `sell` command and an `X` tool. Refund `floor(cost * 0.5 * hp / maxHp)` (floor spikes have no HP, so they always refund 50%). The keep can't be sold. The field recomputes after a sale.

**Acceptance criteria:**
- [ ] Selling removes the structure and refunds per the formula
- [ ] Selling the keep or an empty tile is rejected

**Verification:**
- [ ] `npm test` (`tests/sim/economy.test.ts`: full HP, damaged and floor spike refunds, rejections)
- [ ] Manual: sell a wall in the enemy path and watch enemies reroute

**Dependencies:** Task 11

**Files likely touched:** `src/sim/economy.ts`, `src/sim/game.ts`, `src/ui/input.ts`, `src/ui/panel.ts`, `tests/sim/economy.test.ts`

**Estimated scope:** S

---

### Checkpoint 3: Feature complete
- [ ] All tests pass, build clean
- [ ] All 7 structures buildable and sellable. Each tower behaves distinctly. The economy loop works.
- [ ] Review with human, including a balance pass on `config.ts`

---

## Phase 4: Polish and Verification

## Task 13: System 6/7 UI polish, hover info and keyboard shortcuts

**Description:** Style the panel and dialogs as classic Mac System 6/7 (1px borders, striped title bars, monochrome chrome, pixel font). Tool buttons show glyph, name, cost and hotkey, and are disabled when unaffordable. Hovering a tile shows its contents/HP in an info box. Add the full key map from the spec (`1`-`7`, `X`, `R`, `Esc`, `Space`, `D`). Game-over dialog styled to match.

**Acceptance criteria:**
- [ ] The panel matches the System 6/7 look. Unaffordable tools appear disabled.
- [ ] Hover info shows the structure/enemy type and HP
- [ ] All shortcuts from the spec work

**Verification:**
- [ ] `npm run build`
- [ ] Manual: walk through every control. Screenshot for review.

**Dependencies:** Task 12

**Files likely touched:** `src/styles.css`, `src/ui/panel.ts`, `src/ui/input.ts`, `index.html`, `src/render/palette.ts`

**Estimated scope:** M

---

## Task 14: Performance, coverage, README and cross-browser check

**Description:** Add a dev-only stress mode (spawn 200 enemies) and check for a steady 60fps. Cache glyphs if needed. Run coverage and fill gaps to >= 80% lines in `src/sim/`. Finalise the README (controls, rules summary, project structure). Smoke test in Chrome, Firefox and Safari.

**Acceptance criteria:**
- [ ] 200 enemies render at ~60fps on a typical laptop
- [ ] `npm run coverage` reports >= 80% line coverage for `src/sim/`
- [ ] README is complete and accurate. No console errors in the 3 browsers.

**Verification:**
- [ ] `npm run coverage`
- [ ] Manual: stress mode FPS check, smoke test in 3 browsers

**Dependencies:** Task 13

**Files likely touched:** `src/main.ts`, `src/render/canvas.ts`, `README.md`, `package.json` (`@vitest/coverage-v8`, approved), `tests/sim/*`

**Estimated scope:** M

---

### Checkpoint 4: MVP complete
- [ ] All 10 success criteria in SPEC.md met
- [ ] Ready for review
