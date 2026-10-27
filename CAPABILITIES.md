# Capability Map: Keep Defence - Post-MVP

Status: APPROVED (2026-10-24)
Last updated: 2026-10-24

The MVP (see `SPEC.md`) is the `core` that everything below builds on. Each module gets its own spec (`SPEC-<module-id>.md`), plan and tasks, built in the order at the bottom. Module ids are fixed once this map is approved.

| Module id | Responsibility | Depends on |
|---|---|---|
| `tile-layers` | Split each tile into a **base** (ground, wall, ruin) and a **mount** (tower). Towers sit on a wall or on open ground instead of being walls. Ground towers still block movement. Enemies attack towers and walls only when they block the route to the keep (same rule as today). A wall-mounted tower falls when its wall is destroyed. | core |
| `map-gen` | Seeded starting map. **Terrain:** coastlines and rivers (water: impassable and unbuildable, except that a buildable **bridge** makes a river tile walkable) and rocks (impassable, unbuildable). **Features:** ruin wall fragments (neutral, pre-damaged, usable in your maze), loot/gold caches, and placement hooks for resource features (deposits, animals, crops). Generation must always leave a walkable route from the spawn to the keep. | tile-layers |
| `tower-aiming` | Facing set at placement. Each tower has a field-of-fire arc (e.g. archer 30° behind a slit, never turns; cannon 360° with a turn speed, so it takes time to bring a target into its arc). Targeting is limited to the arc. Simple arc overlay now, red-highlight styling later. | tile-layers |
| `line-of-sight` | Walls block shots from ground towers. Wall-mounted towers fire over walls and over ground towers. Lobbed weapons (catapult) fire over everything. | tower-aiming |
| `units` | Your own soldiers, produced by spawner towers. Each tower has a unit limit and a spawn direction. Behaviours: charge at enemies in sight, hold a spot and block enemies until killed, guard and shoot at range. Stat variety (health, attack, range). Enemies stop to fight units that block them. Units and enemies get a `faction`. | tile-layers |
| `game-setup` | Setup screen before a game: pick a mode (Endless first) and toggle the **economy** option (food + gold, "AoE mode") on or off. Options are passed into `createGame` as a rules config. | core |
| `resources` | Food and gold economy, active when the economy option is on. Finite map deposits: timber, copper, iron and gold, all sold for gold at different values (gold ore worth most). Animals and crops give food. Gatherer buildings (timber mill, mine, butcher, mill) spawn worker units that travel out, collect and return. Food is spent on units. | map-gen, units, game-setup |
| `town-economy` | Sustainable income once map resources run out, plus a **Civic** build tab. Simple setups: farm land + a farm house (food), or a town of houses + shops (gold). With the economy on, houses consume food to produce gold. Businesses apply price modifiers: cheaper towers and better sell prices. Absorbs today's houses. | resources |
| `mode-ramparts` | The turn-based mode. Rounds: build phase, then press **End turn** and defend with no building allowed. When the keep falls, you bank the round's earnings plus house income, structures stay (repaired), you build more, and waves restart from wave 1. | game-setup |
| `mode-barbarians` | Fake IO game against AI barbarian factions, each with its own keep, scripted building and attack waves. Every player builds towers and defensive/offensive units. Eliminated players' walls stay on the map for others to use. Needs a larger map, a scrolling camera, and one route map per target keep. | units, resources, town-economy, game-setup, map-gen, line-of-sight |

## Dependency graph

```
core
 ├─ tile-layers
 │   ├─ map-gen ─────────────┐
 │   ├─ tower-aiming         │
 │   │   └─ line-of-sight    │
 │   └─ units ───────────────┤
 └─ game-setup ──────────────┤
     ├─ mode-ramparts        │
     └──────────────── resources
                         └─ town-economy
                              └─ mode-barbarians (also needs units, map-gen, line-of-sight)
```

## Proposed build order

1. **Basics:** `tile-layers` -> `map-gen` -> `tower-aiming` -> `line-of-sight` -> `units`
2. **Setup and modes:** `game-setup` -> `mode-ramparts`
3. **Economy:** `resources` -> `town-economy`
4. **Big one:** `mode-barbarians`

Ramparts comes before the economy because it only needs the existing gold and houses. That means a second playable mode arrives early.

## Decisions captured so far

