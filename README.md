# Keep Defence

A browser-based, grid-based tower defence game. Build walls, towers, traps and houses around your keep and survive endless, growing waves. Text glyphs and coloured squares only, styled after Dwarf Fortress and classic Mac System 6/7.

See [`SPEC.md`](SPEC.md) for the full design and [`tasks/plan.md`](tasks/plan.md) for the build plan.

## Requirements

- Node.js 22 or 24 LTS (other versions may work but aren't supported by Vitest)
- npm

## Getting started

```sh
npm install
npm run dev
```

Then open http://localhost:5173. To play with friends, see [Playing together](#playing-together).

## How to play

Enemies (`g`) spawn from the red strip on the left edge and walk to your keep (`K`). Each one that reaches the keep deals 5 damage; at 0 HP the keep falls and the game ends. Waves never stop, and each one is bigger and tougher than the last.

- Kill enemies with towers and traps to earn gold.
- Build houses for steady income.
- Enemies always take an open route if one exists, however long. They only break through your walls when the keep is completely sealed off, and then they attack the weakest point on their route.
- Enemies mostly stick to that route, but at each tile there is a small chance (10% by default, `ENEMY.wanderChance` in `src/sim/config.ts`) that one drifts sideways onto an open tile instead. They never step backwards, double back onto the tile they just left, or wander into structures.

### Structures

| Key | Structure | Glyph | Cost | What it does |
|---|---|---|---|---|
| `1` | Wall | `#` | 5 | Blocks movement. 50 HP. Towers can be built on top. |
| `2` | Archer | `A` | 25 | Range 5, 6 damage every 1s, single target. Fixed 90° arc. |
| `3` | Cannon | `C` | 50 | Range 4, 15 damage every 2.5s, hits a 3x3 area. Turns 90°/s. |
| `4` | Catapult | `P` | 80 | Range 3-9, 30 damage every 5s, hits a 5x5 area. Can't hit enemies closer than 3 tiles. Turns 30°/s. |
| `5` | Floor spikes | `^` | 15 | Walkable. Every 1.5s spikes come up and deal 15 damage to every enemy on the tile. |
| `6` | Wall spikes | `▲▶▼◀` | 20 | A wall section that fires every 2s, dealing 20 damage to the one tile it faces. Press `R` to rotate before placing. |
| `7` | House | `h` | 40 | +2 gold every 5s. Blocks movement. |
| `8` | Bridge | `=` | 10 | Only on river tiles. Makes the river walkable there (for enemies too). |
| `X` | Sell | `$` | - | Refunds 50% of cost, less if damaged. Sells the top layer first (a tower before the wall under it). Also clears trees. |

### The map

Every game starts on a new, randomly generated map (the seed is shown in the panel and on the game-over screen).

| Terrain | Look | Walk | Build | Notes |
|---|---|---|---|---|
| Ground | dark checker | yes | yes | |
| Ford | sandy | yes | yes | A shallow crossing of the river |
| River | `~` light blue | no | bridges only | Build a bridge (`8`) to cross it anywhere else |
| Sea | `≈` dark blue | no | no | Coastline along one edge |
| Rock | `o` grey | no | no | Can't be cleared |
| Tree | `♣` green | no | no | Clear with `X` for 1 gold of timber |

- **Ruins** (`#` in dark stone) are old, damaged walls. They block enemies, can hold a tower, and sell for a little salvage. You can't build new ones.
- **Treasure chests** (`$` in gold) are piles of gold lying on the map (20-60, more the further from the keep). Build anything on one to claim it.
- There is always a walkable route from the spawn to the keep, and nothing walkable is ever cut off.

### Towers on walls

Archers, cannons and catapults can stand on **open ground** or on **top of a wall**:

- **On a wall** (drawn on the wall colour with a strip along the top): the wall blocks enemies and takes all the hits. If the wall is destroyed, the tower falls with it, with no refund.
- **On the ground:** the tower blocks enemies like a building. Enemies only attack it when it is in the way of the keep.

Towers can't go on spikes, houses, the keep or the spawn zone. Hover a tower to see whether it is on a wall or the ground.

### Facing and arcs

Every tower faces north, east, south or west. Press `R` before placing to rotate it (the white notch on the tile shows which way). Facing is permanent: sell and rebuild to change it.

- **Archers** are fixed behind an arrow slit and only fire inside a 90° arc centred on their facing.
- **Cannons and catapults** can fire in any direction, but have to turn onto a target first (cannons at 90°/s, catapults at 30°/s), so enemies slipping past behind them may get through before they line up. Hover one to see its current aim.
- While placing or hovering a tower, the tinted tiles are exactly the ones it can fire at.

Towers always shoot the enemy closest to the keep. Traps fire on a fixed timer from the moment they're built, whether or not an enemy is there.

### Controls

| Input | Action |
|---|---|
| `1`-`8`, `X` or click a tool | Select a build tool / sell |
| Left click | Place (or sell) |
| Left drag | Paint walls, spikes, bridges, or sell/clear along the dragged tiles |
| Right click or `Esc` | Clear the selected tool |
| `R` | Rotate the facing of the tower or wall spikes you're placing |
| `Space` or Pause button | Pause / resume (you can still build while paused) |
| `F` or `>>` button | Toggle fast forward (2x game speed) |
| Send wave button | Start the next wave now, for +1 gold per second skipped |
| `D` | Toggle the path overlay (arrows show where enemies will walk; red means "will attack this") |
| Hover a tile | Show its details in the Info box, and a tower's range |

Dev server only: `E` spawns one enemy and `M` spawns 200 (stress test).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Typecheck and build the production bundle into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Run the unit tests in watch mode |
| `npm run coverage` | Run the tests with coverage (fails under 80% lines in `src/sim/`, `src/net/` and `server/`; HTML report in `coverage/`) |
| `npm run typecheck` | Typecheck the client and the server without building |
| `npm run server` | Start the multiplayer game server (restarts on change) |
| `npm run server:probe -- <host[:port]> [seconds]` | Check a game server is reachable: creates a room and prints updates |
| `npm run build:server` | Bundle the game server into `dist-server/` |
| `npm run start` | Run the bundled server, serving `dist/` and `/ws` on one port |
| `npm run format` | Format all files with Prettier |

## Playing together

Up to 4 players can defend the same keep, each with their own gold and structures.

**1. The host starts the server and the game** (on one computer):

```sh
npm run server            # the game server
npm run dev -- --host     # the game page, reachable from other computers
```

**2. The host creates a room** by opening:

```
http://localhost:5173/?create&name=YourName
```

The panel shows the room code (e.g. `RUVM`) and a **Copy invite link** button.

**3. Friends join** by opening the invite link in their browser (they don't need to install anything):

```
http://<host's address>:5173/?room=RUVM
```

`npm run server` prints the host's address (e.g. `192.168.1.20`). Friends must be on the same network. If they can't connect, the host's firewall is probably blocking it: on macOS, allow `node` to accept incoming connections (System Settings > Network > Firewall). A second tab on the host also works as a second player, for trying it alone.

**Playing:**
- Gold is your own: you earn bounties for kills by your towers and traps, and income from your houses.
- You can only sell what you built (ruins are anyone's). Towers go on your own walls or on ruins.
- Each structure has a corner mark in its owner's colour; the panel lists players, and hover info says who built what.
- **Pause** and **fast-forward** are votes: they happen when every connected player has pressed them, and the buttons show the count (e.g. `Pause 1/2`). Press again to take your vote back.
- Builds show faintly until the server confirms them.
- If your connection drops, the game reconnects you; reloading the page rejoins as the same player.
- When the keep falls, anyone can press **Restart** for a new game in the same room.

Open the page with no `?room` or `?create` to play on your own, offline.

## Running the multiplayer server

**On your machine (development):**

```sh
npm run server            # game server on port 8787
npm run dev -- --host     # the game, reachable from other machines; forwards /ws to the server
```

The server prints the address other people on your network should use, for example `http://192.168.1.20:5173`.

**Check it's reachable** from another machine on the same network (with this repo checked out and `npm install` done):

```sh
npm run server:probe -- 192.168.1.20
```

It should print a welcome and a line per update. If it can't connect, check that the host's firewall allows incoming connections on port 8787.

**Friends outside your network** need a tunnel or a port forward to your machine until the game is hosted somewhere.

**Production (one process, one port):**

```sh
npm run build && npm run build:server
PORT=8080 npm run start   # serves the game and /ws on port 8080
```

| Environment variable | Default | Meaning |
|---|---|---|
| `HOST` | `0.0.0.0` | Interface to listen on (all, so other machines can connect) |
| `PORT` | `8787` | Port for the game server (and the page, in production) |

Rooms live in memory: restarting the server ends every game. See [`SPEC-game-server.md`](SPEC-game-server.md) for the protocol.

## Project structure

```
index.html            Page shell: map canvas + side panel
src/main.ts           Bootstraps the game and runs the fixed-step loop (20 ticks/s)
src/sim/              Pure, deterministic game simulation (no DOM, seeded RNG)
  config.ts           All tunable numbers: structures, enemies, waves, economy
  game.ts             createGame, tick, applyCommand
  grid.ts             Placement rules and tile occupancy
  pathfinding.ts      Flow field (Dijkstra from the keep)
  enemies.ts          Movement and attacking
  towers.ts           Tower targeting and damage
  traps.ts            Spike trap cycles
  waves.ts            Wave formulas and scheduling
  economy.ts          Bounties, house income, selling
  players.ts          Players, per-player gold, pause/fast-forward votes
src/net/              Message types and state snapshots, shared by browser and server
src/render/           Canvas drawing (reads state, never changes it)
src/ui/               Side panel, input, hover info, game-over dialog
src/styles.css        System 6/7 style window chrome
server/               Multiplayer game server (Node): rooms, connections, static files, probe
tests/sim/            Unit tests for the simulation
tests/server/         Protocol, room and socket integration tests
```

The UI never changes game state directly. Input is turned into commands (`build`, `sell`, `togglePause`, `sendWave`) that `applyCommand(state, playerId, command)` validates, which keeps the simulation testable and is the seam for multiplayer.

The simulation already supports several players on one map (see [`SPEC-players.md`](SPEC-players.md)): each has their own gold and structures, can only sell their own, and pause and fast-forward only happen when every connected player votes for them. Online play itself comes with the `game-server`, `net-client` and `lobby` modules in [`CAPABILITIES.md`](CAPABILITIES.md). Offline, you are player 1 and the game plays exactly as before.

## Tuning

Every gameplay number lives in `src/sim/config.ts`. The current values are first-pass guesses and haven't been balanced yet.
