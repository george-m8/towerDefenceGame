# Spec: line-of-sight

Status: DRAFT (revised, awaiting review)
Module: `line-of-sight` (see "Next up" in [`CAPABILITIES.md`](CAPABILITIES.md) and [`tasks/roadmap.md`](tasks/roadmap.md)). Builds on `tower-aiming` ([`SPEC-tower-aiming.md`](SPEC-tower-aiming.md)), `map-gen` ([`SPEC-map-gen.md`](SPEC-map-gen.md)) and `balance-files` ([`SPEC-balance-files.md`](SPEC-balance-files.md)). `siege-towers` builds on it.
Last updated: 2026-10-27. Revised from the 2026-10-24 draft: **cannons are lobbed now** (as catapults are), direct fire is the archer and the coming crossbow and ballista, and showing line of sight while placing and hovering is a main goal, not an extra.

## Assumptions (correct these before approval)

1. Line of sight only limits towers' targeting. Fog of war (what the player can see) stays as it is.
2. "Height" has two levels: on the ground, or mounted on a wall, gate or ruin. There are no hills.
3. Units (guards, rangers) don't use line of sight yet.

## Objective

Height matters for direct-fire weapons. An archer on the ground can't shoot through a wall, rocks or a forest; the same archer on a wall fires over them. Cannons and catapults lob their shots, so walls never stop them, and they keep their wide arcs. This makes building on walls worth it for archers (and later crossbows and ballistas), and it means you have to see where a tower can shoot before placing it.

1. As a player placing an archer, I see which tiles in its arc it can actually hit and which are blocked, and what blocks them, before I click.
2. Hovering a built tower shows the same, and its hover info says how much of its arc is blocked.
3. A ground archer behind my wall line doesn't waste its time on enemies it can't see. Moved onto the wall, it can.
4. A cannon or catapult behind the keep still hits anything in range.

### Who sees what

Each tower has a **sight class**, worked out from its weapon and where it stands:

| Sight class | Which towers | Blocked by |
|---|---|---|
| **Lobbed** | Cannon and catapult (anywhere) | Nothing |
| **Elevated** | Direct fire (archer; later crossbow, ballista) on a wall, gate or ruin | The keep only |
| **Ground** | Direct fire on open ground | Walls, gates, ruins, wall spikes, the keep, rocks, trees |

Things that **never** block: other towers on the ground, houses and other small buildings, floor spikes, bridges, farmland, enemies, units, fords, water.

- `lobbed: true` is a tower config flag (cannon, catapult), so future towers are config rows.
- **Elevated** comes from the tile: the tower is a mount on a base with `acceptsMount` (the `tile-layers` rule).
- Which tiles block ground sight is a `blocksSight` flag in `STRUCTURES` and `TERRAIN` config. The keep always blocks direct fire.

### The line check

- A line from the tower's tile centre to the centre of the enemy's current tile (its rounded position).
- Every tile the line passes **through the inside of**, apart from the tower's tile and the target's tile, is checked. If any blocks the tower's sight class, the target isn't visible.
- A line that only touches a tile's corner isn't blocked by it, so a diagonal gap between two walls can be shot through.
- Integer grid stepping only, deterministic on every platform.

### Rules changes in existing systems

- **Targeting:** a tower picks only enemies in range, in its arc **and** visible. A turning direct-fire tower only turns towards visible enemies.
- **Splash** is unchanged: once a shot lands, the blast hits everything round it, including enemies behind a wall.
- **Caching:** the tiles a tower can see depend only on the grid, so they're computed per tower and cached against `gridVersion`. Targeting and the overlay read the same cache.
- **PvP:** the same rules for towers firing at rival units and structures.

### Showing it

This is the part George asked for most: you should see line-of-sight problems before they cost you.

