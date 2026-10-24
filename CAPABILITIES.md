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
