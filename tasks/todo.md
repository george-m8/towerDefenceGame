# Tasks: enemy-pathing

Spec: [`SPEC-enemy-pathing.md`](../SPEC-enemy-pathing.md) · Plan: [`plan.md`](plan.md) (`enemy-pathing` section)

Standard verification for every task: `npm run typecheck && npm test && npm run build`

## Task 1: Fields keyed by profile (refactor)

`MovementProfile` type; `GameState.flow` becomes `flows: Partial<Record<MovementProfile, FlowField>>`; `getFlowField(state, profile = "follower")`, `nextStep(..., profile)`, `distanceAt(..., profile)`; `canCross(state, profile, x, y)` (follower: today's `isWalkable`). Snapshot, protocol and view drop `flows` like `flow`. Only `follower` is used, so nothing changes in play.

- [x] The existing suite passes untouched (apart from `flow` -> `flows` in any test that reads it)
- [x] Fields for different profiles are cached separately and rebuilt when `gridVersion` changes
- [x] A field is only built when first asked for

Files: `src/sim/types.ts`, `src/sim/pathfinding.ts`, `src/sim/game.ts`, `src/net/snapshot.ts`, `src/net/protocol.ts`, `src/net/view.ts`, `tests/sim/pathfinding.test.ts`. Size: S (mechanical). Depends on: none.

## Task 2: Wandering respects terrain (bug fix)

Wandering only picks tiles the enemy's profile can cross (`canCross`), as well as no structures and no keep.

- [x] With wander chance 1 on generated maps, no enemy ever targets a rock, tree or water tile (fails before the fix)
- [x] Existing wander tests still pass

Files: `src/sim/enemies.ts`, `tests/sim/enemies.test.ts`. Size: XS. Depends on: 1.

## Task 3: Breacher profile

`profile` on every kind (followers by default); `d`, `D`, `G` become breachers. `BREACH` config; the breacher field costs a blocking structure `1 + ceil(HP / referenceDps x referenceSpeed)` using its HP when the field is built. Enemies step by their own profile's field.

- [x] Detour 20 tiles longer than one wall: a dwarf breaks the wall, a goblin walks round
- [x] Detour only 4 tiles longer: both walk round
- [x] After a rebuild, a breacher picks a damaged wall over a full one

Files: `src/sim/config.ts`, `src/sim/pathfinding.ts`, `src/sim/enemies.ts`, `tests/sim/pathfinding.test.ts`, `tests/sim/enemies.test.ts`. Size: M. Depends on: 2.

## Task 4: Marine profile, marines and a timing test

`MARINE_COSTS` (river 2, sea 4); `canCross` lets marines onto river and sea; marine field. Rows for `m` and `M` (spec stats, descriptions, threat, first wave, mix weight). XL timing test: building all three fields stays under 20 ms.

- [ ] A marine takes a river route that's shorter than the land route; a goblin doesn't
- [ ] For equal lengths a marine prefers river to sea; no other kind ever enters water
- [ ] Building a bridge on a river tile with a marine in it is refused
- [ ] All three fields on an XL map build in under 20 ms

Files: `src/sim/config.ts`, `src/sim/pathfinding.ts`, `tests/sim/pathfinding.test.ts`, `tests/sim/enemies.test.ts`, `tests/sim/economy.test.ts`. Size: M. Depends on: 2.

## Checkpoint C (after Tasks 1-4)

- [ ] All tests pass; typecheck and build clean
- [ ] Browser: on a maze, dwarves and golems break through while goblins walk round; marines use a river on a generated map; nobody stands on rock, trees or water
- [ ] **Review breacher eagerness (`BREACH`) with George**

## Task 5: Behaviour table and bombers

`BehaviourId`, `behaviour` on every kind, `BEHAVIOURS` table in `src/sim/behaviours.ts` (run before movement; true means the turn is used). `Enemy.mode` and `targetId`. Bombers `x`/`X`: spot a player-built wall, tower, house or wall spikes within 3 tiles; sprint (2.5x) to a tile next to it along a search of up to 6 tiles; explode for 60/120 on every structure and the keep in the 3x3; die with no bounty; splash effect and an `explosion` cue (with a sound).

- [ ] Sprints only once a target is within 3 tiles; ignores ruins, bridges, floor spikes and the keep as targets
- [ ] Explodes next to its target, damaging the 3x3 and nothing outside it; never damages enemies; drops no bounty
- [ ] No explosion if killed before it arrives; no sprint if there's no short path

Files: `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/behaviours.ts`, `src/sim/enemies.ts`, `src/audio/sounds.ts` (+ `src/sim/cues.ts`), `tests/sim/behaviours.test.ts`. Size: M. Depends on: 2.

## Task 6: Bands

`leader` and `band` on kinds (`b` follows `B`, `d` follows `D`); `Enemy.leaderId`. A band member uses the leader's profile, waits rather than get more than 1 tile ahead (by field distance), and moves at 1.3x while more than 4 tiles behind; on the leader's death it uses its own profile. The stopgap mix spawns a drawn leader with a band (2-4 `b`, 2-3 `d`) on the same tile, within budget.

- [ ] Members stay at most 1 tile ahead and catch up when behind
- [ ] Members attack the wall their breaching chief or thane stops at
- [ ] Members carry on alone when the leader dies
- [ ] The mix never draws a leader whose smallest band doesn't fit the budget; total threat stays within budget

Files: `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/enemies.ts`, `src/sim/waves.ts`, `tests/sim/enemies.test.ts`, `tests/sim/waves.test.ts`. Size: M. Depends on: 3, 5.

## Task 7: Shaman and the heal effect

Row for `s`; healer behaviour: every 2 s, +6 HP (up to max) to every other enemy within 2.5 tiles. `heal` effect, drawn as a green `+` in sight.

- [ ] Heals others in range every 2 s up to max HP; not itself; not out of range
- [ ] Heal effects only on enemies actually healed

Files: `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/behaviours.ts`, `src/render/canvas.ts`, `tests/sim/behaviours.test.ts`. Size: S. Depends on: 5.

## Task 8: Battering ram and diggers

Rows for `R` (breacher, siege behaviour: no extra code yet) and `n`. Digger behaviour: spot a player-built wall or wall spikes within 4 tiles; walk to a tile next to it (search of up to 8 tiles); dig in (`mode: "digging"`), hitting that wall each interval until it falls (with its tower); then walk on. Diggers stay attackable while digging.

- [ ] A ram breaks through a maze wall; its hits are 60 every 2.5 s
- [ ] A digger digs under the nearest wall within 4 tiles, brings it (and its tower) down, then walks on
- [ ] Towers and traps still hit a digging digger

Files: `src/sim/config.ts`, `src/sim/behaviours.ts`, `tests/sim/behaviours.test.ts`, `tests/sim/enemies.test.ts`. Size: M. Depends on: 5.

## Task 9: Hover words and the network

`ClientEnemy` gains `mode` (only when not walking) and `banded` (only while its leader lives). Hover info adds `sprinting`, `digging`, `with its chief` / `with its thane`.

- [ ] `mode` and `banded` survive snapshot and update round trips, and are left out when not needed
- [ ] Hover lines for a sprinting bomber, a digging digger and a banded barbarian
- [ ] The 200-enemy update size test still passes

Files: `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/view.ts`, `src/ui/tileInfo.ts`, tests. Size: S. Depends on: 6, 7, 8.

## Checkpoint D (after Tasks 5-9)

- [ ] All tests pass; coverage 80%+ lines for `src/sim/`
- [ ] Browser: every new kind via `E` (bombers blow holes, shamans heal, bands follow, rams and diggers bring walls down); each gets a journal entry
- [ ] Online: two clients see the same behaviours
- [ ] **Review with George**

## Task 10: Determinism test and docs

A test that runs the same seed with every kind for 2,000 ticks twice and compares the state. README (enemy table with the new kinds, profiles and behaviours in plain words), SPEC.md "Since `enemy-pathing`", plan roadmap status.

- [ ] Same seed, same state
- [ ] Docs match the built behaviour

Files: `tests/sim/game.test.ts`, `README.md`, `SPEC.md`, `tasks/plan.md`. Size: S. Depends on: 9.