- Ground towers block movement. Enemies attack towers only when they block the way to the keep. On the ground, other towers can fire over them, and they can't fire over walls.
- Tower rotation: fixed mount plus turn speed (archers never turn; cannons rotate at a set rate).
- Ramparts: keep the castle between rounds, bank earnings, restart from wave 1.
- Starting map: ruin walls, loot caches, deposits (timber, copper, iron, gold), animals, crops.
- Only two currencies: food and gold. Timber, copper, iron and gold ore are all sold for gold, at different values.
- Food (economy on) is spent on units. Houses may consume food to produce gold.
- The economy is a game-setup toggle that works with any mode.
- Earning buildings go in a Civic build tab: farm land + farm house, or houses + shops.

- With the economy off, units cost gold only.
- Starting map terrain: coastlines, rivers (crossable by building bridges) and rocks.
- Turn-based play is the Ramparts mode: build, press "End turn", the game plays until the keep falls, then rebuild with what you earned and go again. There is no separate real-time/turn-based toggle.

## Open questions

None at map level. Module-level questions live in each `SPEC-<module-id>.md`.

---

# Capability Map: Multiplayer (co-op)

Status: APPROVED (2026-10-24)
Last updated: 2026-10-24

Several players connect over the web, see the same level and fight the same enemies together. Later game modes build on this. Single-player keeps working offline.

**Architecture:** the server runs the game. A Node process runs the existing `src/sim/` (no DOM, deterministic) once per room. Clients send commands over a WebSocket. The server checks them, applies them in order, ticks at 20 Hz and sends state updates to everyone. Clients only draw what the server sends and smooth enemy movement between updates. A tick-stamped command log can later support lockstep or replays, but it isn't needed now.

| Module id | Responsibility | Depends on |
|---|---|---|
| `players` | Multiple players inside the sim, tested fully offline. Each player has their own gold. Every structure has an owner, and only the owner can sell it. Every command carries a `playerId`. Bounties go to the player whose tower or trap made the kill, house income to the house's owner, and the early-send bonus to whoever sent the wave. Pause and fast-forward are votes: they only take effect when every connected player has voted for them, and any player can withdraw their vote to undo it. Anyone can send the next wave early. A one-player game behaves exactly as today (their single vote decides). | core |
| `game-server` | Node WebSocket server (`ws`). Rooms, one sim per room, a typed message format shared with the client, server-side command checks, a `playerId` assigned by the server and never trusted from the client, join/leave. Runs locally first, reachable from other machines on the LAN. Port and host come from env vars so it can move to a real host later without code changes. | players |
| `net-client` | A session interface (`LocalSession` for offline play, `NetworkSession` for online play) so `main.ts` doesn't care which is running. Applies state updates, smooths enemy movement, shows ghosts for placements waiting on the server, and connection status. | game-server |
| `lobby` | Create or join a room by code/link, enter a player name, see who's in, start the game. | net-client |

Build order: `players` -> `game-server` -> `net-client` -> `lobby`

### Decisions captured

- Server runs the game, not lockstep: no browser-to-browser drift, late joining becomes easy, cheating is hard, and AI factions can later run on the server.
- Separate resources and structures for now: own gold, own structures, sell only your own.
- Hosting: develop and run locally, with friends connecting over the LAN (or through a tunnel/port forward). Hosted somewhere else eventually, so nothing may hard-code localhost or a port.
- No accounts: players just enter a name.
- Pause and fast-forward are unanimous votes among connected players.
- Rejoin is allowed: a dropped player gets their own structures and gold back.
- `ws` becomes the first runtime dependency (server only). Approved as part of this map.

### Relationship to the post-MVP map

- `game-setup` may later absorb the lobby's mode/options screen.
- `mode-barbarians` ("fake IO game against AI") could become partly real multiplayer on top of `game-server`. Revisit when it's specced.

### Open questions (map level)

