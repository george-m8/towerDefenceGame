# Spec: resources

Status: APPROVED (2026-10-26)
Module: `resources` (see "AoE update" in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `unit-core` ([`SPEC-unit-core.md`](SPEC-unit-core.md)) and `map-gen` ([`SPEC-map-gen.md`](SPEC-map-gen.md)).
Last updated: 2026-10-26

## Objective

The map becomes something to harvest. Trees, rocks and berry bushes hold a set amount of resource. Three new **gatherer buildings** each spawn up to 5 workers, one a minute. Workers walk out to the nearest resource of their kind, hit it, and every hit pays their owner gold straight away. A resource that's used up disappears: a tree or rock becomes open ground, which can open new routes for enemies. Workers are ordinary units, so enemies, and rival towers in PvP, can kill them on the way.

**Gold only for now.** Every resource pays gold. Berry bushes are food in the story, and `food` will switch them (plus forager huts and farms) to food later.

**Player-facing outcome:** you build a timber yard (`T`, 60g) near a forest. A lumberjack `j` in your colour walks out, stands next to the nearest tree and chops every 3 seconds. Your gold goes up by 1 each chop. A minute later a second lumberjack comes out, and so on up to 5. When a tree's last timber is gone it vanishes, and the lumberjacks move on to the next one. A goblin walking past stops to kill one of them. The yard sends a replacement as soon as it can. A mine (`G`, 100g) sends miners to rocks, and the golden-flecked rocks pay three times as much. A forager hut (`B`, 40g) sends foragers to the red-`b` berry bushes.

### Resources

Each resource tile holds an **amount** of its resource. A hit takes some of it away and pays the owner `units taken x value` gold.

| Resource | Tile | Walkable | Amount per tile | Gold per unit | Gathered by |
|---|---|---|---|---|---|
| Timber | Tree (today's `♣`) | No | 20-40 | 1 | Lumberjack |
| Stone | Rock (today's grey `o`) | No | 30-60 | 1 | Miner |
| Gold ore | **Gold-veined rock** (new: `o` with gold flecks) | No | 30-60 | 3 | Miner |
| Berries | **Berry bush** (new: green tile, red `b`) | Yes | 15-30 | 1 | Forager |

- Amounts are rolled per tile from the map seed when the game is created, so the same seed always gives the same map and amounts.
- A tile at 0 becomes **open ground**, which goes through `setTerrain`, so `gridVersion` changes and paths and enclosures update. A tree or rock that's gone opens a gap in the map (decided 2026-10-25).
- Every rock and tree can be mined. Neither can be built on, as today. Berry bushes can be walked over but not built on until they're used up.
- The sell tool still clears a tree for 1 gold. That clears the tile and its timber.
- **Hover:** `Tree - 18 of 30 timber left (18g)`, `Gold-veined rock - 40 of 52 ore left (120g)`, `Berry bush - 9 of 20 berries left (9g)`.
- **Drawing:** a resource tile that's been worked shows a thin bar of what's left, like a structure's HP bar.

### Map generation

- **Gold veins:** after rock clusters are placed, each rock tile has a `goldVeinChance` (proposed 0.12) of being gold-veined. Every cluster keeps at least one plain rock, so veins read as flecks.
- **Berry bushes:** `berryPatchesPer1000` (proposed 1.5-3) patches of `berryPatchSize` (proposed 3-8) bushes, on open ground outside the keep's clear zone and the spawn strip, grown like small forests. They're walkable, so they never change whether the keep can be reached.
- These run **after** everything map-gen already places (terrain, ruins, chests), using the same seeded generator. Today's maps stay as they are, apart from the new tiles.

### Gatherer buildings

New structure rows, each a spawner (`unit-core`). They cost gold, spawn their workers free, are base-layer, block movement like a house, and see like a house.

| Building | Key | Glyph | Cost | HP | Spawns | Quota | Interval |
|---|---|---|---|---|---|---|---|
| Timber yard | `T` | `T` | 60 | 40 | Lumberjack | 5 | 60 s |
| Mine | `G` | `M` | 100 | 40 | Miner | 5 | 60 s |
| Forager hut | `B` | `F` | 40 | 30 | Forager | 5 | 60 s |

- They're built anywhere a house can be, and build time applies as it does to everything else (`unit-core`: the first worker comes when the building is finished).
- Selling or losing one leaves its workers working, but nothing replaces them (`unit-core`).
- They show in the build tools beside the house. The **Civic** tab arrives with `town-economy`.

### Workers

Three unit kinds share one new behaviour, **gather**:

| Worker | Glyph | HP | Armour | Takes per hit | Every | Speed | Sight | Gathers |
|---|---|---|---|---|---|---|---|---|
| Lumberjack | `j` | 15 | 0 | 1 | 3 s | 1.2 | 3 / 5 | trees |
| Miner | `p` | 18 | 1 | 1 | 3 s | 1.0 | 3 / 5 | rocks, gold-veined rocks |
| Forager | `f` | 12 | 0 | 1 | 3 s | 1.4 | 3 / 5 | berry bushes |

**Gather behaviour:**
1. If it's next to (or, for berries, standing on) a resource it gathers, it hits it on its interval. Each hit takes `takes per hit` from the tile and pays the owner. With several in reach it picks the first in N, E, S, W order, or the tile under it for berries.
2. Otherwise it walks (`walkTowards`, `unit-core`) to the **nearest** tile it can work from. That's one search for the nearest of every matching resource, wherever they are, explored or not (decided 2026-10-25). Several workers may share a resource.
3. If none can be reached, it stands still and searches again when the grid changes.

- Workers never attack enemies, and they don't run away (proposed, see open question 1). Enemies fight them like any unit (in their way or beside them). Rams walk through them, and bombers' blasts hurt them.
- In PvP, rival towers shoot workers before buildings (`unit-core`).
- Workers give fog sight. A lumberjack deep in a forest lights it up.
- Hover: `Lumberjack (Ann's), HP 15 / 15, chopping` / `walking` / `idle: nothing to gather`.

### Network

- `resources` and `resourceStart` (the starting amount, for the bar and hover) are two per-tile layers. They go in the welcome snapshot, and updates carry changed tiles only, like terrain. `resourceStart` never changes after the welcome.
- Worker kinds are new rows in `UNIT_KINDS`, so they travel as units already do.

### Tuning

Prices and rates will be rebalanced soon, so every number here is meant to be easy to change:

- **All of it is config.** Resource amounts and values (`RESOURCES`), worker stats (`UNIT_KINDS`), building cost, HP, quota and interval (`STRUCTURES`), and map-gen numbers (`MAP_GEN`) all live in `src/sim/config.ts`, one row per thing, each with a comment saying what it does. Nothing is written into code.
- **Tests read config.** Tests compute expected gold, timings and counts from the config rows (e.g. `RESOURCES.goldRock.value * hit`) instead of repeating numbers, so changing a number never breaks a test that isn't about that number.
- **README Tuning section** gains a table: what each number does, where it lives, and what it is now, with the rough income a full gatherer earns per minute worked out from them.

### Worth and time (2026-10-26, after play-testing)

Rewards felt low for the time taken, and each resource should be tunable by what it's worth and how long it takes. So a `RESOURCES` row is now `worth` (gold a tile pays in all, rolled per tile) and `seconds` (how long one worker takes to clear it), replacing amount x value. Each tile tracks the work left (`state.resources`, in ticks) and its worth (`state.resourceWorth`). A hit of `attackInterval` seconds pays the gold its work earned, so a tile pays exactly its worth over exactly its time. Hover reads `Tree - 18 of 30g of timber left`. Defaults keep the first averages: trees 20-40g over 90 s, rock 30-60g and gold-veined 90-180g over 135 s, berries 15-30g over 60 s.

## Out of scope

- Food as a currency, the economy toggle, food costs: `food` (with `game-setup`)
- Workers carrying loads back to their building
- Animals as a food source
- Farms, houses, shops and the Civic tab: `town-economy`
- Copper and iron as separate ores (dropped 2026-10-25)
- Workers fleeing, or the player choosing which tree to work
- Sounds for chopping and mining (could follow with `music-director` or a small audio task)

## Data model

```ts
// src/sim/config.ts
TERRAIN gains:
  goldRock: { name: "Gold-veined rock", walkable: false, buildable: "none" },
  berries:  { name: "Berry bush", walkable: true, buildable: "none" },

export const RESOURCES = {
  tree:     { amount: [20, 40], value: 1, word: "timber" },
  rock:     { amount: [30, 60], value: 1, word: "ore" },
  goldRock: { amount: [30, 60], value: 3, word: "ore" },
  berries:  { amount: [15, 30], value: 1, word: "berries" },
} satisfies Partial<Record<Terrain, ResourceStats>>;

export type UnitBehaviourId = "hold" | "gather";
export interface UnitKind { ...existing; gathers?: Terrain[] }
UNIT_KINDS gains lumberjack, miner, forager.
STRUCTURES gains timberYard, mine, foragerHut (each with `spawner`).
MAP_GEN gains goldVeinChance, berryPatchesPer1000, berryPatchSize.

// src/sim/types.ts
export interface GameState {
  ...existing;
  /** Per tile: resource left (0 = none). */
  resources: number[];
  /** Per tile: what it started with, for the bar and hover. */
  resourceStart: number[];
}

// src/sim/resources.ts (new)
export function resourceAt(state, x, y): { terrain: Terrain; left: number; start: number } | null;
export function placeResource(state, x, y, terrain, amount): void; // map-gen and tests
/** Takes up to `units`, pays `owner`, clears the tile at 0. Returns the gold paid. */
export function harvest(state, x, y, units, owner): number;
```

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/config.ts`: terrain rows, `RESOURCES`, worker kinds, gatherer buildings, map-gen numbers
- `src/sim/resources.ts` (new): amounts, `harvest`, starting amounts for a map
- `src/sim/mapgen.ts`: gold veins and berry patches
- `src/sim/units.ts`: the `gather` behaviour
- `src/sim/game.ts`, `src/sim/economy.ts`: amounts filled in at creation; the sell tool clears a tree's timber
- `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/view.ts`: the two layers
- `src/render/canvas.ts`, `src/render/palette.ts`: berry bushes, gold-veined rocks, the resource bar
- `src/ui/state.ts`, `src/ui/tileInfo.ts`: build keys, hover lines
- Tests: `tests/sim/resources.test.ts` (new), additions to `units`, `mapgen`, `economy`, `view` tests

## Code style

The behaviour sits in the existing table and reuses `walkTowards`:

```ts
function gather(state: GameState, unit: Unit) {
  const { gathers = [] } = kindOf(unit);
  const target = workableTile(state, unit, gathers); // next to it, or under it for berries
  if (target) {
    if (unit.attackCooldown === 0) {
      harvest(state, target.x, target.y, kindOf(unit).damage, unit.owner);
      unit.attackCooldown = kindOf(unit).attackInterval * TICK_RATE;
    }
    return;
  }
  walkTowards(state, unit, `gather ${gathers.join("+")}`, (x, y) => canWorkFrom(state, x, y, gathers));
}
```

## Testing strategy

Vitest, written before each change, on blank maps with hand-placed resources (`placeResource`):

- **Harvest:** a hit takes the units and pays `units x value` to the owner; gold-veined rock pays 3x; the last hit pays only what's left; at 0 the tile becomes ground and `gridVersion` changes; a used-up rock opens a path enemies take.
- **Gather:** a lumberjack walks to the nearest tree and chops on its interval; it ignores rocks and berries; a forager stands on the bush; a miner works both kinds of rock; when its tree is gone it moves to the next; with nothing reachable it stands still and starts again when a tree becomes reachable.
- **Buildings:** each spawns its own worker kind, up to 5, one a minute, once built; selling one leaves its workers working.
- **Combat:** a goblin stops to kill a lumberjack beside its path; a worker never attacks an enemy.
- **Map gen:** every seed still passes the existing map checks; veins and bushes appear in the configured numbers; no bush on the keep's clear zone or the spawn strip; amounts are the same for the same seed; today's terrain is unchanged apart from veins and bushes (same seed, before and after).
- **Network:** the layers arrive in the welcome; a hit sends just that tile in the next update.
- **Sell tool:** clearing a tree still pays 1 gold and clears its timber.
- **Determinism:** the 2,000-tick test gains a timber yard and a mine.

Browser checks: build each gatherer, watch workers work and resources vanish, gold go up, a goblin kill a worker, and a replacement walk out; online, a second player sees the workers and the trees disappear. Coverage for `src/sim/` stays at 80% or more.

## Boundaries

- **Always:** every number in config, and tests that read their numbers from config; resources through `harvest` only; terrain changes through `setTerrain`; state RNG or the map seed for every roll; update README (resources, gatherers, keys) and SPEC.md.
- **Ask first:** making resources regrow; workers fighting or fleeing; any food behaviour; changing how map-gen places existing terrain.
- **Never:** let a client change resources; pay gold for a hit that took nothing; let workers walk on water.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A used-up tree or rock changes the grid, so enemy flow fields (3 profiles) and every unit's path are rebuilt | A slow tick each time (around 30 ms on XL) | Fields are already lazy and searches have a budget; measure with 4 gatherers on XL; if needed, skip the grid change for berries (walkable either way) |
| New tiles change generated maps | Seed-based tests and saved expectations shift | Generate veins and bushes last; a test compares today's terrain before and after |
| Workers are much better value than houses (a yard at quota earns about 100g a minute) | Balance | First-pass numbers in config, tuned in play; resources run out, workers die |
| Mining rocks opens routes the player didn't expect | Surprise breaches | Decided as part of the strategy; hover shows what's left, so the player can see a thin wall of rock going |

## Success criteria

1. Trees, rocks, gold-veined rocks and berry bushes hold amounts. Hits pay gold, and used-up tiles become ground.
2. Timber yards, mines and forager huts spawn their workers (5 each, one a minute), who find and work the nearest resource of their kind.
3. Workers can be killed by enemies and, in PvP, rival towers, and are replaced by their building.
4. New maps have gold veins and berry patches; existing terrain from the same seed is unchanged.
5. It all works online, with resources and workers in sync.
6. `npm run typecheck`, `npm test` and `npm run build` pass, and coverage stays at 80% or more for `src/sim/`.

## Open questions

None.

## Resolved decisions (2026-10-26)

1. Workers keep working; they don't flee (for now).
2. The first-guess numbers stand, but must be easy to tune (see Tuning): prices get balanced soon.
3. Keys `T` / `G` / `B`, building glyphs `T` / `M` / `F`, workers `j` / `p` / `f`.
4. Gold veins: about 12% of rock tiles, 3x value.