- **Placing a tower:** the arc overlay shows three tints inside range and arc:
  - **Can hit** (today's arc tint).
  - **Blocked** (dimmer, hatched), with the tiles doing the blocking (walls, trees, rocks) outlined in the same colour, so you can see *what* is in the way.
  - Lobbed towers show only "can hit": nothing blocks them.
- The ghost works out its own sight class from where it's going: on a wall it's elevated, so moving the ghost onto a wall visibly clears the blocked tint.
- **Hovering a built tower:** the same overlay.
- **Hover info:** tower hover info adds its sight class and how much of its arc it can hit, e.g. `Archer on ground, facing north, 90° arc, ground sight: 62% of its arc in view`. Elevated: `on a wall, sees over walls`. Lobbed: `lobs over walls`.
- The placement tooltip warns when a direct-fire tower would see less than half its arc: "Blocked: build it on a wall to see over".

## Out of scope

- Units seeing or shooting by line of sight.
- Partial cover, hit chance, accuracy falloff.
- Line of sight for enemies.
- Fog of war changes.
- Hills, towers of different heights beyond ground and wall.

## Data model

```ts
// src/sim/config.ts
export interface TowerStats {
  ...existing,
  /** Fires in an arc over everything (cannon, catapult). */
  lobbed?: boolean;
}
export interface StructureStats { ...existing; blocksSight?: boolean } // wall, gate, ruin, wallSpikes
export interface TerrainStats { ...existing; blocksSight: boolean }    // rock, goldRock, tree

// src/sim/sight.ts (new; fog's sight lives in fog.ts, this is weapons only)
export type SightClass = "lobbed" | "elevated" | "ground";
export function sightClassOf(state: GameState, kind: StructureKind, x: number, y: number): SightClass;
export function canSee(state: GameState, from: Point, to: Point, sight: SightClass): boolean;
/** Tiles in range and arc, split into visible and blocked, plus the tiles that block. Cached per tower per gridVersion. */
export function lineOfFire(state: GameState, tower: Structure | Ghost): {
  visible: Set<number>; blocked: Set<number>; blockers: Set<number>;
};
```

`lobbed` and `blocksSight` are flags, not numbers, so they aren't in the balance file.

## Commands

Unchanged. No new dependencies.

## Testing strategy

Vitest in `tests/sim/`, written first, on `blankMap` games with structures and terrain placed by hand:

- **Line check:** a straight line through a wall is blocked; a corner-touching diagonal isn't; the tower's and target's tiles never block; horizontal, vertical and diagonal lines are symmetric.
- **Sight classes:** a ground archer can't hit an enemy behind a wall, gate, rock or tree; on a wall it can; it fires over a ground cannon and a house; cannons and catapults hit through anything; only lobbed towers see through the keep.
- **Targeting:** with one visible and one hidden enemy, the tower picks the visible one even if the hidden one is nearer the keep.
- **Splash:** a cannon's blast still hits an enemy behind a wall next to its target.
- **Cache:** visibility updates when a wall is built, sold or destroyed and when a tree is cleared.
- **Overlay data:** `lineOfFire` for a ghost on a wall and the same ghost on the ground differ as the classes say; blockers are exactly the blocking tiles on blocked lines.
- **Regression:** existing tests pass; open-ground tower tests are unaffected.

Browser, by hand: the three tints and blocker outlines while placing an archer behind a wall, then on it; hover a built archer; hover info percentages.

Coverage for `src/sim/` stays at 80% lines or more.

## Boundaries

- **Always:** one `canSee` for targeting and the overlay; blocker flags in config; README updated (sight classes, why to build archers on walls).
- **Ask first:** making houses or ground towers block sight; letting cover stop splash; a third height level.
- **Never:** floating-point line stepping that can differ between platforms; working visibility out separately in the renderer.

## Success criteria

1. Ground direct-fire towers never hit enemies whose line passes through a wall, gate, ruin, wall spikes, the keep, rock or tree.
2. Direct-fire towers on walls, gates or ruins fire over all of those except the keep.
3. Cannons and catapults ignore line of sight.
4. Towers never target an enemy they can't see.
5. Placing and hovering show can-hit, blocked and blocker tiles, and they match what the tower actually hits.
6. `npm run typecheck`, `npm test`, `npm run coverage` (80%+ for `src/sim/`) and `npm run build` pass.

## Resolved decisions

1. Trees and rocks block ground towers.
2. Houses don't block; they're too small.
3. Ground towers don't block other ground towers.
4. **Cannons and catapults are lobbed** (2026-10-27): they fire over walls, with their wide arcs.
5. Showing line of sight while placing and hovering is part of this module (2026-10-27).

## Open questions

1. Can elevated towers see over trees and rocks? Proposed: yes, only the keep blocks them, so building on walls is always the "see further" option.
2. Does cover stop splash? Proposed: no.
3. Does the watchtower get a use here (for example, towers next to it count as elevated)? Proposed: no, not in this module.
