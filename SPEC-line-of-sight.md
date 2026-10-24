# Spec: line-of-sight

Status: DRAFT (awaiting review)
Module: `line-of-sight` (see [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `tower-aiming` ([`SPEC-tower-aiming.md`](SPEC-tower-aiming.md)) and `map-gen` ([`SPEC-map-gen.md`](SPEC-map-gen.md)).
Last updated: 2026-10-24

## Objective

Height matters. A tower on the ground can't shoot through a wall, a rock or a forest. A tower on a wall fires over walls and other towers. A catapult lobs its shot over everything. This makes it worth building towers on walls, and it means hiding behind your own walls has a cost.

**Player-facing outcome:** a ground cannon placed just behind a wall line can no longer hit enemies on the far side. Move it onto the wall and it can. A catapult behind the keep still hits anything in range. When placing or hovering a tower, the overlay shows which tiles in its arc it can actually see.

### Who sees what

Each tower has a **sight class**, worked out from its weapon and where it stands:

| Sight class | Which towers | Blocked by |
|---|---|---|
| **Lobbed** | Catapult (anywhere) | Nothing |
| **Elevated** | Archer or cannon on a wall or ruin | The keep only |
| **Ground** | Archer or cannon on open ground | Walls, ruins, wall spikes, the keep, rocks, trees |

Things that **never** block: other towers on the ground, houses (too small), floor spikes, bridges, enemies, fords, water.

- The weapon property is config (`lobbed: true` on the catapult), so future lobbed or direct-fire towers are config rows.
- **Elevated** comes from the tile: the tower is a mount on a base with `acceptsMount`. That is the same rule `tile-layers` already uses.
- A blocking tile lets an elevated tower see over it but not a ground tower. Which tiles block a ground tower is a `blocksSight` flag in `STRUCTURES` and `TERRAIN` config, so it's tunable per kind.

### The line check

- Draw a line from the tower's tile centre to the centre of the enemy's current tile (its rounded position).
- Every tile the line passes **through the inside of**, apart from the tower's tile and the target's tile, is checked. If any of them blocks the tower's sight class, the target isn't visible.
- A line that only touches a tile's corner (passing exactly between two diagonal tiles) isn't blocked by that tile. That means a diagonal gap between two walls can be shot through.
- The check is deterministic and uses integer grid stepping, with no floating-point drift between platforms.

### Rules changes in existing systems

- **Targeting:** a tower can only pick enemies that are in range, in its arc **and** visible. It never wastes a shot on an enemy it can't see, and a turning tower only turns towards visible enemies.
- **Splash** is unchanged. Once a visible target is hit, the splash damages everything around it, even enemies behind a wall. Lobbed and explosive shots aren't stopped by cover.
- **Caching:** the set of tiles a tower can see depends only on the grid, so it's computed per tower and cached against `gridVersion`. Building, selling, destruction and tree clearing all bump `gridVersion` already. Targeting and the overlay both read this cache.

### Overlay

The `tower-aiming` overlay now shows two tints inside the range and arc: **visible** tiles, and **in arc but blocked** tiles (dimmer). The ghost overlay while placing uses the same computation, including whether the ghost would be elevated, which depends on whether it's going onto a wall.

### Hover info

Tower hover info adds the sight class, e.g. `Cannon on ground, facing north, 360° arc, ground sight`.

## Out of scope

- Units seeing or shooting (`units` reuses this check for guard units, but its rules live in that spec)
- Partial cover, hit chance, or accuracy falloff
- Line of sight for enemies (enemies don't shoot)
- Fog of war

## Data model

```ts
// src/sim/config.ts
export interface TowerStats {
  ...existing,
  /** Fires in an arc over everything (catapult). */
  lobbed?: boolean;
}
export interface StructureStats { ...existing; blocksSight?: boolean } // wall, ruin, wallSpikes
export interface TerrainStats { ...existing; blocksSight: boolean }    // rock, tree
// The keep always blocks sight for ground and elevated towers.

// src/sim/sight.ts (new)
export type SightClass = "lobbed" | "elevated" | "ground";
export function sightClassOf(state: GameState, tower: Structure): SightClass;
export function canSee(state: GameState, from: Point, to: Point, sight: SightClass): boolean;
/** Cached per tower per gridVersion. */
export function visibleTiles(state: GameState, tower: Structure): Set<number>;
```

## Commands

Unchanged. No new dependencies.

## Testing strategy

Vitest unit tests in `tests/sim/`, written before each change, on `blankMap` games with structures and terrain placed by hand:

- **Line check:** a straight line through a wall is blocked; a line that only touches the corner between two diagonal walls isn't; the tower's own tile and the target's tile never block; the result is symmetric for horizontal, vertical and diagonal lines.
- **Sight classes:** a ground archer can't hit an enemy behind a wall, a rock or a tree; the same archer on a wall can; a ground archer fires over a ground cannon and over a house; a catapult hits through anything; nothing sees through the keep apart from catapults.
- **Targeting:** a tower with one visible and one hidden enemy picks the visible one, even when the hidden one is closer to the keep. A turning tower doesn't turn towards a hidden enemy.
- **Splash:** a cannon's splash still hits an enemy behind a wall next to its visible target.
- **Cache:** visibility updates when a wall is built, sold or destroyed and when a tree is cleared.
- **Regression:** existing tests pass. Tower tests on open ground are unaffected.

Coverage stays at 80% lines or more for `src/sim/`. Check the overlay's visible and blocked tints in the browser on a generated map.

## Boundaries

- **Always:** use one `canSee` for targeting, the overlay and (later) units; keep blocker flags in config; update README (sight classes, building towers on walls).
- **Ask first:** making houses or ground towers block sight; changing splash so cover stops it; new dependencies.
- **Never:** use floating-point line stepping that can differ between platforms; compute visibility separately in the renderer.

## Success criteria

1. Ground archers and cannons never hit enemies whose line passes through a wall, ruin, wall spikes, the keep, a rock or a tree.
2. Archers and cannons on walls or ruins fire over walls, ruins, wall spikes, rocks, trees and ground towers.
3. Catapults ignore line of sight completely.
4. Towers never target an enemy they can't see.
5. The overlay shows visible and blocked tiles for both the placement ghost and a hovered tower, and they match what the tower actually hits.
6. All tests pass. `npm run typecheck`, `npm test` and `npm run coverage` (80% or more for `src/sim/`) pass.

## Resolved decisions

1. **Trees and rocks block** ground towers.
2. **Houses don't block.** They're too small.
3. **Ground towers don't block** other ground towers (already in the capability map).
4. **Lobbed weapons** (catapults, with their curved shot) fire over everything.

## Open questions

1. **Can elevated towers see over trees and rocks?** Proposed: yes. Only the keep blocks them, so building on walls is always the "see further" option.
2. **Does cover stop splash?** Proposed: no. Splash hits everything near a visible target, including enemies behind a wall.
