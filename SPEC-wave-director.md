# Spec: wave-director

Status: DRAFT (awaiting review)
Module: `wave-director`, with `edge-spawns` folded in (see "Next up" in [`CAPABILITIES.md`](CAPABILITIES.md) and [`tasks/roadmap.md`](tasks/roadmap.md)). Builds on `enemy-kinds` ([`SPEC-enemy-kinds.md`](SPEC-enemy-kinds.md)), `enemy-pathing` ([`SPEC-enemy-pathing.md`](SPEC-enemy-pathing.md): bands, marines), `night-spawns` ([`SPEC-night-spawns.md`](SPEC-night-spawns.md)) and `balance-files` ([`SPEC-balance-files.md`](SPEC-balance-files.md)). Replaces the outline in [`tasks/plan.md`](tasks/plan.md) ("`wave-director`") and the stopgap mix from `enemy-kinds`.
Last updated: 2026-10-27

## Assumptions (correct these before approval)

1. The wave's size stays as it is today: a threat budget of `baseCount + countPerWave x wave` (times the balance file's `enemyCount`). This module changes what the budget is spent on and where it enters, not how big waves are.
2. Band following is already built (`BAND`, `leaderId`). New groups reuse it rather than adding a new follow rule.
3. "All round the map" means the map's outer edge, not anywhere in the fog.
4. In-game names for the new leaders are placeholders (goblin boss, zerg brood) to be settled at review, glyphs included.
5. PvP has no waves, so nothing here changes PvP.

## Objective

Waves feel like armies arriving rather than a stream of random enemies. Enemies of the same kind come together, small ones follow their leader into battle, marine raiders land from the sea, and (as a setup option) enemies come from any side of the map instead of one strip.

1. As a player, I see a wave arrive as a few **groups**: a goblin pack here, a barbarian warband there, a swarm of zergs. Mostly one kind per group, sometimes with a few supporters (a shaman with a warband).
2. Small enemies **follow their leader**: a band marches with its chief, waits for it and hurries to catch up (today's band rule), and more kinds get leaders.
3. **Marine groups** come from the sea when the map has a coast, and swim in to land.
4. When setting up an Endless game I choose **Enemies enter: Spawn zone / All round the map**. With all round, each group enters at its own point on the map edge, and different groups in one wave come from different sides.
5. A few seconds before a group enters, a **marker** on the map edge and a horn warn me where, even in fog.

## Rules

### Groups

- A **group template** is a config row: an id, a name for hover info, its members, a weight, and the first wave it can appear in.

  ```ts
  { id: "warband", name: "Barbarian warband", firstWave: 7, weight: 3,
    leader: "barbarianChief",
    members: [{ kind: "barbarian", min: 2, max: 4 }],
    support: [{ kind: "shaman", chance: 0.3 }] }
  ```

- **First templates** (numbers to tune with the balance file):

  | Template | Members | First wave |
  |---|---|---|
  | Goblin pack | 4-8 `g` | 1 |
  | Goblin raid | goblin boss + 5-10 `g` | 5 |
  | Zerg swarm | 12-25 `z` | 3 |
  | Wolf pack | 3-6 `w` | 4 |
  | Barbarians | 3-5 `b` | 4 |
  | Warband | `B` + 2-4 `b`, 30% a shaman | 7 |
  | Dwarf column | 3-5 `d` | 5 |
  | Thane's guard | `D` + 2-3 `d`, 30% 1-2 bombers | 9 |
  | Siege | `R` + 4-6 `b` or `d` | 12 |
  | Golem | 1-2 `G` | 10 |
  | Diggers | 2-4 `t` | 9 |
  | Marine raid | `M` + 3-6 `m` (enters from the sea) | 7 |

- **New leaders:** a **goblin boss** (leads goblins) and a **zerg brood mother** (leads a swarm; optional, see open questions). Each is a new enemy kind row (`leader` on the members via the template, not on the kind), with its own glyph, colour, journal entry and stats. Today's `leader`/`band` fields on kinds move to the templates, so any template can name a leader.
- **Every member of a group with a leader** spawns with `leaderId` set and follows it by today's `BAND` rule. When the leader dies, they carry on with their own pathing (unchanged).
- **One kind more often:** most templates are single-kind. A wave also has a **theme**: when it starts, it rolls 1-2 favoured templates, which get `themeWeight` (x3) for that wave, so a wave tends to be "mostly goblins" or "mostly dwarves" rather than an even mix.

### Composing a wave

- Pure and deterministic from the state RNG: `composeWave(state, wave)` returns a list of groups (template, kinds, leader index) whose total threat fits the budget.
- Draw templates by weight (with the theme bonus) from those unlocked by this wave whose smallest size fits what's left. Roll each group's size, capped by what's left. Stop when nothing fits.
- Group size grows a little with the wave: `max` grows by `groupGrowthPerWave` (tunable, default 0.1 a wave), so late packs are bigger, not just more numerous.
- Kinds keep `firstWave` for the journal, and a template can't appear before its members' `firstWave`.
- The stopgap mix (`pickWaveGroup`, `mixWeight`) is removed.

### Spawning groups

- A wave's groups spawn one after another, `groupGapSeconds` apart (default 4). Within a group, members appear `spawnIntervalSeconds` apart (today's 0.5), leader first, all at the group's entry point.
- **Warning:** `warningSeconds` (default 5) before a group starts spawning, its entry point is announced: a marker on the edge tile (`!` in the threat colour, drawn over fog, also on the minimap) and a horn cue. The marker goes when its last member has spawned.
- Night spawns: unchanged. A wave started in spawning time finishes all its groups, even past sunrise.

