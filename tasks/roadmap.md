# Roadmap: next up (2026-10-27)

George's next features, checked against the specs and plan so far, put in order. Each module goes spec -> plan -> tasks -> build, as in [`plan.md`](plan.md). Specs:

| # | Module | Spec | Status |
|---|---|---|---|
| 1 | `balance-files` | [`SPEC-balance-files.md`](../SPEC-balance-files.md) | Draft, first to build |
| 2 | `rebalance` | Task list from George's write-up (no spec) | After 1 |
| 3 | `wave-director` (+ `edge-spawns`) | [`SPEC-wave-director.md`](../SPEC-wave-director.md) | Draft |
| 4 | `line-of-sight` | [`SPEC-line-of-sight.md`](../SPEC-line-of-sight.md) (revised) | Draft |
| 5 | `siege-towers` | [`SPEC-siege-towers.md`](../SPEC-siege-towers.md) | Draft |
| 6 | `scout-shadowing` | Addendum to [`SPEC-field-units.md`](../SPEC-field-units.md) when it comes up | Idea |
| - | `moats` | [`SPEC-moats.md`](../SPEC-moats.md) | Postponed (ideas) |
| - | `build-zone` | [`SPEC-build-zone.md`](../SPEC-build-zone.md) | Postponed (ideas) |

## Where each idea stands today

| # | Idea | Already planned? | Needs a spec? | Decision |
|---|---|---|---|---|
| 1 | Enemies spawn all round the map (setup option) | **Yes.** `edge-spawns` in CAPABILITIES = `wave-director` slices 3-5 in plan.md | Yes (`wave-director`) | Build (3rd) |
| 2 | Group spawning, leaders, marine groups from sea and off-map | **Mostly.** Bands are built (`b`/`B`, `d`/`D`, `BAND`). Group templates are `wave-director` slices 1-2; marines from sea are slice 6 | Yes (`wave-director`) | Build (3rd) |
| 3 | Better towers | **No.** `line-of-sight` has a drafted spec, but it isn't built | Yes: `line-of-sight` (revised) + `siege-towers` | Build (4th and 5th) |
| 4 | Moats | **No** | Later | **Postponed** |
| 5 | Build only near your land | **No.** SPEC-enclosures lists "owned territory" as out of scope | Later | **Postponed**; its build-time part moves into the rebalance |
| 6 | Rebalance + in-game tweaking + balance files | **Partly.** Chris's `.map` and `.items` editors set the file pattern; `.wave` and `.loadout` are outlined | Yes: `balance-files` | Build (1st), then the rebalance (2nd) |

Loose ends in the current plan, not part of this roadmap: the map-editor hand checks (`tasks/todo.md` tasks 6-7), the lobby still marked in progress, the `enemy-targeting` outline, and plan.md's roadmap table, which doesn't list the day and night modules yet.

---

## Order

### 1. `balance-files`: tweakable numbers before any new weapons
The aim is that nothing new gets hard-coded. Every tower, enemy, unit, wave and economy number can be tweaked in game and saved.

- **Refactor first, behaviour second:** game numbers move from module constants to `state.balance`, which `createGame` resolves from the config defaults plus a file's overrides. About 30 files read `STRUCTURES`, `ENEMY_KINDS`, `UNIT_KINDS` or `WAVES` directly today (59 `STRUCTURES[...]` lookups). With no file loaded the game is identical (the determinism test stays as it is).
- **Global multipliers** sit on top of the per-kind numbers, for example tower damage x, tower fire rate x, structure cost x, enemy HP x, enemy count per wave x, bounty x, income x and build time x. They give quick difficulty presets without touching each row.
- **`.balance` files** go in `balance/`, with the same plugin and dialogs as `.items` (`tools/dataFiles.ts`). They hold sparse overrides plus multipliers, and bad keys or numbers are refused with a message, as in `parseItems`.
- **Tweak panel** in the Debug menu: a change shows in play straight away, then Download or Save (dev only). It's also usable as an editor page, like `?items-editor`.
- **Choosing a file:** a Balance dropdown on the Endless settings step, `?solo&balance=<name>`, and for online rooms the file name (the server reads the same bundled file).
- **Open questions for the spec:** does starting gold move here (which leaves `.loadout` with only the setup options)? Is live tweaking offline only, or host-only online?

