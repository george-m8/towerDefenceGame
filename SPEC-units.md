# Spec: units

Status: DRAFT (awaiting review)
Module: `units` (see [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `tile-layers`, and reuses facing from `tower-aiming` and `canSee` from `line-of-sight`.
Last updated: 2026-10-24

## Objective

The player gets soldiers. Spawner buildings produce units that walk out, take up a post and fight. Some stand in the way and soak up hits, some ride out to meet enemies, and some shoot from behind the line. Enemies stop to fight units that block them, and fight back when they're struck. This is the foundation for workers (`resources`) and AI armies (`mode-barbarians`).

**Player-facing outcome:** build a Barracks facing a ford. Three footmen march out and stand on the ford. Enemies stop to fight them instead of walking past, while archers on the walls behind shoot them down. When a footman falls, a new one walks out after a short wait.

### Spawners and units

One spawner per unit type. Each spawner's unit has a fixed behaviour.

| Spawner | Cost | HP | Unit | Limit | Respawn | Behaviour |
|---|---|---|---|---|---|---|
| Barracks | 60 | 80 | Footman | 3 | 10 s | **Hold** |
| Stables | 80 | 80 | Rider | 2 | 15 s | **Charge** |
| Archery range | 70 | 60 | Bowman | 2 | 12 s | **Guard** |

| Unit | HP | Damage | Attack interval | Reach | Speed | Sight |
|---|---|---|---|---|---|---|
| Footman | 60 | 5 | 1 s | 1 (melee) | 1.2 tiles/s | 1 |
| Rider | 40 | 8 | 1 s | 1 (melee) | 2.5 tiles/s | 5 |
| Bowman | 20 | 4 | 1 s | 4 | 1.2 tiles/s | 4 |

All numbers are starting values in config (`UNITS` and the spawner rows in `STRUCTURES`).

- **Spawners** are base-layer buildings, like houses. They block movement, have HP, can be attacked when they block the route, can't hold a tower, and sell as usual.
- **The spawner's price covers its units.** Respawns are free. The unit limit and respawn timer are the balance levers.
- **Facing** is chosen with `R` when placing, as for towers. The **spawn tile** is the tile directly in front, and the **rally tile** is 2 tiles in front (config). Both must be walkable and free of blocking structures, or the build is rejected (`Rally point is blocked`).
- A spawner keeps its units topped up to its limit: whenever it's below the limit, the respawn timer runs, and a new unit appears on the spawn tile when it reaches zero. The first unit appears immediately after the spawner is built.
- **When a spawner is sold or destroyed, its units disappear.**

### Movement

- Units move tile to tile along orthogonal steps, like enemies, on walkable tiles without a blocking structure. Bridges and fords are walkable. Floor spikes are walkable and don't hurt units.
- Units find their way with a breadth-first search to their goal tile, cached per goal and `gridVersion`. They're **not** part of the enemies' flow field, so units moving around never trigger a re-route.
- If a unit's goal becomes unreachable (e.g. a wall is built over the rally tile), it waits where it is until a route opens.
- **Several units can share a tile.** The renderer shows a count when more than one is on a tile.

### Behaviours

- **Hold (footman):** walk to the rally tile and stay there. Attack any enemy within reach. Never move off the rally tile to chase.
- **Charge (rider):** if an enemy is within sight of the rider **and** within the **leash** (6 tiles from the rally tile, config), walk towards the nearest one and fight it in melee. When none is left, return to the rally tile.
- **Guard (bowman):** walk to the rally tile and stay there. Shoot the enemy closest to the keep (the same rule towers use) within reach that it can see, using **ground** line of sight from `line-of-sight`.

All units target the nearest enemy in reach, apart from guards, which use the tower rule. Ties go to the lowest id.

### Enemies and units

- **Blocked:** when an enemy's next step lands on a tile with one or more units, it stops and attacks one of them (lowest id) instead of moving, the same way it attacks a blocking structure. It uses its existing attack cooldown and `ENEMY.unitDps` (5, config).
- **Retaliation:** an enemy that's been hit by a unit standing within melee reach (adjacent, including diagonals) stops and fights that unit until one of them dies or the unit moves out of reach. Then it carries on along its route.
- Enemies never leave their route to chase a unit. An enemy hit from range by a bowman that isn't next to it keeps walking.
- **Units don't stop the flow field:** enemies still route as if units weren't there. Units only make them stop.
- **No friendly fire.** Tower shots and splash never hurt units, and traps never trigger on units.
- Killing an enemy with a unit pays the normal bounty. Dead units pay nothing.

### Factions

`Unit` and `Enemy` both get a `faction` field (`"player"` / `"enemy"`). Combat helpers take any two combatants of opposite factions, so `mode-barbarians` can add more factions without rewriting combat.

### Hover info and rendering

- Unit glyphs: footman `f`, rider `r`, bowman `b`, in the player's colour, with an HP bar like enemies have.
- Spawner hover info: `Barracks, facing east, 2/3 footmen, next in 4 s`. Unit hover info: `Footman (hold), 45/60 HP`.
- While placing a spawner, the spawn and rally tiles are highlighted. The rally tile turns red if it's blocked.
- Keys: the three spawners get the next free build keys (`9`, `0`, `-`).

## Out of scope

- Food costs (`resources`). With the economy off, units cost gold only, through the spawner price.
- Moving the rally point after placing, or commanding units directly
- Unit upgrades, healing, or experience
- Units collecting treasure chests (a later module, per `map-gen`)
- Enemy units or enemy factions (`mode-barbarians`)
- Units blocking the flow field

## Data model

```ts
// src/sim/types.ts
export type Faction = "player" | "enemy";
export type UnitKind = keyof typeof UNITS;
export type Behaviour = "hold" | "charge" | "guard";

export interface Unit {
  id: number;
  kind: UnitKind;
  faction: Faction;
  spawnerId: number;
  x: number; y: number;   // fractional while moving, like Enemy
  tx: number; ty: number;
  hp: number; maxHp: number;
  attackCooldown: number;
  /** Enemy it is currently fighting, if any. */
  targetId?: number;
}
export interface Enemy { ...existing; faction: Faction; /** Unit it is fighting back against. */ engagedWith?: number }
export interface Structure { ...existing; /** Spawners only. */ respawnTimer?: number }
export interface GameState { ...existing; units: Unit[] }

// src/sim/config.ts
export const UNITS = {
  footman: { name: "Footman", behaviour: "hold", hp: 60, damage: 5, attackIntervalSeconds: 1, reach: 1, speed: 1.2, sight: 1 },
  ...
};
export interface StructureStats { ...existing; spawner?: { unit: UnitKind; limit: number; respawnSeconds: number } }
export const RALLY_DISTANCE = 2;
export const CHARGE_LEASH = 6;
// ENEMY gains unitDps.
```

New file `src/sim/units.ts` for spawning, movement and behaviours, plus `src/sim/combat.ts` for the shared attack helpers used by units and enemies. `tick` runs `updateSpawners` and `updateUnits` after `updateEnemies`.

## Commands

Unchanged. No new dependencies.

## Testing strategy

Vitest unit tests in `tests/sim/`, written before each change, on `blankMap` games:

- **Spawning:** a spawner produces its first unit at once, tops up to its limit at the respawn interval, never goes over the limit, and charges no gold for respawns. Building with a blocked rally tile is rejected. Selling or destroying a spawner removes its units.
- **Movement:** units reach the rally tile around walls; they never step onto water, rock, trees or blocking structures; an unreachable goal makes them wait, and they move again once a route opens.
- **Hold:** a footman on a corridor stops an enemy, which attacks it, and the enemy carries on after the footman dies. The flow field's `version` doesn't change when units move.
- **Charge:** a rider leaves the rally tile for an enemy in sight and leash, ignores enemies outside the leash, and returns afterwards.
- **Guard:** a bowman shoots the visible enemy closest to the keep in reach and doesn't shoot through a wall.
- **Retaliation:** an enemy hit by an adjacent unit stops and fights it; an enemy hit by a bowman 3 tiles away keeps walking.
- **No friendly fire:** cannon splash and floor spikes don't hurt units.
- **Determinism:** the same seed and commands give the same unit positions and HP after N ticks.
- **Regression:** existing tests pass.

Coverage stays at 80% lines or more for `src/sim/`. Check the hold, charge and guard behaviours in the browser.

## Boundaries

- **Always:** keep every unit and spawner number in config; keep unit logic deterministic; route the guard's sight through `canSee`; update README (spawners, behaviours, enemies fighting units).
- **Ask first:** making units part of the flow field; adding unit costs or upkeep; letting enemies chase units; new dependencies.
- **Never:** use `Math.random`; let tower or trap damage hit player units.

## Success criteria

1. Barracks, Stables and Archery range can be built with a facing, and they produce footmen, riders and bowmen up to their limits with timed, free respawns.
2. Footmen hold the rally tile and stop enemies, which fight them.
3. Riders charge enemies within sight and leash, then return to the rally tile.
4. Bowmen shoot visible enemies from the rally tile.
5. Enemies fight back against adjacent units that hit them, and never leave their route to chase.
6. Units never hurt or block towers' targeting, and towers and traps never hurt units.
7. All tests pass. `npm run typecheck`, `npm test` and `npm run coverage` (80% or more for `src/sim/`) pass.

## Resolved decisions

1. **One spawner per unit type**, each with a fixed behaviour.
2. **The spawner's price covers all its units.** Respawns are free, balanced by the limit and respawn timer.
3. **Rally tile** is a set distance (2) in front of the spawner, in the facing chosen with `R`.
4. **Enemies retaliate** against units that attack them.

## Open questions

1. **Retaliation against ranged attackers:** enemies only have melee attacks and never leave their route, so in this draft an enemy fights back only against units **next to it**. A bowman shooting from 3 tiles away is safe. Is that what you meant, or should enemies step off their route to chase whoever shot them? Chasing needs per-enemy pathfinding, which is a much bigger change.
2. **Shared tiles:** this draft lets several units stand on one tile (simpler, with a count shown). The alternative is one unit per tile, with hold units spreading around the rally tile. Is stacking acceptable?
3. **Units disappearing** when their spawner is sold or destroyed. Proposed: yes, for simplicity. The alternative is that they fight on until they die but aren't replaced.
