# Implementation Plan: Tower Defence MVP - Endless Keep

Source spec: [`SPEC.md`](../../SPEC.md)
Task list: [`tasks/todo.md`](todo.md)

## Overview

Build a browser-based, grid-based tower defence game in TypeScript + 
Vite + Canvas. The player defends a central keep against endless, scaling waves using walls, four static defence types and income-generating houses. The game logic is a pure, deterministic simulation (`src/sim/`) driven by commands. A separate Canvas/HTML layer draws it and turns input into commands.

Work is sliced vertically: every task ends with something visible or playable in the browser, plus unit tests for the simulation logic it adds.

## Architecture Decisions

- **Pure sim, thin shell.** `src/sim/` has no DOM and no `Math.random`. `main.ts` runs a fixed-timestep loop (20 ticks/s), calling `tick(state)` and then `render(state)` every animation frame. This keeps the sim testable and leaves room for multiplayer later.
- **Commands in, state out.** UI/input only produces commands (`build`, `sell`, `togglePause`, `sendWave`, `restart`). `applyCommand` validates them against game rules. Invalid commands are rejected with a reason the UI can show.
- **One flow field for all enemies.** Dijkstra from the keep over a 48x32 grid (1,536 tiles) with a small binary heap. Cost: open = 1, spike = 1, blocking structure = `BLOCKED_COST` (> tile count). It's recomputed only when the grid changes (`state.gridVersion` dirty flag), not every tick. Each enemy steps to the neighbour with the lowest distance. If that neighbour is a structure, the enemy attacks it instead.
- **Enemies move in continuous positions between tile centres.** An enemy picks its next tile on arrival at a tile centre, so a field change mid-step never makes it jump or clip through a wall.
- **No building on tiles with an enemy on them.** This avoids trapping enemies inside walls. (Small addition to the spec; to be recorded in SPEC.md.)
- **Data-driven structures.** `STRUCTURES` in `config.ts` holds cost, HP, glyph, colour, `blocksMovement`, and tower stats. Tower behaviour is one shared `updateTower` with optional `splashRadius` / `minRange`. Spikes share one `updateTrap` on a fixed cycle, with the hit tiles given by style: floor spikes hit their own tile, wall spikes hit the one adjacent tile they face (`facing` stored on the structure).
- **Rendering:** one Canvas for the map (coloured square + glyph per tile, enemies drawn as glyphs at fractional positions), with an HTML/CSS side panel styled as System 6/7 chrome.

### Spec decisions

All open questions are resolved. See "Resolved Decisions" in SPEC.md. The ones that shape this plan: build anywhere except the keep, spawn zone and enemy-occupied tiles; two spike styles (floor + directional wall) on fixed cycles; +1 gold per second for sending a wave early; `git init` in Task 1; `@vitest/coverage-v8` approved.

## Dependency Graph

```
T1 Scaffold + empty grid render
 └─ T2 Sim core (state, config, rng, tick loop, pause)
     └─ T3 Wall placement (commands, gold, input, HUD)
         └─ T4 Flow field + debug overlay
             └─ T5 Enemies walk to keep, keep HP, game over/restart
                 ├─ T6 Blocked path: attack + destroy structures
                 └─ T7 Waves: formula, countdown, send early
                     └─ T8 Archer tower + targeting + bounties + range overlay
                         ├─ T9  Cannon + Catapult (splash, min range)
                         ├─ T10a Floor spikes
                         │    └─ T10b Wall spikes (directional, R to rotate)
                         └─ T11 Houses (income)
                              └─ T12 Sell / demolish
                                   └─ T13 UI polish (System 6/7, hover info, shortcuts)
                                        └─ T14 Perf, coverage, README, cross-browser
```

T9, T10a and T11 only depend on T8 and can be built in any order (or in parallel). T10b builds on the trap cycle from T10a.

## Task List

### Phase 1: Foundation
- [x] Task 1: Project scaffold and empty grid render
- [x] Task 2: Simulation core and game loop
- [x] Task 3: Wall placement with gold

### Checkpoint 1: Foundation
- [ ] `npm run typecheck && npm test && npm run build` pass
- [ ] Browser shows the grid, keep and spawn zone. You can paint walls and gold decreases. Pause works.
- [ ] Review with human

### Phase 2: Enemies and Waves (highest risk, done early)
- [x] Task 4: Flow field pathfinding and debug overlay
- [x] Task 5: Enemies walk to the keep, keep HP, game over and restart
- [x] Task 6: Blocked path - enemies attack and destroy structures
- [x] Task 7: Endless waves with countdown and early send

### Checkpoint 2: Playable without defences
- [ ] All tests pass
- [ ] Waves spawn endlessly. Enemies route around walls, break in when fully enclosed, and kill the keep. Restart works.
- [ ] Review with human

### Phase 3: Defences and Economy
- [x] Task 8: Archer tower, targeting, bounties and range overlay
- [x] Task 9: Cannon and Catapult (splash, minimum range)
- [x] Task 10a: Floor spikes
- [x] Task 10b: Wall spikes (directional)
- [x] Task 11: Houses generate income
- [x] Task 12: Sell / demolish with refunds

### Checkpoint 3: Feature complete
- [ ] All tests pass
- [ ] All 7 structures can be built and sold. Each tower type behaves distinctly. The economy loop works.
- [ ] Review with human (balance pass on `config.ts` numbers)

### Phase 4: Polish and Verification
- [x] Task 13: System 6/7 UI polish, hover info and keyboard shortcuts
- [x] Task 14: Performance, coverage, README and cross-browser check

### Checkpoint 4: MVP complete
- [ ] All 10 success criteria in SPEC.md met
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Flow field and "attack when blocked" logic gets fiddly (enemies oscillating, getting stuck on corners, attacking the wrong wall) | High | Done early (T4-T6). Overlay to visualise the field. Deterministic tests for the enclosed-keep, reroute and tie-breaking cases. Fixed neighbour order for ties. |
| Enemies trapped when a wall is placed on or next to them | Med | Block building on enemy-occupied tiles. Enemies only change direction at tile centres. |
| Field recompute cost during drag-painting | Low | 1,536 tiles is trivial (well under 1ms). Recompute lazily once per tick via a dirty flag, not per placement. |
| Fixed-timestep "spiral of death" when the tab is in the background | Med | Cap catch-up ticks per frame (e.g. 5) and drop the remaining time. |
| Canvas text rendering cost with 200+ enemies | Low | Cache glyphs to offscreen canvases if profiling shows a problem (T14). |
| Balance feels wrong (too easy or too hard) | Med | All numbers live in `config.ts`. A dedicated balance review at Checkpoint 3. |
| Scope creep into "Out of scope" features | Med | Spec boundary: ask first. New ideas go into SPEC.md's future list, not into tasks. |

## Parallelization

- Sequential: T1 -> T8 (shared state shape and core loop).
- Parallel-safe after T8: T9, T10a, T11 (each adds a config row, a behaviour and tests). T10b follows T10a, and T12 follows T11.
- T13 (styling) could start alongside Phase 3 if separate sessions are available, since it only touches `styles.css` and `ui/`.

## Open Questions

None currently.
