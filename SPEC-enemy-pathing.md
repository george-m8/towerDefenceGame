# Spec: enemy-pathing

Status: APPROVED (2026-10-25)
Module: `enemy-pathing` (see "Armies" in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `enemy-kinds` ([`SPEC-enemy-kinds.md`](SPEC-enemy-kinds.md)) and `bestiary` ([`SPEC-bestiary.md`](SPEC-bestiary.md)).
Last updated: 2026-10-25

## Objective

Enemies stop all thinking alike. Some still take the path of least resistance, however long. Others work out that smashing through a wall is quicker than walking round it. Marines slip in along rivers and the sea. Dwarf bombers hunt for walls to blow up, diggers undermine them, shamans heal the horde, battering rams pound the walls, and barbarians and dwarves march in bands behind their leaders.

**Player-facing outcome:** a long winding maze still holds goblins, zergs, wolf riders and barbarians, who walk all the way round. Dwarves, golems and rams look at the same maze and break through the thinnest point instead. Marines walk down the river past your walls. A small `x` spots your wall from 3 tiles away, sprints at it and blows a hole in it. A chief `B` arrives with three or four `b`s trailing him, and they attack whatever he attacks.

### Movement profiles

A movement profile decides which tiles an enemy can cross and what each one costs. Each profile has one cached flow field (Dijkstra from the keep, as today), rebuilt when `gridVersion` changes. Fields are built lazily, the first time an enemy with that profile needs one. That's at most 3 fields, never one per enemy.

| Profile | Can cross | Cost of a blocking structure | Kinds |
|---|---|---|---|
| **Follower** | Walkable land, fords, bridges | More than any open route (today's rule) | `g`, `z`, `w`, `b`, `x`/`X`, `s`, `n` |
| **Breacher** | Walkable land, fords, bridges | 1 + the tiles it could have walked while breaking it: `ceil(HP / BREACH.referenceDps x BREACH.referenceSpeed)` | `d`, `D`, `G`, `R` |
| **Marine** | Land, fords, bridges, **river** (cost 2) and **sea** (cost 4) | More than any open route | `m`, `M` |

- **Breacher costs** use each structure's HP when the field is built. Starting values: `referenceDps` 8, `referenceSpeed` 1, so a full 50 HP wall costs 8 tiles. A breacher breaks a wall whenever the way round is more than about 8 tiles longer. Damaged walls are cheaper, so breachers favour the weak spot. Because the field is only rebuilt on grid changes, HP lost to attacks doesn't move it until something is built, sold or destroyed.
- What a breacher attacks is unchanged: the blocking structure on its path step (`attackTargetAt`, so a wall shields its tower).
- **Marines** never stop in water to fight; they only attack blocking structures on land, like followers. Building a bridge on a river tile with an enemy in it is refused, as it already is for selling one.
- **Wandering** checks the enemy's own profile: an enemy only wanders onto a tile its profile can cross. **This fixes an existing bug:** today wandering only checks for structures, so enemies drift onto rock, trees and water (about 4% of enemy-ticks across 10 seeds).
- **Enclosures** are still measured by land walkers. A marine can reach a coastal "enclosure" by water and the discount stays. That's a known gap, revisited in `wave-director` when reachability moves to the map edge.

### Behaviours

A behaviour is what an enemy does on top of following its profile's field. Behaviours are a table of functions keyed by id (`BEHAVIOURS`), so a new kind is a config row plus at most one function.

**Follower** (default): today's walking, wandering and attacking.

**Leader and band** (`b` with `B`, `d` with `D`)
- A band member records its leader's id. While the leader lives, the member uses the **leader's profile** (so barbarians follow a breaching chief through the wall he picks) and stays close: it waits rather than step more than 1 tile ahead of the leader along the path (by field distance), and moves at 1.3x speed while more than 4 tiles behind.
- Band members attack whatever is on their path step, so when the leader stops at a wall, the band piles in on the same wall.
- When the leader dies, members carry on alone with their own profile (decided 2026-10-25).
- In the stopgap wave mix, a drawn leader spawns with a band on the same tile: 2-4 `b` with a `B`, 2-3 `d` with a `D`, with their threat taken from the budget. If the budget can't cover the smallest band, the leader isn't drawn.

**Bomber** (`x`, `X`, dwarf bombers)
- Walks the follower field until a player-built **wall, tower, house or wall spikes** is within its sight (3 tiles, straight-line distance, ignoring fog and line of sight). Ruins, bridges, floor spikes and the keep don't attract it.
- It then **sprints** (2.5x speed) to a tile next to the nearest such structure, along a short path (breadth-first search limited to 6 tiles). If there's no such path, it ignores that structure.
- On arriving it **explodes**: damage to every structure (and the keep) in the 3x3 around it, then it dies. It drops no bounty (nobody killed it). Explosions never hurt enemies. Damage to player units arrives with `units`.
- If killed before it gets there, it doesn't explode.
- A splash effect and an explosion cue play.

**Healer** (`s`, shaman): every 2 s, heals every other enemy within 2.5 tiles by 6 HP, up to their max. It never heals itself. A heal effect (green `+`) shows on each enemy healed, in sight only.

**Siege** (`R`, battering ram): a breacher with very high HP and huge, slow hits. It attacks structures and the keep. Once `units` exists it will ignore units entirely (noted here so `units` keeps it).

**Digger** (`n`)
- Walks the follower field until a player-built **wall** (or wall spikes) is within 4 tiles. It then walks (normal speed, breadth-first search limited to 8 tiles) to a tile next to the nearest one, and **digs in**.
- While digging it stays where it is and **can still be attacked** by towers and traps (decided 2026-10-25). Each interval it damages that wall from below. When the wall falls (and any tower on it with it), it carries on walking.
- No tunnel is left: the wall is simply destroyed.

### Roster additions

Starting values, tuned in play. Same columns as `enemy-kinds`, plus profile and behaviour.

| Glyph | Kind | HP | Speed | Damage / interval | Bounty | Threat | From wave | Profile | Behaviour | Variants |
|---|---|---|---|---|---|---|---|---|---|---|
| `m` | Marine | 25 | 1.4 | 5 / 1.0s | 3 | 2 | 7 | marine | follower | raider |
| `x` | Dwarf bomber | 18 | 1.0 | blast 60 | 4 | 3 | 8 | follower | bomber | sapper |
| `s` | Shaman | 30 | 1.2 | 3 / 1.0s | 6 | 4 | 8 | follower | healer | elder |
| `n` | Digger | 20 | 1.2 | 6 / 1.0s | 4 | 3 | 9 | follower | digger | tunneller |
| `M` | Marine captain | 60 | 1.2 | 10 / 1.0s | 8 | 5 | 11 | marine | follower | captain |
| `X` | Dwarf demolisher | 40 | 0.9 | blast 120 | 9 | 6 | 11 | follower | bomber | demolisher |
| `R` | Battering ram | 400 | 0.5 | 60 / 2.5s | 30 | 18 | 12 | breacher | siege | ram |

Existing kinds get profiles: `d`, `D`, `G` become breachers. Everyone else stays a follower. `b` and `d` get their leaders.

### Drawing, hover and network

- Heal effects join the existing effect list sent to clients. Explosions use the existing splash effect.
- `ClientEnemy` gains `mode` (sent only when not walking) and `banded` (true while it has a living leader), so hover info can add what an enemy is doing: `sprinting`, `digging`, `with its chief` / `with its thane`.
- The `D` path overlay keeps showing the follower field.

## Out of scope

- Choosing houses or towers as targets (`enemy-targeting`)
- Group spawning from edge points, and enclosures for marines (`wave-director`)
- Bombers and rams against player units (`units`)
- Flying enemies (decided 2026-10-25: not for now)

## Data model

```ts
// src/sim/config.ts
export type MovementProfile = "follower" | "breacher" | "marine";
export type BehaviourId = "follower" | "bomber" | "healer" | "siege" | "digger";
export interface EnemyKind {
  ...existing;
  profile: MovementProfile;
  behaviour: BehaviourId;
  /** Band members: the kind they follow. */
  leader?: EnemyKindId;
  /** Leaders: band size spawned with them (stopgap mix). */
  band?: { kind: EnemyKindId; min: number; max: number };
  /** Bombers, healers, diggers. */
  ability?: { sight?: number; radius?: number; amount?: number; interval?: number; sprint?: number };
}
export const BREACH = { referenceDps: 8, referenceSpeed: 1 };
export const MARINE_COSTS = { river: 2, sea: 4 };

// src/sim/types.ts
export interface Enemy {
  ...existing;
  leaderId: number | null;
  /** What it's doing beyond walking. */
  mode: "walking" | "sprinting" | "digging";
  /** The structure a bomber or digger is heading for or digging under. */
  targetId: number | null;
}
export type Effect = ... | { kind: "heal"; x: number; y: number; ttl: number };
// GameState.flow becomes flows: Partial<Record<MovementProfile, FlowField>>

// src/sim/pathfinding.ts
export function getFlowField(state: GameState, profile?: MovementProfile): FlowField; // default "follower"
export function nextStep(state, x, y, avoid?, profile?): Point | null;
export function canCross(state: GameState, profile: MovementProfile, x: number, y: number): boolean;

// src/sim/behaviours.ts (new): BEHAVIOURS table, bomber, healer, digger
```

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/config.ts`: profiles, behaviours, new kinds, `BREACH`, `MARINE_COSTS`
- `src/sim/pathfinding.ts`: fields per profile, `canCross`
- `src/sim/enemies.ts`: profile-aware movement and wandering, bands
- `src/sim/behaviours.ts` (new): bomber, healer, digger
- `src/sim/waves.ts`: bands in the stopgap mix
- `src/net/*`, `src/render/*`, `src/ui/tileInfo.ts`: heal effect, digging, hover words
- `tests/sim/pathfinding.test.ts`, `tests/sim/enemies.test.ts`, `tests/sim/behaviours.test.ts` (new)

## Code style

Behaviours are small functions in a table, called before normal movement. One returns true when it has used the enemy's turn:

```ts
type Behaviour = (state: GameState, enemy: Enemy) => boolean;

export const BEHAVIOURS: Record<BehaviourId, Behaviour> = {
  follower: () => false,
  siege: () => false, // a breacher that will ignore units (see units)
  healer: heal,
  bomber: bomb,
  digger: dig,
};
```

## Testing strategy

Vitest unit tests in `tests/sim/`, written before each change, on blank maps with hand-placed walls, water and terrain:

- **Refactor first:** fields keyed by profile with only `follower` in use; the existing suite passes untouched.
- **Wander bug:** with wander chance 1, enemies never step onto rock, trees or water (fails today).
- **Breacher:** in a maze where walking round is 20 tiles longer than breaking one wall, a dwarf breaks the wall and a goblin walks round; with a detour of only 4 tiles, both walk; a breacher prefers a damaged wall to a full one when the field is rebuilt.
- **Marine:** with the keep reachable by a river route shorter than the land route, a marine uses the river and a goblin doesn't; marines prefer river to sea for equal length; nobody else ever enters water.
- **Bands:** members stay within 1 tile ahead and catch up when behind; they attack the leader's wall; they carry on alone when the leader dies; the stopgap mix spawns leaders with bands within budget.
- **Bomber:** sprints only once a target is within 3 tiles; explodes next to it, damaging the 3x3 and nothing outside; drops no bounty; never damages enemies; no explosion if killed first; ignores ruins and the keep as targets.
- **Healer:** heals others in radius every 2 s up to max HP, not itself, not out of range.
- **Digger:** digs under the nearest wall within 4 tiles, damages it each interval until it falls (with its tower), then walks on; towers and traps still hit it while it digs.
- **Determinism:** the same seed with all kinds gives the same state after 2,000 ticks, run twice.
- **Performance:** rebuilding all 3 fields on an XL map stays under 20 ms (measured in a test with a generous bound).
- **Regression:** everything else passes; coverage stays at 80% or more for `src/sim/`.

Browser checks at the plan's checkpoints: breachers vs followers on a maze, marines on a river map, each behaviour seen via `E`, an online game with two clients.

## Boundaries

- **Always:** one field per profile, never per enemy; numbers in config; state RNG for every roll; profile-aware walkability everywhere an enemy moves; update README (enemy table, behaviours) and SPEC.md.
- **Ask first:** letting more kinds into water; explosions hurting enemies; changing what bombers or diggers target; new dependencies.
- **Never:** per-enemy pathfinding over the whole map; recompute fields every tick; let followers or breachers enter water.

## Success criteria

1. Three movement profiles with cached fields; followers keep today's behaviour; breachers break through when it's cheaper; marines cross water, preferring river.
2. No enemy ever stands on a tile its profile can't cross (wander bug fixed).
3. Bands stay with their leader and fall back to their own profile when it dies.
4. Bombers, shamans, rams and diggers behave as described, locally and online.
5. The seven new kinds exist, appear in the stopgap mix from their first wave and get journal entries.
6. `npm run typecheck`, `npm test` and `npm run coverage` (80% or more for `src/sim/`) pass.

## Open questions

None.

## Resolved decisions (2026-10-25)

1. **Breacher reference numbers:** a full wall costs 8 tiles of detour to start; tuned in play.
2. **Bombers and the keep:** they don't seek the keep, but the keep is damaged if it's inside a blast.
3. **Diggers stay attackable** while digging.
4. **Marine spawns:** until `wave-director`, marines spawn on the normal strip and only use water when it's quicker.