### 2. `rebalance`: George's write-up
- A data change on top of `balance-files`: new defaults, plus `easy` and `hard` presets made with the multipliers.
- **Build time by distance** (from the postponed build zone): fast near the keep, very slow far away, so cheesing with distant outposts is slow and they risk being destroyed before they're finished. Today `BUILD_TIME` is `{ maxSeconds: 10, fullDistance: 40 }`, a straight ramp. The rebalance may need a curve (for example near-instant inside the keep enclosure, then steeper with distance) and a larger maximum.
- **Fog clears too fast:** units uncover too much fog too quickly. Unit sight today is `inner` 3-6 and `outer` 5-9 tiles (scouts 6/9), and moving units sweep it along their path. Levers to try, all as balance numbers: smaller unit sight radii (especially `outer`); units explore only their `inner` radius, with `outer` showing live sight without exploring; a slower scout. Bigger rule changes (explored land fading back to unexplored after a while, or limits on what units can't currently see) need a spec. Note them here and decide after play-testing the smaller numbers.
- **Enemy armour** (decided 2026-10-27): anything that could logically wear armour has some. Goblins very weak, barbarians none but their chiefs some, golems strong, marines mid. Damage taken is `max(1, damage - armour)`, as for units. The values are in [`SPEC-siege-towers.md`](../SPEC-siege-towers.md) ("Armour for enemies"), but armour is built here, because it changes every tower's damage.
- A task list only, with one review checkpoint in play.

### 3. `wave-director` + `edge-spawns`
- Write the spec from the plan.md outline, adding: group templates weighted towards one kind per group, more leaders (a goblin boss, swarms) using `BAND`, marine groups from the sea and from any off-map edge, and the **Enemies enter: spawn zone / all round the map** setup option.
- Templates, budgets and weights go in the balance file, so the later `.wave` editor edits data that already exists.
- **Leaders wear a crown** (U+1F451 from Unifont's upper planes) above their letter, so a goblin boss is a crowned `g`.
- **Building on the spawn area is allowed**, but a build that would leave enemies nowhere to come in is refused.
- **Change to the agreed order:** `enemy-targeting` was due before this module, but `wave-director` doesn't depend on it. Build `wave-director` first.

### 4. `line-of-sight` (revise the drafted spec)
- **Lobbed weapons** (catapult, cannon) fire over walls, with a wide arc, as now.
- **Direct-fire weapons** (archer, crossbow, ballista) see by height: a wall-mounted tower sees over walls and ground towers, and a ground tower is blocked by walls.
- **Show it:** while placing a tower and when hovering one, its arc shades the tiles it can actually hit and dims the tiles it can't.
- Comes before `siege-towers`, so the new direct-fire towers are built on it.

### 5. `siege-towers`
- **Ballista:** a bolt that pierces every enemy in a line, with high damage and very slow firing and turning.
- **Crossbow tower:** slower than an archer, ignores armour.
- **Burning oil:** wall-mounted only. It pours burning oil on enemies close to its wall, which keeps burning them for a few seconds (it replaces both the brazier and boiling-oil ideas).
- **Caltrops:** a cheap floor trap that slows enemies.
- **Remove wall spikes**, since floor spikes do the same job. Old `.map` and `.items` files that mention `wallSpikes` need handling: drop it with a warning, or turn it into floor spikes. Settle which in the spec.
- New effects (pierce, burn, slow) are the work. Each tower after that is a config row, and its numbers sit in the balance file.

### 6. `scout-shadowing` (small)
- **Not solved today:** when nothing is left to explore (and always with fog off), scouts go home and show `waiting: nothing left to explore` (SPEC-field-units).
- **Secondary behaviour:** with no frontier left, a scout finds the nearest enemy group, follows it at a safe distance (just outside the enemies' reach, inside the scout's own sight), and backs off when they come closer. Its sight keeps the group visible to your towers and soldiers. It still never fights.
- Its numbers (follow distance, how close before it backs off) go in the balance file. Best after `wave-director`, so there are real groups to follow. A short spec, or an addendum to SPEC-field-units.

### Postponed (ideas kept for later)
- **`moats`:** marines swim across them but can't break walls. Dwarves that build bridges across moats would be a nice counter. A moat ring sealing the keep for good is the design risk to solve first.
- **`build-zone`:** build near your land only, and watchtowers on any explored tile. The build-time part moves into the rebalance. Revisit if long build times aren't enough to stop outpost cheese.
- **Drawbridge:** George has more ideas for it; later, probably with moats.
- **War drum / bell tower** (nearby towers fire faster): an option for a later tower pass.

### After that (already planned)
`wave-editor`, `loadout-editor`, `levels` (a level = `.map` + `.wave` + `.items` + `.loadout` + `.balance`), `enemy-targeting`, `elite-units`.