None at map level. Module-level questions live in each `SPEC-<module-id>.md`. Priority: straight after `map-gen` (merged in PR #4), before `tower-aiming`.


# Capability Map: Presentation (sound and music)

Status: `audio` done (2026-10-25); `music-packs` built (2026-10-25); `music-director` planned (peaceful/fight), outline in [`tasks/plan.md`](tasks/plan.md).

| Module id | Responsibility | Depends on |
|---|---|---|
| `audio` | Our own Web Audio chiptune synth (pulse with PWM, triangle, saw, sine, noise; ADSR and semitone pitch envelopes). Sound effects from simulation cues (`state.cues`, each played once, capped per sound) for local and online games, plus UI sounds for the player's own actions. A MIDI file reader and lookahead sequencer play songs from a manifest on the title and start screens. Mute and volumes saved per device. See [`SPEC-audio.md`](SPEC-audio.md). | core, intro screen, net-client |
| `music-packs` | Music packs (folders of MIDI files per place, found by a Vite plugin) replace the built-in songs place by place, chosen in the Sound panel. Music follows the player: the intro plays once and hands over to menu music; games get shuffled in-play music, then a game-over song. Pack files stay out of git. See [`SPEC-music-packs.md`](SPEC-music-packs.md). | audio |
| `music-director` | Gameplay music is either standard (gameplay songs only) or switches between peaceful and fight songs with a minimum time in each state. Each place can list several songs. Fallbacks when a place has no songs. Possibly crossfades and stings. | audio |

Build order: `audio` -> `music-packs` -> `music-director`

### Decisions captured

- Our own synth instead of chiptune-synth, because its AGPL-3.0 licence would have applied to the whole game.
- Our own small MIDI reader instead of a dependency.
- Mute is a button only, no keyboard shortcut.
- Peaceful/fight switching is decided by the song lists (a list of fight songs and a list of peaceful songs), not a player setting.
- Every song records its source and licence in the manifest.
- Music packs are git-ignored and chosen in the Sound panel; menu and in-play songs shuffle without immediate repeats; game over stops in-play music and plays a game-over song once.

### Open questions (for the `music-director` spec)

Skipping the intro, what counts as "fight", crossfade versus waiting for a phrase end, and stings (picking from a list is settled by `music-packs`: shuffled without repeats). See the outline in [`tasks/plan.md`](tasks/plan.md).

---

# Capability Map: Armies (enemy roster, enemy AI, waves, journal, player units)

Status: APPROVED (2026-10-25)
Last updated: 2026-10-25

Today there is one enemy (`g`). It follows a single flow field from the keep and only breaks walls when no open route is left. It spawns from one fixed strip on the left edge, and it is removed when it reaches the keep. This map turns that into a varied roster with different kinds of AI, edge spawns that change from group to group, a monster journal, and player-made defensive and offensive units with gold and food costs.

It **replaces** the `units` row in the post-MVP map. That row is split into `units` (defensive, guard towers) and `field-units` (offensive and exploring), and `mode-barbarians` then also depends on `field-units`.

| Module id | Responsibility | Depends on |
|---|---|---|
| `enemy-kinds` | Enemies come from a config table. Each kind has: glyph, colour, name, HP, speed, attack damage, attack interval, keep damage, bounty, threat cost, first wave it can appear in, behaviour id and movement profile. **Variants:** each enemy picks a variant of its kind when it spawns (e.g. goblin runt / grunt / brute), with stat multipliers and a colour shade, so two `g`s can differ. Today's enemy becomes goblin `g`. First roster: `g`, `G` golem, `b`/`B` barbarians, `d`/`D` dwarves, `z` zergs, `w` wolf riders (fast, fragile), all using today's "follower" AI. Enemies hit structures **and the keep** using their own attack stats: an enemy that reaches the keep stays and attacks it until killed, instead of hitting once and vanishing. The snapshot and protocol carry kind and variant. | core |
| `enemy-pathing` | **Movement profiles:** one cached flow field per profile, rebuilt when `gridVersion` changes. *Follower* (today's rule: walls cost more than any open route). *Breacher* (a wall costs its HP divided by the enemy's damage per second, so it breaks through whenever that beats walking round). *Marine* (can cross river and sea, with sea costing more than river). **Behaviours:** follower, breacher, bomber (`x`/`X` dwarf bombers: short sight; on seeing a structure it sprints to it and explodes, splash damage) leader/follower groups (`b` stays with `B`, `d` with `D`), healer (`s` shaman heals nearby enemies), siege (`R` battering ram: attacks structures only, very high HP) and digger (`n` diggers walk to a wall and dig under it to damage it from below; they don't make a tunnel). Adds dwarf bombers, marines `m`/`M`, shamans, rams and diggers to the roster. | enemy-kinds |
| `enemy-targeting` | Enemies choose **what** to attack: the keep, houses or towers. One cached field per (movement profile, goal type), leading to the nearest building of that type and rebuilt when `gridVersion` changes. Score = the kind's liking for the goal x the building's value (its cost, plus income for houses) / the field's cost to reach it (including wall-breaking for breachers). **Intelligence** per kind: *low* (g, z, G, R) always go for the keep; *medium* (b/B, w) head for the keep but turn aside to a house or tower they see if it's cheap to reach; *high* (d/D, m/M, s) score every goal when they spawn and again when the grid changes or their target falls. After destroying a target they choose again, and the keep is always an option. | enemy-pathing |
| `wave-director` | **Waves are put together by code:** each wave gets a threat budget that grows with the wave number, spent on group templates (e.g. a warband is 1 `B` + 3-6 `b`, a swarm is 15-30 `z`). Kinds unlock by wave. **Edge spawns:** each group enters at one point on the map edge, and different groups in the same wave can use different points. A point qualifies if it is walkable, has nothing built on it, and has a terrain route to the keep (water edges count for marines). This replaces the fixed spawn zone, and `enclosures` and `fog-of-war` then measure reachability from the edge instead of from the spawn zone. | enemy-kinds (marine spawns arrive with `enemy-pathing`) |
| `bestiary` | Monster journal panel. An entry unlocks the first time a kind is **in sight**. It shows glyph, name, variants, stats, a one-line behaviour description and the first wave seen. Unlocks are saved per device. | enemy-kinds |
| `units` | Player units: entity with faction, owner, HP, armour, attack, range, speed and sight. Combat runs both ways: enemies stop to fight units that block them. Units give fog sight. Each unit costs `{ gold, food }`, but only gold is charged until `resources` adds food (with the economy off, gold only, as already decided). **Guard towers** spawn units, with a unit limit, a respawn timer and the facing as their guard spot. Defensive roster: swordsman (moves a little to attack), archer (guards and shoots, moves a little), paladin (stays put and blocks: high armour, less damage than a swordsman). | enemy-kinds, tile-layers, fog-of-war |
| `field-units` | *(Narrowed 2026-10-26: scouts, soldiers and rangers here; knights and horsemen in `elite-units`. See the AoE update map.)* Offensive and exploring units from a **barracks**. Each unit finds its own path, over explored land only. **Scout:** walks to the nearest fog frontier. **Soldier / knight / ranger** (the ranger is the offensive ranged unit, a separate type from the defensive archer): go to a known enemy keep; else to known enemy walls (circle them to look inside; if they still can't see in, break through); else patrol the fog edge, fighting what they meet. **Horsemen:** only move on explored land, and only once an enemy keep, wall or tower is known. In Endless, where there is no enemy keep, they explore and hunt enemies. Their full behaviour shows in PvP and later in `mode-barbarians`. | units |

Build order: `enemy-kinds` -> `bestiary` -> `enemy-pathing` -> `enemy-targeting` -> `wave-director` -> `units` -> `field-units`

`line-of-sight` (spec drafted) stays independent. Units aim by range and fog until it lands, then switch to its `canSee`.

### Decisions captured

- The enemy roster, variants, waves and costs are all config rows, so a new kind is a row plus (at most) a behaviour function.
- Several flow fields, one per movement profile, not one per enemy, so cost doesn't grow with the number of enemies.
- ~~Every unit has a gold and a food cost from day one.~~ Superseded by the AoE update (2026-10-25): spawner buildings cost gold and units spawn free up to the building's quota. A food cost for defensive and offensive units may come later.
- Added enemies (2026-10-25): `w` wolf riders, `s` shaman, `R` battering ram, `n` diggers (damage walls from underneath, no tunnel). No flying enemies for now.
- Dwarf bombers are `x`/`X` (barbarians keep `b`/`B`). Diggers are `n`.
- Two archer types: defensive `archer` (guard tower) and offensive `ranger` (barracks).
- Enemies that reach the keep stand and attack it with their own stats (2026-10-25). A balance change, tuned in `enemy-kinds`.
- Paladin: high armour, blocks, stays put, less damage than a swordsman.
- Some enemies target houses or towers instead of the keep, chosen by intelligence, building value and cost of reaching it (2026-10-25). Fields per goal type, not per enemy.

### Open questions (settled in module specs, with proposed defaults)

- `enemy-pathing`: bombers damage structures and units, not other enemies. When a leader dies, followers carry on with normal pathing. Breachers "notice" through the shared cost field, not per-enemy vision; bombers and diggers use real short-range sight.
- `enemy-targeting`: the starting liking and intelligence values per kind (raiders like houses, dwarves like towers); whether medium-intelligence enemies give up on a diversion that turns out costly.
- `wave-director`: a marker on the edge where each group is about to enter, shown even in fog.

---

# Capability Map: AoE update (economy, workers, unit spawners)

Status: APPROVED (2026-10-25); `unit-core`, `resources`, `town-economy`, `units` and `field-units` built (2026-10-26)
Last updated: 2026-10-25

Gatherer buildings spawn workers that go out and chop trees, mine rocks and forage berries, paying out gold and food as they go. Guard towers spawn defensive units, and barracks spawn offensive ones. Every spawner is a building that costs gold and spawns its units free, one per minute, up to a quota.

This map **changes** earlier rows:
- `units` (Armies) is split. Its entity, combat and spawning go into the new `unit-core`, and `units` keeps only the guard towers and the defensive roster.
- `resources` (post-MVP) now depends on `unit-core` instead of `units`. Workers pay out with each hit and don't carry loads home. Trees and rocks replace the timber, copper, iron and gold deposits.
- The Armies build order changes: `enemy-targeting` and `wave-director` now come after `field-units`.

| Module id | Responsibility | Depends on |
|---|---|---|
| `game-setup` | **Deferred (2026-10-25), built with `food`.** An economy toggle on the mode screen: **food + gold** or **gold only**. It's passed into `createGame` as a rules config and carried to online games. Spec drafted: [`SPEC-game-setup.md`](SPEC-game-setup.md). | core, lobby |
| `unit-core` | A shared unit entity: faction, owner, HP, speed, attack, range, sight and a home building. A unit finds its own path to a target and attacks it. Enemies fight units that block them or come within reach, enemy towers (PvP) shoot them, and units give fog sight. **Spawner contract:** a building kind names its unit kind, a quota (most alive at once) and an interval (default one per minute). Spawning is free. | enemy-kinds, tile-layers, fog-of-war |
| `resources` | **Gold only for now.** Trees, rocks and berry bushes get HP, and each hit pays its owner gold straight away. **Trees** give gold (timber is sold). **Rocks** give gold, with richer rocks holding more and looking different. **Berry bushes** are walkable green tiles with a red `b`, and pay gold until `food` makes them pay food. A resource disappears at 0 HP, and a mined tree or rock becomes open ground (so mining can open new enemy routes). **Gatherer buildings** (timber yard, mine, forager hut) each spawn one worker per minute, up to 5 alive. A worker walks to the nearest reachable resource of its type, even in fog, and hits it until it's gone, then finds the next. | unit-core, map-gen |
| `town-economy` | Income once map resources run low: farms and other civic buildings make gold per minute (food per minute once `food` lands). A **Civic** build tab, which absorbs today's houses. | resources |
| `food` *(deferred)* | Food as a second currency, switched on by `game-setup`'s economy toggle. Berry bushes, forager huts and farms make food instead of gold. In gold-only games they keep paying gold. A food counter in the panel, and later food costs for units. | game-setup, resources, town-economy |
| `units` | Defensive units from **guard towers**. Units stand in front of the tower on its facing side and attack enemies that come near. Roster: swordsman, archer, paladin (see the Armies map). | unit-core |
| `field-units` | Offensive and exploring units: scout camp, barracks and archery range (Offence tab) sending scouts (explore the fog), soldiers and rangers (hunt visible enemies, else patrol the fog edge; in PvP, march on a known rival keep and break through its weakest wall). Paths over explored land only. Spec: [`SPEC-field-units.md`](SPEC-field-units.md). | units |
| `elite-units` | Knights (tougher soldiers) and horsemen (fast, explored land only, once a rival keep, wall or tower is known). Split from `field-units` (2026-10-26). | field-units |

Build order (after `enemy-pathing` is finished): `unit-core` -> `resources` -> `town-economy` -> `units` -> `field-units`, then `enemy-targeting` -> `wave-director` -> `elite-units`. Later: `game-setup` -> `food`.

### Decisions captured

- Food is deferred (2026-10-25). Food gatherers (forager hut, berry bushes) are built now but pay gold. `game-setup` waits for `food`, because the toggle has nothing to switch until then.
- Workers are units that only attack resources. They are killed by enemies and enemy towers like any unit, and the building's timer replaces them.
- Units outlive their spawner: selling or losing a building leaves its units alive, but nothing replaces them.
- Enemies fight a unit that's in their way or right next to them.
- PvP towers shoot rival units before structures. Endless tower targeting is unchanged.
- Spawners cost gold to build. Units and workers spawn free up to the quota. Food costs for units are deferred.
- The quota and the one-per-minute rate apply per building.
- Collection goes straight into the owner's purse with each hit. Carrying loads home is a possible later option.
- A mined tree or rock becomes open ground.
- ~~Gold-only mode: no berry bushes and no forager huts.~~ Superseded: berry bushes and forager huts exist in every game and pay gold until `food`.
- The sell tool can still clear a tree for 1 gold.

### Open questions (for module specs)

- `resources`: HP and payout for trees, rocks and berry bushes, how many berry bushes there are and where they go, and whether existing maps' rocks all become mineable or only some.
- `resources`: whether workers flee from enemies.
- `food`: what food is spent on (unit costs, houses that eat food to make gold).

## Editors and levels (2026-10-26)

Status: `map-editor` built (2026-10-26). Hand-made content for the game: a **level** will be three files the hosted game ships with and players choose from.

| Module | What it delivers | Depends on |
|---|---|---|
| `map-editor` | `.map` files (terrain, keeps, spawns, ruins, chests, starting structures) and an editor page (`?editor`) using the game's renderer and keys, with test-play. Spec: [`SPEC-map-editor.md`](SPEC-map-editor.md). | map-gen, tile-layers |
| `wave-editor` | `.wave` files: what attacks, when. | map-editor |
| `items-editor` | Built (2026-10-26). `.items` files: what can be built, and how many of each at once, with an editor page (`?items-editor`). Spec: [`SPEC-items-editor.md`](SPEC-items-editor.md). | map-editor |
| `loadout-editor` | `.loadout` files: starting gold and settings (what can be built is now `items-editor`). | map-editor |
| `levels` | A level = a `.map`, a `.wave` and a `.loadout`. The level picker, and playing levels online (rooms send the level's name; client and server read the same bundled files). | the three editors |

## Day and night (2026-10-26)

Status: `day-night` steps 1 and 2 built (2026-10-26/27). Map extended 2026-10-27 with `long-shadows`, `game-clock`, `night-spawns` and `edge-spawns`; the first three built 2026-10-27; `town-lights` and `skip-to-night` added and built the same day.

| Module | What it delivers | Depends on |
|---|---|---|
| `day-night` | Step 1: shadows follow a sun on a tilted arc (across the sky, and the arc's height), set from two sliders in the Debug menu (game and map editor); taller blocks shade lower neighbours on any side the shadow falls. Step 2: a day and night clock (Debug > Day/night, Time slider and Play) moves the sun through the day and darkens the night. Drawing only. Next: town lighting at night, then the clock in the game itself. Spec: [`SPEC-day-night.md`](SPEC-day-night.md). | core (raised blocks) |
| `long-shadows` | Dawn and dusk shadows reach up to about 2 tiles (the cap was 1): a shallower arc at sunrise and sunset, neighbour shading checked 2 tiles out. Drawing only. Spec: [`SPEC-long-shadows.md`](SPEC-long-shadows.md). | day-night |
| `game-clock` | The time of day as game state (`state.clock`): it runs with game time (a day and night in 8 minutes, 5 of day and 3 of night), pauses and fast-forwards with the game, is shared online, and the sky is drawn from it. Only in games that use it (night spawns, for now). Debug Day/night sets it offline. Spec: [`SPEC-game-clock.md`](SPEC-game-clock.md). | day-night |
| `night-spawns` | A setup option for Endless, **Enemies come: all the time / at night**. At night, today's waves run from early evening until sunrise, then stop; what's left must be killed. The HUD and game-over screen count nights survived. Spec: [`SPEC-night-spawns.md`](SPEC-night-spawns.md). | game-clock |
| `town-lights` | At night, built structures light the darkness round them by kind (the keep most, walls a thin line), and units carrying torches (a `torch` flag per unit kind: soldiers and workers do, scouts don't; human enemies later); enemies and open land stay dark. Drawing only. Spec: [`SPEC-town-lights.md`](SPEC-town-lights.md). | game-clock |
| `skip-to-night` | A Skip to night button by day in night games: jumps the clock to the early evening; a unanimous vote in co-op, like Pause. Spec: [`SPEC-skip-to-night.md`](SPEC-skip-to-night.md). | night-spawns |
| `edge-spawns` | A setup option, **Enemies enter: spawn zone / all round the map**. It's `wave-director`'s edge spawns (slices 3-4), which change how enclosures and fog measure reachability, so it stays there (after `enemy-targeting`). The setup screen leaves room for the option. | wave-director |

Build order (agreed 2026-10-27): `long-shadows` -> `game-clock` -> `night-spawns`. `edge-spawns` with `wave-director`. Later: the day and night cycle as a look-only option for other modes (it's in the Debug menu for now), and town lighting at night.
