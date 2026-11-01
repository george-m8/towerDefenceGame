# Spec: units

Status: APPROVED (2026-10-26)
Module: `units` (see "Armies" and "AoE update" in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `unit-core` ([`SPEC-unit-core.md`](SPEC-unit-core.md)), which already has units, spawners, paths, combat both ways and fog sight.
Last updated: 2026-10-26

## Objective

Defensive soldiers. Three new **guard buildings** in the Defence tab each make one kind of guard, up to 3 at a time, free. Guards walk out to the tiles in front of their building (its facing, set with `R` like a tower) and defend that spot:

- **Swordsmen** chase enemies that come near their spot, fight them hand to hand, then walk back.
- **Archers** stand on their spot and shoot arrows at enemies in range.
- **Paladins** stand their ground: heavily armoured, they hold their tile and block the way, hitting softer than a swordsman.

Enemies already stop to fight a guard in their way or beside them (`unit-core`), so a line of paladins with archers behind holds a choke point, while swordsmen run out to meet what gets close.

**Player-facing outcome:** at a gap in your wall you build a paladin hall facing the gap (90g). Three paladins `]` in your colour walk out and stand in the tiles in front. Behind them an archery post sends three archers `)`, who loose arrows over the paladins. Goblins pile into the paladins and die there. A swordsman `/` from a nearby guardhouse runs out to cut down a wolf rider that slipped past, then walks back to his spot. When a paladin falls, the hall sends another 30 seconds later.

### Guard buildings

| Building | Glyph | Cost | HP | Makes | Quota | Interval |
|---|---|---|---|---|---|---|
| Guardhouse | `G` | 60 | 60 | Swordsman | 3 | 30 s |
| Archery post | `A` | 70 | 50 | Archer | 3 | 30 s |
| Paladin hall | `K` | 90 | 80 | Paladin | 3 | 30 s |

- Base layer, block movement, built like a house but **directional**: placed facing a direction (`R` rotates, as for towers), which sets where the guards stand. Spawners from `unit-core`: free, first guard when finished, then one per interval while below quota.
- In the **Defence** tab.
- Selling or losing one leaves its guards where they are, guarding their last spot, and nothing replaces them (`unit-core`).

### Guard spots

- A building's **guard area** is the two rows of three tiles in front of it, in its facing: the tile straight ahead and one either side, then the same one tile further out. That's 6 tiles at most.
- **Spots** are the guard area's tiles a unit can stand on and walk to, in order: the middle of the near row, then its sides, then the far row the same way. A building's guards take spots in the order they came out (oldest first). With fewer open tiles than guards, they share (guard 4 would share spot 1, but the quota is 3), so even a single open tile in front works.
- Spots are worked out again when the grid changes, so building over a spot moves its guard to the next open one. A guard with no open spot (everything in front built over) stays by its building.
- Without a home (building sold or destroyed), a guard keeps its last spot.

### Guard kinds and behaviour

| Guard | Glyph | HP | Armour | Damage / interval | Range | Speed | Chases | Sight |
|---|---|---|---|---|---|---|---|---|
| Swordsman | `/` | 60 | 1 | 8 / 1.0 s | 1 | 1.3 | up to 3 tiles from its spot | 4 / 6 |
| Archer | `)` | 35 | 0 | 6 / 1.2 s | 4 | 1.0 | no | 5 / 7 |
| Paladin | `]` | 120 | 4 | 5 / 1.2 s | 1 | 0.8 | no | 3 / 5 |

One new behaviour, **guard**, configured per kind by `chase` (tiles from its spot it will go after an enemy, 0 = never leaves):

1. With an enemy in reach (`range`, counting diagonals), it attacks the nearest (`unit-core`'s rule). Archers shoot: the damage lands at once and an arrow flies from archer to target, like an archer tower's shot, with the same hit sound.
2. Otherwise, if `chase` > 0 and an enemy in its sight is within `chase` tiles of its spot, it walks to a tile next to that enemy (the nearest such enemy to the spot).
3. Otherwise it walks back to its spot and stands there.

- Paladins don't need a blocking rule: enemies already stop for a unit in their way (`unit-core`), and paladins have the HP and armour to stay there. Battering rams still walk through guards, and bombers' blasts hurt them.
- Guards never target buildings. In PvP they fight rival units within reach the same way (rival towers already shoot them).
- **Hover:** `Paladin (Ann's), HP 96 / 120, guarding` / `fighting` / `chasing` / `returning`.

## Out of scope

- Offensive and exploring units, barracks, the Offence tab: `field-units`
- Food costs for guards (deferred), upkeep, healing, levelling up
- Player orders for guards (move, attack here) or changing a building's facing after it's built
- Line of sight for archers (`line-of-sight` adds `canSee` later); archers shoot over anything for now, as archer towers do
- Knockback (enemies' `weight` is there for it later)

## Data model

```ts
// src/sim/config.ts
export type UnitBehaviourId = "hold" | "gather" | "guard";
export interface UnitKind {
  ...existing;
  /** Guards: tiles from its spot it will chase an enemy (0 = never leaves its spot). */
  chase?: number;
  /** Ranged units: the projectile drawn for each shot (melee units have none). */
  projectile?: ProjectileKind;
}
UNIT_KINDS gains swordsman, archer, paladin.
STRUCTURES gains guardhouse, archeryPost, paladinHall: spawners, `directional: true`.

// src/sim/guards.ts (new)
/** The open tiles of a building's guard area, in spot order. */
export function guardSpots(state: GameState, building: Structure): Point[];
/** The spot a guard should hold: its building's spot by age, else its last one. */
export function guardSpotOf(state: GameState, unit: Unit): Point;
```

The guard behaviour lives with the others in `units.ts` (or `guards.ts` if it outgrows it). Each guard's spot is worked out when needed (cached per grid version), not stored, except the last spot a homeless guard keeps (in `unit.goal`).

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/config.ts`: guard kinds and buildings
- `src/sim/guards.ts` (new): guard areas and spots
- `src/sim/units.ts`: the guard behaviour; ranged attacks with a shot effect; re-searching when a chase target moves
- `src/ui/state.ts`: the three buildings in the Defence tab
- `src/ui/tileInfo.ts`: hover word
- `src/render/palette.ts`: glyphs and colours
- Tests: `tests/sim/guards.test.ts` (new), additions to `units` and `tileInfo` tests

## Code style

```ts
function guard(state: GameState, unit: Unit) {
  const kind = kindOf(unit);
  if (atTileCentre(unit) && attackNearest(state, unit)) return; // ranged kinds fire a shot
  const spot = guardSpotOf(state, unit);
  const target = kind.chase ? enemyToChase(state, unit, spot, kind.chase) : undefined;
  if (target) walkTowards(state, unit, `chase ${target.id}`, nextTo(target));
  else walkTowards(state, unit, `spot ${spot.x},${spot.y}`, isAt(spot));
}
```

## Testing strategy

Vitest, written before each change, with every number read from config:

- **Spots:** a building facing east has spots straight ahead, then the sides, then the far row; blocked tiles are skipped; a building with one open tile in front gives one spot that all its guards share; spots move when a tile in front is built over.
- **Buildings:** each spawns its own guard kind, up to 3, one every 30 s, once built; guards walk to their spots in age order; selling leaves them on their spots.
- **Swordsman:** chases an enemy within `chase` of its spot and kills it, then walks back; ignores an enemy further out; follows a moving target.
- **Archer:** shoots an enemy within range from its spot (damage and a shot effect), never leaves its spot.
- **Paladin:** never leaves its spot; a goblin stops at it; its armour cuts each hit (`unit-core`'s armour rule).
- **Hover:** the guard words.
- **Determinism:** the 2,000-tick test gains a paladin hall and an archery post at the keep's gate.
- **Performance:** 30 guard buildings (90 guards) and 200 enemies on XL stay within the tick budget (measured standalone; the unit test guards a loose bound).

Browser checks: guards walk out to their spots in front of each building and hold a gap; swordsmen chase and return; archers' arrows fly; replacements arrive. Coverage for `src/sim/` stays at 80% or more.

## Boundaries

- **Always:** numbers in config and tests that read them; reuse `unit-core`'s attack, damage and path code; keep the search budget; update README (guards, buildings, tuning table) and SPEC.md.
- **Ask first:** guards attacking buildings, guards leaving their spot further than `chase`, player orders, changing facing after building.
- **Never:** let guards search paths outside the per-tick budget; pay bounties to anyone but the guard's owner.

## Success criteria

1. Guardhouses, archery posts and paladin halls spawn up to 3 swordsmen, archers and paladins, who take spots in front of the building.
2. Swordsmen chase near enemies and return; archers shoot from their spot with visible arrows; paladins hold their tile.
3. Guards hold a choke point with enemies stopping to fight them.
4. It works online (units already sync) and stays within the tick budget.
5. `npm run typecheck`, `npm test` and `npm run build` pass, and coverage stays at 80% or more for `src/sim/`.

## Open questions

None.

## Resolved decisions (2026-10-26)

1. One building per guard kind: guardhouse (swordsmen), archery post (archers), paladin hall (paladins).
2. At most 3 guards per building, spread over the open tiles of two rows in front, sharing a tile when space is tight.
3. Swordsmen chase within 3 tiles of their spot; archers and paladins hold their spot.
4. Archers' shots are arrows like archer towers'.
5. Numbers as in the tables (first guesses, tunable); a new guard every 30 s.
6. Glyphs: guardhouse `G`, archery post `A`, paladin hall `K`; swordsman `/`, archer `)`, paladin `]`.
