# Tasks: enemy-kinds

Spec: [`SPEC-enemy-kinds.md`](../SPEC-enemy-kinds.md)

Standard verification for every task: `npm run typecheck && npm test && npm run build`

## Task 1: Kind and variant data, today's enemy becomes the goblin grunt

`EnemyKind`, `EnemyVariant`, `ENEMY_KINDS` (goblin only for now) and `ENEMY_KIND_ORDER` in config; `Enemy` gains `kind`, `variant`, `speed`, `damage`, `attackInterval`; `spawnEnemy(state, x, y, kind?, wave?)` resolves stats at spawn; per-enemy speed replaces the global `STEP`; `waveEnemyHp`/`waveBounty` read the goblin row. Tests that read `ENEMY.speed`, `ENEMY.keepDamage` and so on move to the goblin row (mechanical swap). No behaviour change: the goblin's only variant for now is the grunt.

- [x] An enemy spawned with no kind is a goblin grunt with exactly today's numbers
- [x] Changing config after spawning doesn't change an existing enemy
- [x] The existing suite passes with only the mechanical swap

Files: `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/enemies.ts`, `src/sim/waves.ts`, `tests/sim/*` (swap). Size: M. Depends on: none.

## Task 2: Per-kind attacks on structures, and the rest of the roster

Enemies hit a blocking structure for their own `damage` once per `attackInterval` (replacing `ENEMY.structureDps`). Rows for zerg, wolf rider, barbarian, dwarf, barbarian chief, dwarf thane and golem, with the spec's stats (variants still one each).

- [x] Each kind spawns with its spec HP, speed, damage and interval, scaled by wave
- [x] A golem hits a wall for 40 every 3 s; a zerg for 2 every 0.6 s
- [x] A wolf rider crosses 10 tiles in half the ticks a goblin needs

Files: `src/sim/config.ts`, `src/sim/enemies.ts`, `tests/sim/enemies.test.ts`. Size: S. Depends on: 1.

## Task 3: Enemies stand and attack the keep

An enemy whose next path step is a keep tile stays on its tile and hits the keep for its damage once per interval until killed; `keepHit` cue on each hit; `KEEP_HP` 99 -> 300. Tests that expected one hit and removal are rewritten for the new rule.

- [ ] An enemy next to the keep hits it once per interval and doesn't vanish
- [ ] Killing it stops the hits; enemies standing at the keep can end the game
- [ ] Towers and traps still hit enemies at the keep

Files: `src/sim/enemies.ts`, `src/sim/config.ts`, `tests/sim/enemies.test.ts`, `tests/sim/cues.test.ts`, `tests/sim/economy.test.ts`, `tests/sim/traps.test.ts`. Size: M. Depends on: 1.

## Checkpoint A (after Tasks 1-3)

- [ ] All tests pass; typecheck and build clean
- [ ] Browser: a goblin-only game plays as before, except enemies now stay at the keep and hit it
- [ ] **Review keep HP and keep damage with George before going on**

## Task 4: Variants

Variant tables from the spec (name, weight, HP/speed/damage multipliers, size); `rollVariant` with the state RNG at spawn.

- [ ] The same seed gives the same variants
- [ ] Over 10,000 rolls each variant's share is within 2% of its weight
- [ ] Variant multipliers apply on top of kind and wave scaling

Files: `src/sim/config.ts`, `src/sim/enemies.ts`, `tests/sim/enemies.test.ts`. Size: S. Depends on: 2.

## Task 5: Drawing, hover info and network

Glyph and colour per kind, glyph size per variant (small 75%, normal, large 125%, staying inside the tile) in palette and canvas; hover line `<Kind> <variant>, HP x / y` (kind name only for single-variant kinds); `ClientEnemy` gains `kind` and `variant` indices through snapshot, update and view (interpolation keeps them).

- [ ] Kind and variant survive snapshot and update round trips; the 200-enemy update size test still passes
- [ ] Hover info tests for a multi-variant and a single-variant kind
- [ ] Browser: each kind recognisable; runts and brutes visibly smaller and larger

Files: `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/view.ts`, `src/render/palette.ts`, `src/render/canvas.ts`, `src/ui/tileInfo.ts` (+ tests). Size: M (6 files, but each change is small). Depends on: 4.

## Task 6: Stopgap wave mix and the dev spawn key

Each wave's threat budget is today's count (5 + 3 x wave); enemies are drawn by `mixWeight` from kinds whose `firstWave` has arrived and whose threat fits the remaining budget; the wave ends when nothing fits. `debugSpawn` gains an optional `kind`; `E` cycles through the roster.

- [ ] Waves 1 and 2 are exactly 8 and 11 goblins
- [ ] No kind appears before its first wave; total threat never exceeds the budget
- [ ] The same seed gives the same wave

Files: `src/sim/waves.ts`, `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/game.ts`, `src/ui/input.ts`, `tests/sim/waves.test.ts`. Size: M. Depends on: 2.

## Checkpoint B (after Tasks 4-6)

- [ ] All tests pass; coverage 80%+ lines for `src/sim/`
- [ ] Browser: mixed waves play locally; `E` shows every kind
- [ ] Online: two clients see the same kinds and variants

## Task 7: Docs

README (enemy roster table, enemies attacking the keep, keep HP 300, `E` dev key), SPEC.md "Since `enemy-kinds`", plan roadmap status.

- [ ] Docs match the built behaviour

Files: `README.md`, `SPEC.md`, `tasks/plan.md`. Size: XS. Depends on: 6.
