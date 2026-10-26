# Tasks: resources

Spec: [`SPEC-resources.md`](../SPEC-resources.md) · Plan: [`plan.md`](plan.md) ("AoE update: resources")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests take their numbers from config (`RESOURCES`, `UNIT_KINDS`, `STRUCTURES`, `MAP_GEN`), never repeat them.

## Task 1: Resource layers and harvest

Terrain rows `goldRock` and `berries`; `RESOURCES` (amount range, value, word) in config; `state.resources` and `state.resourceStart`; `src/sim/resources.ts` with `resourceAt`, `placeResource` and `harvest`. `createGame` fills amounts for every resource tile from the map seed. The sell tool's tree clearing also clears its timber.

- [x] `harvest` takes the units, pays `units x value` to the owner, and returns what it paid; the last hit pays only what was left; nothing is paid on an empty tile
- [x] At 0 the tile becomes ground and `gridVersion` changes; a used-up rock opens a route enemies then take
- [x] Amounts are within each kind's range and the same for the same seed; blank maps have none
- [x] Clearing a tree with the sell tool still pays 1 gold and leaves no timber behind
- [x] The existing suite passes untouched

Files: `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/resources.ts` (new), `src/sim/game.ts`, `src/sim/economy.ts`, `tests/sim/resources.test.ts` (new). Size: M. Depends on: none.

Built: starting amounts are a roll from the map seed and the tile index (not the shared generator), so map-gen's rolls are untouched. `clearResource` turns a tile into empty ground for both `harvest` and the sell tool. New terrain got a basic look and hover line now (polished in Task 5), since the palette and hover tables must list every terrain.

## Task 2: Gold veins and berry patches

`MAP_GEN.goldVeinChance`, `berryPatchesPer1000`, `berryPatchSize`. Veins and patches are placed after everything map-gen already does, using the same generator; patches avoid the keep's clear zone and the spawn strip; every rock cluster keeps a plain rock.

