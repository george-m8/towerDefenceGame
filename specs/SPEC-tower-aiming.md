# Spec: tower-aiming

Status: APPROVED (2026-10-24)
Module: `tower-aiming` (see [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `tile-layers` ([`SPEC-tile-layers.md`](SPEC-tile-layers.md)).
Last updated: 2026-10-24

## Objective

Towers stop being turrets that see in every direction at once. Each tower faces a direction when it is placed and can only fire inside its **field of fire** (its arc). Some towers are fixed and never turn. Others turn, but take time to swing round onto a new target. Where you point a tower now matters as much as where you put it.

**Player-facing outcome:** pick the archer, press `R` to point it east, and place it on a wall overlooking a corridor. While placing, an overlay shows the quarter circle it covers. A cannon can face anywhere but visibly swings round to track enemies, so a fast group slipping past its side may get through before it lines up.

### Arcs and turning

| Tower | Arc | Turns? | Turn speed | Notes |
|---|---|---|---|---|
| Archer | 90° | no | - | Fixed. Covers 45° either side of its facing. |
| Cannon | 360° | yes | 90°/s (config) | Takes up to 2 s to swing right round. |
| Catapult | 360° | yes | 30°/s (config) | Very slow. Struggles to follow targets that move across it. Its minimum range is unchanged. |

All numbers live in `STRUCTURES[kind].tower` in config.

- **Facing** uses the existing 4-way `Facing` (N, E, S, W) and the `R` key, the same as wall spikes. Every tower now gets a facing when it's placed.
- **Facing is permanent.** To change it, sell the tower and rebuild it.
- **Angles** are measured from the tower's tile centre to the enemy's position. N is up the screen (negative y), and angles increase clockwise (E = 90°).
- **Fixed towers** (arc under 360°, turn speed 0) can target an enemy only if it is in range **and** inside the arc. An enemy exactly on the arc's edge counts as inside.
- **Turning towers** have an `aim` angle, which starts on their facing. Each tick they pick a target, turn towards it by at most `turnDegreesPerSecond / TICK_RATE`, taking the shorter way round, and fire once their shot would hit (below). The fire cooldown keeps counting down while they turn.
- **When a turning tower fires** (revised after play-testing): a splash shell lands where the barrel points, at the target's distance. The tower fires as soon as that landing point is within its splash radius of the target, so close targets allow a wider aim error than far ones. The blast is centred on the landing point, not on the target. Turning towers without splash fall back to the **aim tolerance** (5°, config).
- **Target choice:**
  - **Fixed towers** pick the in-arc enemy closest to the keep by path distance (ties: lowest id), as before.
  - **Turning towers** (revised after play-testing) pick the in-range enemy that needs the **least turning** from their current aim (ties: closest to the keep, then lowest id). Chasing the most urgent enemy meant a cannon spent its time swinging round after each kill instead of firing at whatever was in front of it.
  - Both re-pick every tick.
- A tower on a wall and a tower on the ground aim the same way. Height only matters in `line-of-sight`.

### Overlay

- **While placing a tower:** tiles that are in range and inside the arc for the current facing are tinted. Tiles inside the minimum range are left untinted.
- **While hovering a placed tower:** the same tint for that tower. Turning towers also show a short line along their current aim.
- The styling is deliberately simple for now. The red-highlight look comes later.

### Hover info

Tower hover info adds its facing and arc, e.g. `Archer on wall, facing east, 90° arc`. Turning towers show `turns 90°/s`.

## Out of scope

- Line of sight: walls blocking shots (`line-of-sight`)
- Rotating a placed tower
- 8-way or free-angle facing
- Units and spawner facing (`units` reuses the facing, but its rules live in that spec)
- The red-highlight overlay style

## Data model

```ts
// src/sim/config.ts
export interface TowerStats {
  ...existing,
  /** Field of fire, centred on the facing. 360 = all round. */
  arcDegrees: number;
  /** 0 = fixed: never turns, fires at anything in its arc. */
  turnDegreesPerSecond: number;
}
export const AIM_TOLERANCE_DEGREES = 5;

// src/sim/types.ts
export interface Structure {
  ...existing,
  facing?: Facing; // now set for every tower as well as directional traps
  /** Current aim in degrees (towers that turn only). */
  aim?: number;
}
```

`placeStructure` sets `facing` on towers and starts `aim` at the facing's angle. The arc and angle maths live in a small pure module, `src/sim/aiming.ts` (`angleTo`, `inArc`, `turnTowards`), so both `towers.ts` and the overlay call the same functions. That keeps the overlay and the simulation from disagreeing.

## Commands

Unchanged. No new dependencies.

```
npm run typecheck
npm test
npm run coverage
npm run build
npm run dev
```

## Testing strategy

Vitest unit tests in `tests/sim/`, written before each change, on `blankMap` games:

- **Angle maths:** `angleTo` for each compass direction and the diagonals; `inArc` at the centre, on the edge, and just outside; `turnTowards` takes the shorter way round, including across 0°/360°, and never overshoots.
- **Fixed towers:** an archer facing E fires at an enemy to its east and ignores an equally close enemy to its west, even when the western one is closer to the keep.
- **Turning towers:** a cannon facing N with an enemy due S doesn't fire until it has turned far enough for its blast to catch the enemy (just under 2 s at 90°/s), then fires. A catapult takes about 3x as long. Turning towers pick the enemy nearest their barrel over a more urgent one behind them.
- **Placement:** every tower gets the facing it was built with, and `aim` starts there.
- **Regression:** existing tower tests pass. Tests that relied on 360° archers are updated to face the target (their intent stays the same).

Coverage stays at 80% lines or more for `src/sim/`. Check the overlay and turning in the browser.

## Boundaries

- **Always:** keep every arc and turn number in config; send the overlay and targeting through the same `aiming.ts` functions; update README (facing, arcs, `R` for towers).
- **Ask first:** changing target choice (closest to keep); adding facings beyond N/E/S/W; new dependencies.
- **Never:** let the overlay compute arcs separately from the simulation; use `Math.random`.

## Success criteria

1. Every tower is placed with a facing, chosen with `R`, and shown on its glyph or overlay.
2. An archer never fires at an enemy outside its 90° arc.
3. Cannons and catapults visibly turn towards targets at their configured speeds, prefer the enemy nearest their barrel, and fire once their blast would catch the target.
4. The placement overlay shows exactly the tiles the tower could fire at (range, minimum range and arc) for the current facing.
5. Hover info shows facing, arc and turn speed.
6. All tests pass. `npm run typecheck`, `npm test` and `npm run coverage` (80% or more for `src/sim/`) pass.

## Resolved decisions

1. **Archer arc** is 90°, not the 30° in the capability map. At range 5, 30° covered under one tile up close, so archers would barely fire.
2. **Catapult** turns all the way round, very slowly (30°/s).
3. **Facing is permanent.** Sell and rebuild to change it.
4. **Facing stays 4-way** (N, E, S, W), reusing the existing `R` rotation.
5. **Play-test revision (2026-10-24):** turning towers target the enemy nearest their barrel, and splash towers fire once the blast would catch the target. Turning towers were spending most of their time re-aiming after each kill.

## Open questions

None.