### Entry points

**Enemies enter** is a setup option for Endless, beside "Enemies come": **Spawn zone** (default, today's strip or a `.map` file's spawn zones) or **All round the map**.

- **Spawn zone:** each group picks one tile in the zone (today each enemy picks its own). Marine groups enter from the sea if the map has a reachable sea edge (see below), otherwise from the zone.
- **All round the map:**
  - Candidate entry points are map-edge tiles that are walkable, have nothing built on them, and have a terrain route to the keep for the group's movement profile (a terrain-only field: structures ignored).
  - Each group picks a candidate at random, at least `minEntrySpacing` tiles (default 15, along the edge) from the other groups' points in the same wave when possible.
  - **Edge band:** the outermost `edgeBand` tiles (default 2) of the map can't be built on, so entry is never sealed off. This replaces today's spawn-zone build rule in these games.
  - The spawn zone of a `.map` file is ignored.
- **Marine groups** prefer sea-edge tiles (sea at the map edge) with a marine route to the keep. Without one they use a land entry point and walk.
- If no candidate exists (a map with no walkable edge), the group falls back to the spawn zone, or else to the edge tile closest to a route.

### What changes for enclosures and fog (all round only)

- **Enclosures** flood from every candidate land entry tile instead of the spawn tiles. A ring of walls with open ground between it and any map edge is enclosed only if no edge can reach it. The tests describe this edge rule.
- **Fog:** the spawn strip isn't revealed at the start (there isn't one). Entry markers show through fog.
- Spawn zone games: enclosures and fog are unchanged.

### Setting it up

- The Endless settings step gets **Enemies enter: Spawn zone / All round the map**. Default: Spawn zone. `?solo&edges` turns it on for a test game.
- Online: `create` gains `enemiesEnter`, checked like `enemiesCome`, kept for restarts, shown in the waiting room.

### Hover info and journal

- Hovering a group member adds the group's name ("Barbarian warband, with its chief" extends today's `with its chief`).
- New leader kinds get journal entries like any kind.

## Out of scope

- Enemies choosing targets other than the keep (`enemy-targeting`).
- Hand-written waves (`.wave` files, `wave-editor`): templates are data in the balance file, ready for that editor.
- Flying enemies, boss waves with special rules.
- Enemies coming out of the fog in the middle of the map.
- Scouts shadowing groups (`scout-shadowing`).
- Marines and moats.

## Data model

```ts
// src/sim/config.ts
export interface GroupTemplate {
  id: string;
  name: string;
  firstWave: number;
  weight: number;
  leader?: EnemyKindId;
  members: { kind: EnemyKindId; min: number; max: number }[];
  support?: { kind: EnemyKindId; chance: number; min?: number; max?: number }[];
  /** Enters from the sea when it can (marine raids). */
  fromSea?: boolean;
}
export const GROUP_TEMPLATES: GroupTemplate[];
export const WAVES = { ...existing, groupGapSeconds: 4, warningSeconds: 5, themeWeight: 3,
  themes: { min: 1, max: 2 }, groupGrowthPerWave: 0.1, minEntrySpacing: 15, edgeBand: 2 };
// EnemyKind loses `band` and `mixWeight`; `leader` moves to templates.

// src/sim/types.ts
export type EnemiesEnter = "zone" | "edges";
interface GameState { ...existing; enemiesEnter: EnemiesEnter; incoming: IncomingGroup[] }
interface IncomingGroup { template: string; kinds: EnemyKindId[]; x: number; y: number;
  warnTicks: number; spawned: number; leaderId: number | null }
interface WaveState { ...existing; groups: IncomingGroup[] } // replaces threatLeft-driven picking

// src/sim/waves.ts
export function composeWave(state: GameState, wave: number): ComposedGroup[];
export function entryPoint(state: GameState, group: ComposedGroup, taken: Point[]): Point;
// src/sim/edges.ts (new): candidate entry tiles per profile, cached by gridVersion
export function entryCandidates(state: GameState, profile: MovementProfile): Point[];

// src/net/protocol.ts
| { type: "create"; ...existing; enemiesEnter?: EnemiesEnter }
// snapshots carry `incoming` (small: a few groups at a time); protocol version bumped
```