- [x] Across many seeds every map still passes the existing checks
- [x] Veins are roughly `goldVeinChance` of rock tiles; patch counts and sizes fall in their ranges
- [x] No bush in the keep's clear zone or on the spawn strip
- [x] Apart from veins and bushes, terrain for a seed is exactly what it was before (compared against today's generator)

Files: `src/sim/config.ts`, `src/sim/mapgen.ts`, `tests/sim/mapgen.test.ts`. Size: M. Depends on: 1.

Built: patches can grow into each other, so the test bounds the total bushes per map rather than each patch. The before/after test compares against the same generator with veins and patches turned off; ruins and chests match too.

## Task 3: Workers and the gather behaviour

`UNIT_KINDS` rows for lumberjack `j`, miner `p` and forager `f` with `gathers`; `gather` behaviour: work a resource in reach on the interval (the first in N, E, S, W order, or the tile under it for berries), otherwise walk to the nearest tile it can work from, otherwise stand still until the grid changes.

- [x] A lumberjack walks to the nearest tree and chops on its interval, paying its owner; it ignores rocks and bushes
- [x] A forager stands on its bush; a miner works plain and gold-veined rock (gold-veined pays `value` times more)
- [x] When its resource is gone it moves to the next nearest
- [x] With nothing reachable it stands still, and sets off once something becomes reachable
- [x] A worker never attacks an enemy; a goblin stops to kill a lumberjack beside its path

Files: `src/sim/config.ts`, `src/sim/units.ts`, `tests/sim/units.test.ts`. Size: M. Depends on: 1.

Built: `workableFrom` says where a worker can work: walkable resources (bushes) from on top, others from a tile beside them. A worker's `damage` is the units it takes per hit.

## Task 4: Gatherer buildings

`STRUCTURES` rows `timberYard` (`T`), `mine` (`M`) and `foragerHut` (`F`), each a spawner of its worker; build tools on `T`, `G` and `B`.

- [x] Each spawns its own worker kind, up to its quota, one per interval, once built
- [x] Selling one leaves its workers working, with none replaced
- [x] The build keys pick the tools; placement follows house rules

Files: `src/sim/config.ts`, `src/ui/state.ts`, `tests/sim/units.test.ts` (or `resources.test.ts`). Size: S. Depends on: 3.

Built: the timber yard is drawn `L` (lumber), not `T`, because the watchtower already uses `T`. The mine is `M` and the forager hut `F`; build keys are `T` / `G` / `B` as agreed.

**Checkpoint A:** a timber yard fills to 5 lumberjacks who clear trees and earn gold; a goblin kills one and the yard sends another. Done: the checkpoint A test in `tests/sim/resources.test.ts`.

## Task 5: Drawing and hover

Berry bush (green tile, red `b`), gold-veined rock (gold flecks), a thin bar on worked resource tiles, building glyphs and colours. Hover: `Tree - 18 of 30 timber left (18g)` and the like; workers add `chopping` / `mining` / `foraging`, `walking`, or `idle: nothing to gather`.

- [x] Hover lines for each resource and for a working, walking and idle worker
- [x] Browser: every gatherer works, resources shrink and vanish, gold rises (also `unit-core` checkpoint B). Checked by George, 2026-10-26: rewards feel low for the time taken

Files: `src/render/canvas.ts`, `src/render/palette.ts`, `src/ui/tileInfo.ts`, `tests/ui/tileInfo.test.ts`. Size: M. Depends on: 4.

Built: the resource bar only shows on tiles in sight, so PvP rivals can't watch your workers through fog. A tree's hover keeps the `X to clear` line under the timber line. Online clients don't get unit paths, so "walking" means between tiles (or with a path, offline). The browser check is still to do.

**Checkpoint B:** offline browser check with George.

## Task 6: Network

`resources` and `resourceStart` in the welcome snapshot; updates carry changed `resources` tiles only.

- [x] Welcome carries both layers; a hit sends just that tile next update; `resourceStart` is never resent
- [x] Browser: a second player sees workers and resources vanish in step (also `unit-core`'s online check). Checked by George with two browsers, 2026-10-26

Files: `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/view.ts`, `tests/net/view.test.ts`. Size: S. Depends on: 5.

Built: `resources` is compared every update, since harvesting doesn't change the grid. Also fixed a `unit-core` gap: land a unit explores (which changes `sightVersion` but not the grid) now reaches clients without waiting for a grid change.

## Task 7: Timing, determinism, docs and tuning table

- [x] Measured standalone: four gatherers at quota on XL, ticks where a tile runs out; recorded here (skip the grid change for berries if it helps)
- [x] The 2,000-tick determinism test gains a timber yard and a mine
- [x] README: resources, gatherers, keys, and a Tuning table (each number, where it lives, its value, and a full gatherer's rough income per minute); SPEC.md "Since `resources`"; plan and CAPABILITIES statuses
- [x] `src/sim/` coverage stays at 80% or more

Files: `tests/sim/game.test.ts`, `README.md`, `SPEC.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: 6.

Built: measured on XL over 12 game minutes with two timber yards, a mine and a forager hut (115 tiles used up). Ticks with no grid change: 0.08 ms median, 0.18 ms p95. Ticks where a tile ran out: 25 ms median, 35 ms p95, almost all of it rebuilding the three enemy flow fields (6-7 ms each); the rest of such a tick takes 0.1 ms. A few spikes (up to 120 ms) also appeared on quiet ticks (47 ms), so they look like machine noise, not this module. The berry-bush shortcut wasn't needed. `src/sim/` coverage: 99% of lines.

**Checkpoint C:** online check with two browsers, then review.

## Task 8: Resources tuned by worth and time (after play-testing)

George, 2026-10-26: rewards feel low for the time a resource takes, and each resource should be tunable by what it's worth and how long it takes to clear. `RESOURCES` rows become `worth` (gold a tile pays in all, rolled per tile) and `seconds` (how long one worker takes to clear it). Each tile tracks the work left (`resources`, in ticks) and its worth (`resourceWorth`, was `resourceStart`); a hit of `attackInterval` seconds pays the gold earned since the last hit, so a tile pays exactly its worth over exactly its time whatever the numbers. Defaults keep today's averages (tree 20-40g over 90 s, rock 30-60g and gold-veined 90-180g over 135 s, berries 15-30g over 60 s), ready to retune.

- [x] A tile pays exactly its worth over exactly its `seconds` of work, for worths that don't divide evenly
- [x] Changing `worth` or `seconds` in config changes reward and time and nothing else (tests read config)
- [x] Workers, hover (`Tree - 18 of 30g of timber left`), network and README tuning table follow the new rows

Files: `src/sim/config.ts`, `src/sim/resources.ts`, `src/sim/units.ts`, `src/sim/types.ts`, `src/net/*`, `src/ui/tileInfo.ts`, `src/render/canvas.ts`, tests, `README.md`, `SPEC-resources.md`. Size: M.

