# Spec: map-gen

Status: APPROVED (2026-10-24)
Module: `map-gen` (see [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `tile-layers` ([`SPEC-tile-layers.md`](SPEC-tile-layers.md)).
Last updated: 2026-10-24

## Objective

Every game starts on a different, seeded map instead of an empty field. Terrain (sea, rivers, rocks, forests) shapes where enemies can walk. Leftover ruins give the player free wall pieces to build their maze around. Treasure chests reward expanding outwards.

**Player-facing outcome:** a new game shows a coastline along one edge, a winding river with one or two natural fords, rock clusters, patches of forest, broken ruin walls and a few treasure chests. You can wall off a ford, bridge the river somewhere else, clear trees to make room, mount archers on a ruin, or build over a chest to claim its gold.

### Terrain

Terrain is the `terrain` layer added by `tile-layers`. New values:

| Terrain | Glyph | Walkable | Buildable | Notes |
|---|---|---|---|---|
| Ground | (none) | yes | yes | As today |
| Sea | `≈` dark blue | no | no | Coastline along one map edge |
| River | `~` light blue | no | **bridges only** | Crosses the map edge to edge (or edge to coast), anywhere |
| Ford | (none) sandy | yes | yes | Natural shallow crossing of the river: ground with a different colour |
| Rock | `o` grey | no | no | Clusters. Enemies can't break rock, and the player can't clear it. |
| Tree | `♣` green | no | no | Forest patches. The player can **clear** a tree with the X tool for 1 gold of timber (config), turning it into ground. Enemies can't break trees. The `resources` module later adds timber mills that harvest them. |

- Sea, river, rock and trees are **impassable**, not just expensive: enemies never walk or break through them. Walls stay passable-at-a-cost as today, so the "break in only when sealed" rule is unchanged.
- **Bridge** (new structure, key `8`, cost 10): a base structure that can be built **only on river tiles**. It makes the tile walkable. It doesn't block movement, has no HP, can't hold a tower, and can be sold like anything else. Opening a bridge gives enemies a new route too, so it's a tactical choice.

### Features

| Feature | Glyph | What it is |
|---|---|---|
| **Ruin** | `#` dark grey | A neutral wall piece placed by the generator. It behaves exactly like a wall (blocks, can hold a tower, enemies break it only when sealed in) but starts damaged (40-80% HP) and costs nothing. Sells for a small salvage value. Not buildable by the player. |
| **Treasure chest** | `$` gold, on ground | A one-off pile of gold left lying on the map (20-60, more the further from the keep). Building anything on its tile claims the gold and removes the chest. Enemies ignore chests. Later, units can collect them. |

Chests live in a new `features` list on the game state (not in the tile layers), so the `resources` module can add deposits, animals and crops as new feature kinds later.

### Generation

`generateMap(state, rng)` runs inside `createGame`, deterministic from the seed:

1. **Coast:** pick one edge out of top, bottom or right (never the spawn's left edge), and lay a band of sea 2-5 tiles deep with an irregular shoreline.
2. **River:** one meandering river, edge to edge or edge to coast, in any direction and anywhere outside the keep and spawn clear zones. Mark 1-2 of its tiles as **fords**. If the river separates the spawn from the keep, the fords keep a route open.
3. **Rocks:** clusters of 2-8 tiles.
4. **Forests:** patches of 4-15 trees.
5. **Ruins:** fragments (short lines, L shapes, broken squares), each 3-8 tiles of pre-damaged ruin.
6. **Treasure chests:** on open ground.

**Map size is expected to grow a lot** in later modules. The generator takes the width and height from the state and never assumes 48x32. Feature counts come from densities per 1,000 tiles in `MAP_GEN` config (today's 48x32 gives roughly 3-6 rock clusters, 3-5 forests, 4-8 ruins, 3-6 chests), so a bigger map gets proportionally more.

**Guarantees** (checked after generation; if one fails, regenerate with the next derived seed, so the result is still deterministic):
- A **walkable terrain route** exists from every spawn tile to the keep, ignoring ruins (which are breakable anyway).
- The keep and a ring of **4 tiles** around it are clear ground with no features.
- The spawn zone and the **2 columns** in front of it are clear ground.
- Every ruin and chest tile is reachable over walkable terrain.
- **No walkable tile is cut off from the keep** (added during build: a ford on a corner of the river's sideways step didn't actually cross, leaving whole strips unreachable). Fords are therefore full cross-sections of the river.

The seed is shown in the side panel, so a good map can be replayed (seed entry itself comes with `game-setup`).

### Rules changes in existing systems

- **Pathfinding:** impassable terrain is skipped entirely (no route through it). Bridges make a river tile walkable. Clearing a tree makes its tile ground.
- **Placement:**
  - nothing can be built on sea, rock or trees
  - only a bridge can be built on a river tile, and a bridge only there
  - fords and ground follow the normal rules
  - building on a chest tile claims its gold, then the chest is removed
  - the X (sell) tool on a tree clears it for its timber value
- **Spawning:** enemies spawn only on walkable spawn tiles (guaranteed by generation).

## Out of scope

- Deposits, animals, crops (the `resources` module adds them as feature kinds)
- Repairing ruins or walls
- Map size changes and a scrolling camera (`mode-barbarians`)
- Seed entry and a "new map" option (`game-setup`)

## Data model

```ts
// src/sim/types.ts (sketch)
export type Terrain = "ground" | "ford" | "river" | "sea" | "rock" | "tree";

export type MapFeature = { kind: "chest"; x: number; y: number; gold: number };
// resources adds: | { kind: "deposit"; ... } | { kind: "animal"; ... }

export interface GameState {
  features: MapFeature[];
  seed: number;
  ...
}

// src/sim/config.ts
export const TERRAIN: Record<Terrain, { walkable: boolean; buildable: "any" | "bridgeOnly" | "none" }>;
export const MAP_GEN = { coastDepth: [2, 5], riverFords: [1, 2], rockClustersPer1000: [2, 4], ... };
export const TREE_CLEAR_GOLD = 1;
export const RUIN_SALVAGE_GOLD = 2; // per ruin tile at full HP
// STRUCTURES gains: ruin (layer base, acceptsMount, buildable: false), bridge (layer base, walkable).
```

`createGame(seed, options?)` gains `options.blankMap` for tests that need an open field. All existing tests switch to a blank map, so they keep testing what they test today.

New file `src/sim/mapgen.ts` holds the generator. Terrain rules go through grid helpers (`terrainAt`, `isWalkable`), like the layer helpers.

## Commands

Unchanged. No new dependencies.

## Testing strategy

Vitest unit tests in `tests/sim/`, written before each change:

- **Terrain rules:** impassable tiles never appear on an enemy route; bridges open a river tile; placement on sea, rock and river is rejected with clear reasons; bridges only on rivers.
- **Generation:**
  - the same seed gives an identical map
  - different seeds give different maps
  - all guarantees hold for **500 seeds** (route exists, keep ring clear, spawn columns clear, every feature reachable)
- **Ruins:** start damaged, block, can hold a tower, sell for salvage, can't be built by the player.
- **Chests:** building on one adds its gold and removes it; enemies walking over it don't.
- **Trees:** impassable and unbuildable; clearing one pays its timber value and turns it into ground.
- **Scaling:** the generator runs on a non-default size (e.g. 96x64) and still meets every guarantee, with more features.
- **Regression:** every existing test passes on `blankMap`.

Coverage stays at 80% lines or more for `src/sim/`. Map appearance is checked manually in the browser over a handful of seeds.

## Boundaries

- **Always:** keep generation deterministic (seeded rng only); route terrain checks through grid helpers; update README (terrain, bridges, trees, ruins, chests).
- **Ask first:** changing the grid size; making walls or ruins impassable; new dependencies.
- **Never:** generate a map without a walkable route to the keep; use `Math.random`.

## Success criteria

1. Every new game shows a coast, a river with 1-2 fords, rock clusters, forests, ruins and chests. Different seeds look different.
2. Enemies never cross sea, river (except over a bridge or ford), rock or trees.
3. Bridges can be built only on river tiles, and they open a route.
4. Ruins work as damaged walls, including holding towers.
5. Building over a chest pays its gold, and clearing a tree pays its timber value.
6. The guarantees hold for 500 seeds in tests, and the keep is never unreachable.
7. All existing tests pass (on a blank map). `npm run typecheck`, `npm test` and `npm run coverage` pass.

## Resolved decisions

1. **Map size:** stays 48x32 for now, but it will grow a lot, so the generator is size-agnostic and feature counts scale with area.
2. **Treasure chests** (previously "loot caches") are claimed by building on their tile.
3. **River placement:** anywhere. Fords guarantee a route if it ends up between the spawn and the keep.
4. **Trees** are added now: impassable, unbuildable, clearable with X for a little gold. Timber harvesting comes with `resources`.
5. **Ruin salvage:** 2 gold per ruin tile (scaled by HP), tunable in config.

## Open questions

None.