Templates and the new `WAVES` numbers are part of the balance file (`waves.templates`, `waves.groupGapSeconds` and so on), so they can be tuned in game.

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/waves.ts`: composition, group spawning, warnings (rewritten from the stopgap).
- `src/sim/edges.ts` (new): entry candidates and the terrain-only reachability field.
- `src/sim/enclosures.ts`, `src/sim/fog.ts`: flood and reveal from the edge in all-round games.
- `src/sim/grid.ts`: the edge band build rule beside `isSpawnTile`.
- `src/sim/config.ts`: templates, new leader kinds, `WAVES` numbers; `band`/`mixWeight` removed.
- `src/sim/game.ts`, `src/sim/types.ts`: `enemiesEnter`, `incoming`.
- `src/render/canvas.ts`, `src/ui/minimap.ts`: entry markers; `src/ui/tileInfo.ts`: group names; `src/audio` cue for the horn.
- `src/ui/startScreen.ts`, `src/net/join.ts`, `src/net/protocol.ts`, `server/room.ts`, `src/ui/waitingRoom.ts`: the option.
- `src/sim/balance.ts`: templates in `BALANCE_FIELDS`.
- Tests: `tests/sim/waves.test.ts` (rewritten parts), `tests/sim/edges.test.ts`, additions to `tests/sim/enclosures.test.ts`, `tests/sim/fog.test.ts`, the protocol and room tests.

## Code style

As `waves.ts` today: pure functions on `GameState`, every random roll through the state RNG, numbers from `state.balance`.

## Testing strategy

- **Composition:** same seed, same wave, same groups; total threat never exceeds the budget; nothing appears before its first wave; with the theme bonus, the most common template in a wave is a favoured one far more often than not (over many seeds); a leader template always spawns its leader first and sets every member's `leaderId`.
- **Spawning:** groups come `groupGapSeconds` apart; a warning precedes each by `warningSeconds`; the marker goes after the last member.
- **Entry points (500 seeds, every map size):** every chosen point is on the edge, walkable, unbuilt, and has a terrain route to the keep for its profile; groups in one wave are spaced apart when the map allows; marine raids enter from the sea when there is one.
- **Edge band:** building in the band is refused in all-round games and allowed in zone games.
- **Enclosures (all round):** a ring touching only the keep side is enclosed; a ring with a gap to any edge isn't; zone games are unchanged (existing tests untouched).
- **Night spawns:** waves still only start in spawning time; a wave finishes its groups after sunrise.
- **Determinism:** the 2,000-tick test with all-round entry and every template.
- **Online:** two clients see the same markers and groups.
- Browser, by hand: watch three waves with all-round entry on an M map with a coast; a warband follows its chief; a marine raid lands.

## Boundaries

- **Always:** compose waves from data (templates in config and the balance file); every roll through the state RNG; keep zone games' enclosures and fog exactly as they are.
- **Ask first:** changing wave size growth; enemies entering away from the map edge; new behaviours for the new leaders beyond band following.
- **Never:** pick entry points that have no terrain route to the keep; let an entry point sit on a built tile.

## Success criteria

1. Waves arrive as groups, mostly one kind each, with leaders followed by their bands.
2. With **All round the map**, groups enter from different sides, each warned by a marker and a horn, and every entry has a route to the keep (500-seed test).
3. Marine raids come from the sea on maps with a coast.
4. Spawn zone games keep today's enclosures and fog; all-round games measure them from the edge.
5. The option works solo and online and survives a restart.
6. `npm run typecheck`, `npm test`, `npm run coverage` (80%+ for `src/sim/`) and `npm run build` pass.

## Open questions

1. Names and glyphs for the goblin boss and the zerg brood mother. Does the swarm need a leader, or is a leaderless swarm better?
2. Should the edge band be 2 tiles, or should building there be allowed but entry points just skip built tiles (with the risk that a fully walled edge leaves no entry)?
3. Groups one after another (proposed), or several groups at once from different sides in late waves?
4. Should the theme be shown to the player ("Wave 8: dwarves")?
