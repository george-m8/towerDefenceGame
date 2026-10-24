# Spec: tile-layers

Status: APPROVED (2026-10-24, with the proposed answers to the open questions)
Module: `tile-layers` (see [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on the MVP core ([`SPEC.md`](SPEC.md)).
Last updated: 2026-10-24

## Objective

Towers stop being walls. Each tile gets two layers, so a tower can stand **on a wall** (elevated) or **on open ground**. This is the foundation for `tower-aiming`, `line-of-sight` and `map-gen` (ruins and terrain become base-layer content).

**Player-facing outcome:** build a wall line, then put archers on top of it. The wall still blocks enemies, and the archers fire from it. Or drop a cannon on open ground, where it blocks like a building.

### The two layers

| Layer | What goes here | Examples |
|---|---|---|
| **Base** | What the tile *is*: terrain and anything built into the floor | ground, keep, wall, wall spikes, floor spikes, house |
| **Mount** | A tower standing on the base | archer, cannon, catapult |

Each structure kind declares its layer in `config.ts`:

| Kind | Layer | Blocks movement | Accepts a mount |
|---|---|---|---|
| Wall | base | yes | **yes** |
| Wall spikes | base | yes | no (the spikes face outwards from the wall) |
| Floor spikes | base | no | no |
| House | base | yes | no |
| Archer, Cannon, Catapult | mount | yes | - |

### Rules

**Placement**
- A **base** structure needs an empty ground tile (same rules as today: in bounds, not the keep, not the spawn zone, no enemy on it, enough gold).
- A **mount** (tower) can go on:
  - **empty ground** -> a *ground tower*, or
  - **a base that accepts mounts** (a wall) with no tower on it yet -> a *wall-mounted tower*.
- A mount can't go on floor spikes, wall spikes, a house, the keep or the spawn zone.
- You can't place a base under an existing ground tower.
- Ground towers can't be placed on enemy-occupied tiles. Wall-mounted towers can always be placed, since nothing walks on a wall.

**Movement and attacks** (the rule doesn't change: enemies only break things that block their route to the keep)
- A tile blocks movement if its base blocks **or** it has a mount. A ground tower therefore blocks like a building.
- Pathfinding cost is unchanged: blocked tiles cost more than any open route.
- When an enemy's next tile is blocked, it attacks:
  - the **base** if the base blocks (so a wall-mounted tower is protected by its wall), otherwise
  - the **mount** (a ground tower).
- When a wall is destroyed, any tower on it **falls and is destroyed** too, with no refund.

**Elevation**
- Each tower knows whether it's **elevated** (standing on a wall) or on the ground. The flag is derived from the base below it.
- In this module elevation has **no gameplay effect** beyond the rules above: stats are identical. `line-of-sight` uses it later (elevated towers fire over walls and ground towers).

**Selling** (X tool)
- Selling a tile removes the **top layer**: the mount if there is one, otherwise the base. Selling a wall with an archer on it takes two clicks: archer first, then wall.
- Refunds are unchanged (50% of cost, scaled by HP).

**Towers and HP**
- Towers keep their own HP. Wall-mounted towers take no damage until their wall falls. Ground towers are hit directly.

**Visuals**
- A ground tower is drawn as today: tower colour and glyph.
- A wall-mounted tower is drawn on the **wall's colour** with the tower glyph in the tower's colour, plus a thin top border so "on a wall" reads at a glance.
- The placement ghost is green on valid ground *or* walls for tower tools.
- Hover info shows `Archer (on wall)` / `Archer (ground)` and the HP of both layers.
- The `D` path overlay marks a tile red when enemies will attack it, as today.

## Out of scope

- Any elevation bonus (range, line of sight): that belongs to `line-of-sight`.
- Facing, arcs and rotation: `tower-aiming`.
- Terrain types beyond ground (water, rocks, bridges, ruins): `map-gen`. This module adds a `terrain` base value so map-gen can extend it without another data-model change.
- Towers mounted on the keep, or towers on wall spikes.
- Repairing walls.

## Data model

```ts
// src/sim/types.ts (sketch)
export type Terrain = "ground"; // map-gen adds "water" | "rock" | ...

export interface GameState {
  terrain: Terrain[];   // per tile, index = y * width + x
  base: number[];       // EMPTY | KEEP_TILE | structure id
  mount: number[];      // EMPTY | structure id (always a tower)
  structures: Record<number, Structure>;
  ...
}

// src/sim/config.ts
export interface StructureStats {
  layer: "base" | "mount";
  acceptsMount?: boolean; // walls only
  ...
}
```

`tiles: number[]` is replaced by `base` + `mount`. All access goes through `grid.ts` helpers, so callers change from `structureAt(state, x, y)` to:

```ts
baseAt(state, x, y): Structure | undefined
mountAt(state, x, y): Structure | undefined
topAt(state, x, y): Structure | undefined        // mount ?? base, for selling and hover
blocksAt(state, x, y): boolean                   // pathfinding and enemy movement
attackTargetAt(state, x, y): Structure | undefined // blocking base, else mount
isElevated(state, tower): boolean
```

`removeStructure` on a base also removes the mount above it.

## Commands

Unchanged from the MVP (see `SPEC.md` and `README.md`). No new dependencies.

## Project structure

Changes are confined to existing files: `src/sim/{types,config,grid,pathfinding,enemies,economy,game}.ts`, `src/render/canvas.ts`, `src/ui/tileInfo.ts`, plus tests. No new modules.

## Code style

Same as `SPEC.md`. Keep the grid helpers as the only code that reads `base`/`mount` directly.

## Testing strategy

Vitest unit tests in `tests/sim/`, added before each change (red, green):

- **Placement matrix:** each kind on ground / wall / wall spikes / floor spikes / house / keep / spawn / occupied mount, with the expected accept or reject reason.
- **Blocking:** ground tower blocks, wall-mounted tower tile blocks (via the wall), floor spikes don't. Flow field matches.
- **Attack target:** an enemy blocked by a wall-mounted tower hits the wall, not the tower. Blocked by a ground tower, it hits the tower.
- **Collapse:** destroying a wall destroys its tower. The grid version bumps and enemies reroute.
- **Selling order:** mount first, then base. Refunds are correct.
- **Elevation flag:** true on a wall, false on ground.
- **Regression:** all 73 existing tests still pass (updated only where they read `tiles` directly).

Coverage stays at 80% lines or more for `src/sim/`. The rendering changes are checked manually in the browser.

## Boundaries

- **Always:** route all layer access through `grid.ts` helpers. Keep the simulation deterministic. Update README (structures table, controls) and `SPEC.md` where rules change.
- **Ask first:** changing pathfinding costs or the "attack only when blocked" rule; any new dependency.
- **Never:** let render or UI code read `base`/`mount` arrays directly; delete or weaken existing tests to get green.

## Success criteria

1. An archer, cannon or catapult can be placed on open ground or on a wall, and nowhere else listed as invalid above.
2. Ground towers block enemies, and enemies break them only when they block the route to the keep.
3. Enemies attacking a wall-mounted tower's tile damage the wall. When the wall falls, the tower falls with it.
4. Selling removes the top layer first, with correct refunds.
5. Wall-mounted towers are visually distinct, and hover info says "on wall" or "ground".
6. Existing gameplay is unchanged: all MVP tests pass and towers fire exactly as before.
7. `npm run typecheck`, `npm test` and `npm run coverage` pass.

## Resolved decisions

1. Wall spikes don't accept a tower.
2. A tower is destroyed, with no refund, when the wall under it falls.
3. A wall-mounted tower costs wall + tower. No discount or surcharge.

## Open questions

None.
