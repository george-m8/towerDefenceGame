# Spec: field-units

Status: APPROVED (2026-10-26)
Module: `field-units` (see "Armies" and "AoE update" in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `units` ([`SPEC-units.md`](SPEC-units.md)) and `unit-core`. Knights and horsemen move to a later module, `elite-units` (decided 2026-10-26).
Last updated: 2026-10-26

## Objective

Units that go out and take the fight to the enemy. Three new buildings in the **Offence** tab (until now greyed out) each send out one kind:

- **Scouts** explore. They run to the nearest edge of the fog and push it back, never stopping to fight.
- **Soldiers** (melee) and **rangers** (ranged, a separate kind from the defensive archer) attack:
  - **PvP:** once your side has seen the rival's keep, they march on it over land you've explored, breaking through the weakest wall in the way, and attack it.
  - **Endless, or no rival keep found yet:** they hunt enemies your side can see anywhere on explored land. With none in sight they patrol the edge of the explored map, fighting what they meet, which also finds the rival keep in PvP.

Every offensive unit only walks on land its side has explored, so scouts open the way.

**Player-facing outcome (Endless):** you build a scout camp (40g). A scout `!` dashes out and the fog peels back as it runs along the map's edge of the unknown. A barracks (80g) sends soldiers `&` who march out to meet a wave of goblins your watchtower can see, kill them, then patrol the fog line. Rangers `}` from an archery range (90g) follow and shoot from range.

**Player-facing outcome (PvP):** your scouts find the rival keep behind a wall. Your soldiers head for it, pick the weakest stretch of wall, hack through, and start on the keep while your rangers shoot from behind. Your towers and the rival's guards fight them on the way.

### Buildings

| Building | Glyph | Cost | HP | Makes | Quota | Interval |
|---|---|---|---|---|---|---|
| Scout camp | `⚑` | 40 | 40 | Scout | 2 | 45 s |
| Barracks | `Ba` | 80 | 60 | Soldier | 4 | 30 s |
| Archery range | `◎` | 90 | 50 | Ranger | 4 | 30 s |

Base layer, block movement, spawners (free units up to the quota, `unit-core`), not directional (units leave anyway), in the **Offence** tab, which stops being greyed out. Build time applies. Selling one leaves its units out in the field, unreplaced.

### Units

| Unit | Glyph | HP | Armour | Damage / interval | Range | Speed | Sight | Behaviour |
|---|---|---|---|---|---|---|---|---|
| Scout | `!` | 20 | 0 | - | - | 2.0 | 6 / 9 | scout |
| Soldier | `&` | 70 | 2 | 10 / 1.0 s | 1 | 1.2 | 4 / 6 | attack |
| Ranger | `}` | 40 | 0 | 7 / 1.2 s | 5 | 1.1 | 5 / 8 | attack (shoots arrows) |

### Explored land only

- Offensive units' paths only cross tiles their side has explored (or can see). A scout's own sight explores new land as it goes, so the way opens behind it.
- Guards and workers are unchanged (workers already go into fog, decided in `resources`).

### Scout behaviour

1. Walk to the nearest **frontier** tile: an explored tile a unit can stand on, next to an unexplored one. One search finds the nearest of all of them.
2. On arriving, its sight explores more, the frontier moves, and it picks the next nearest. With no frontier left (the whole reachable map explored), it walks home and waits.
3. It never fights. Enemies still stop to kill one in their way or beside them.

### Attack behaviour (soldiers and rangers)

Each tick, the first of these that applies:

1. **Fight** an enemy, or in PvP a rival unit, in reach (`unit-core`'s attack; rangers shoot arrows as archers do).
2. **PvP siege:** if your side has explored any tile of a rival keep, walk to it over explored land. A path through no rival structures is taken if there is one. Otherwise the search allows breaking through rival structures, each costing its HP divided by the unit's damage per second in extra tiles (the breacher idea from `enemy-pathing`), so the weakest wall wins. A unit whose next step is a rival structure attacks it (the wall before a tower on it, as towers do) until it falls, then walks on. Next to the keep, it attacks the keep. Wrecking a rival structure pays the same bounty a tower earns.
3. **Hunt:** walk towards the nearest enemy (or rival unit, PvP) that your side can see, over explored land.
4. **Patrol:** walk to the nearest frontier tile, like a scout, fighting what comes into reach on the way.

- Units never attack neutral ruins, their own side's buildings, or (in Endless) anything but enemies.
- **Hover:** scouts `scouting` / `waiting: nothing left to explore`; soldiers and rangers `fighting`, `besieging` (heading for or hitting a rival keep or wall), `hunting` or `patrolling`.

### Facing and spawn markers (2026-10-26)

How placed buildings show their direction changes for every structure, not just these:

- **No facing notch.** The small notch that showed a building's facing goes. Arrow-drawn things (archer towers, wall spikes) keep their arrows, and a fixed tower's arc shows its direction while placing. Turning towers (cannons, catapults) fire all round, so their placed facing isn't shown anywhere.
- **Spawners show their door.** A spawner's **door** is the tile its units come out on: the tile it faces if open, else the next open one clockwise (`unit-core`'s rule, now one shared function, `spawnTileOf`).
  - **While placing** any spawner (gatherers, guard and offensive buildings), the door gets a white border. For guard buildings, the guard spots get a fainter white border too.
  - **Once built**, a very faint `S` is drawn on its door tile, over the terrain, so you can see where not to build. If the door is blocked, the `S` moves to wherever units will come out instead.
- **Every spawner faces where you choose.** Gatherers and the new offensive buildings become directional like guard buildings: `R` turns which side the door is on, shown by the marker while placing. (Until now their door was always the south side.)
- Building on a door is still allowed for now, since units come out of the next open side. Stopping it is for later.

### Building symbols (2026-10-26)

Too many buildings share single letters. Each building that spawns units or earns gold gets a **symbol** that says what it is; a two-letter code (like a country code) is the last resort when nothing sensible exists. The keep and houses get symbols too. Walls, towers, traps, bridges, gates and watchtowers keep theirs.

| Building | Was | Now |
|---|---|---|
| Keep (each tile but the HP in the middle) | `K` | `⛫` castle (U+26EB) |
| House | `h` | `⌂` house (U+2302) |
| Farmland | `"` | `𐤄` Phoenician he (U+10904), as a crop |
| Shop | `S` | `¤` currency sign (U+00A4) |
| Guardhouse | `G` | `⛨` cross on a shield (U+26E8) |
| Paladin hall | `K` | `✠` Maltese cross (U+2720) |
| Archery post | `A` | `➶` arrow (U+27B6) |
| Scout camp | - | `⚑` flag (U+2691) |
| Farmhouse | `H` | `Fa` |
| Timber yard | `L` | `Ti` |
| Mine | `M` | `Mi` |
| Forager hut | `F` | `Fo` |
| Barracks | - | `Ba` |
| Archery range | - | `◎` bullseye (U+25CE), a target |

- **No emoji.** Symbols are only used if they draw as plain text glyphs, not colour emoji (so not ⚔, ⚒, ⛏, ⚖ or ⛺, which can turn into emoji). The glyph font list gains common symbol fonts as fallbacks (Apple Symbols, Segoe UI Symbol, Segoe UI Historic, Noto Sans Symbols 2), and any symbol that shows as a box or an emoji in the browser check falls back to its two-letter code.
- Two-letter codes are drawn a little smaller to fit a tile. The build picker and hover use the same symbols.
- **The digger enemy changes from `n` to `t`** (for tunneller); `↳` (U+21B3) if `t` ever clashes. All glyphs and their reasons are listed in [`GLYPHS.md`](GLYPHS.md).

## Out of scope

- Knights and horsemen: `elite-units` (decided 2026-10-26)
- Player orders (rally points, attack here, formations)
- Circling a rival's walls to look for a gate before breaking through (they break through the weakest wall, decided 2026-10-26)
- Food costs, upkeep, healing
- AI barbarian factions using these units (`mode-barbarians`)
- Line of sight for rangers (`line-of-sight` adds `canSee` later)
- Refusing to build on a spawner's door (the marker shows it; a rule may come later)

## Data model

```ts
// src/sim/config.ts
export type UnitBehaviourId = "hold" | "gather" | "guard" | "scout" | "attack";
UNIT_KINDS gains scout, soldier, ranger (ranger has projectile: "arrow").
STRUCTURES gains scoutCamp, barracks, archeryRange (spawners).

// src/sim/unitPaths.ts
export function findPath(state, from, isGoal, options?: {
  /** Only through tiles this team has explored. */
  exploredBy?: number;
  /** PvP: rival structures may be crossed at a cost, for a unit doing `dps` damage. */
  breach?: { owner: PlayerId; dps: number };
}): Point[] | null;
// With `breach`, the search is Dijkstra (a typed-array heap), still within the per-tick budget.

// src/sim/fieldUnits.ts (new)
export function isFrontier(state: GameState, x: number, y: number, team: number): boolean;
export function knownRivalKeep(state: GameState, owner: PlayerId): Keep | undefined;
// the scout and attack behaviours, registered in units.ts's table
```

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/config.ts`: unit and building rows
- `src/sim/unitPaths.ts`: explored-only paths; breaching search
- `src/sim/fieldUnits.ts` (new): frontier, known rival keep, scout and attack behaviours, hitting rival structures
- `src/sim/units.ts`: behaviour table entries
- `src/ui/state.ts`: the Offence tab's tools
- `src/ui/tileInfo.ts`, `src/render/palette.ts`: hover words, glyphs and colours
- `src/render/canvas.ts`: no facing notch; door and guard-spot markers while placing; the faint `S` on built spawners' doors
- `src/sim/units.ts`: `spawnTileOf` shared by spawning and drawing; gatherers become directional
- Tests: `tests/sim/fieldUnits.test.ts` (new), additions to `unitPaths`, `hud` and `tileInfo` tests

## Code style

```ts
function attack(state: GameState, unit: Unit) {
  if (atTileCentre(unit) && attackNearest(state, unit)) return;
  const team = teamOf(state, unit.owner);
  const keep = knownRivalKeep(state, unit.owner);
  if (keep) return besiege(state, unit, keep);
  const prey = nearestVisibleFoe(state, unit);
  if (prey) return walkTowards(state, unit, `hunt ${prey.id}`, inReachOf(prey, unit), { exploredBy: team });
  walkTowards(state, unit, "patrol", (x, y) => isFrontier(state, x, y, team), { exploredBy: team });
}
```

## Testing strategy

Vitest, written before each change, numbers read from config:

- **Paths:** an explored-only search won't cross unexplored tiles and finds none when the goal is beyond them; a breaching search goes round when that's cheap and through the weakest wall when it isn't.
- **Buildings:** each spawns its own kind up to its quota; the Offence tab lists them and isn't greyed out.
- **Scouts:** walk to the nearest frontier, explore past it, keep going until nothing is left, then go home; never attack.
- **Hunt and patrol:** a soldier walks to and kills an enemy your side can see; with none it patrols to the frontier; it never walks on unexplored land.
- **Rangers:** shoot from range with arrows while hunting.
- **PvP siege:** once the rival keep is explored, soldiers walk to it and attack it; with a wall ring round it, they break the weakest wall and go in; the wall before the tower on it; a bounty for wrecking; never their own side's buildings or ruins.
- **Hover:** the behaviour words.
- **Doors:** `spawnTileOf` is the facing tile, else the next open one clockwise, else none; a gatherer placed facing west spawns its workers to the west. (The markers themselves are checked in the browser.)
- **Determinism:** the 2,000-tick test gains a scout camp and a barracks; a PvP determinism run with a siege.
- **Performance:** 20 offensive buildings (60 units) and 200 enemies on XL within the tick budget (median and 95th percentile, as the other timing tests).

Browser checks: no notches anywhere; placing a spawner borders its door (and a guard building's spots); built spawners show a faint `S` on their door, which moves when the door is blocked; `R` turns a gatherer's door; scouts reveal the map; soldiers and rangers hunt a wave in Endless; in PvP (two browsers) they find and break into the rival's keep. Coverage for `src/sim/` stays at 80% or more.

## Boundaries

- **Always:** numbers in config and tests that read them; every new or changed glyph recorded in [`GLYPHS.md`](GLYPHS.md) with why; every search within the per-tick budget; reuse `unit-core` and `units` code (attacks, shots, `walkTowards`); update README (Offence tab, units, tuning table) and SPEC.md.
- **Ask first:** offensive units walking into unexplored land, attacking neutral ruins, player orders, circling walls before breaching.
- **Never:** attack their own side's buildings; search without the budget; pay a bounty for killing units.

## Success criteria

1. The Offence tab offers a scout camp, barracks and archery range, spawning scouts, soldiers and rangers.
2. Scouts explore the map's fog without fighting.
3. Soldiers and rangers hunt visible enemies, else patrol the frontier, only over explored land.
4. In PvP they find the rival keep, break through its weakest wall and attack it.
5. Online works (units already sync) and ticks stay within budget.
6. No building shows a facing notch; spawners show their door while placing and once built, and `R` turns every spawner's door.
7. `npm run typecheck`, `npm test` and `npm run build` pass, and coverage stays at 80% or more for `src/sim/`.

## Open questions

None.

## Resolved decisions (2026-10-26)

1. One building per kind: scout camp, barracks, archery range, in the Offence tab.
2. Scouts, soldiers and rangers now; knights and horsemen in `elite-units`, built after the enemy work (`enemy-targeting`, `wave-director`).
3. Endless: hunt visible enemies, else patrol the fog edge. PvP: march on a known rival keep, breaking through the weakest wall.
4. Numbers as in the tables (first guesses).
5. Unit glyphs scout `!`, soldier `&`, ranger `}`. Buildings that spawn or earn get a symbol where a sensible one exists, else a two-letter code; the keep `⛫`, houses `⌂`, farmland `𐤄` (table above).
6. No facing notch on anything. Spawners show their door while placing and once built (a faint `S`), and every spawner turns its door with `R`, so it isn't trapped by your own walls.
