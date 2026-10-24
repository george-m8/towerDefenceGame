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

Then open http://localhost:5173.

## How to play

Enemies (`g`) spawn from the red strip on the left edge and walk to your keep (`K`). Each one that reaches the keep deals 5 damage; at 0 HP the keep falls and the game ends. Waves never stop, and each one is bigger and tougher than the last.

- Kill enemies with towers and traps to earn gold.
- Build houses for steady income.
- Enemies always take an open route if one exists, however long. They only break through your walls when the keep is completely sealed off, and then they attack the weakest point on their route.

### Structures

| Key | Structure | Glyph | Cost | What it does |
|---|---|---|---|---|
| `1` | Wall | `#` | 5 | Blocks movement. 50 HP. Towers can be built on top. |
| `2` | Archer | `A` | 25 | Range 5, 6 damage every 1s, single target. |
| `3` | Cannon | `C` | 50 | Range 4, 15 damage every 2.5s, hits a 3x3 area. |
| `4` | Catapult | `P` | 80 | Range 3-9, 30 damage every 5s, hits a 5x5 area. Can't hit enemies closer than 3 tiles. |
| `5` | Floor spikes | `^` | 15 | Walkable. Every 1.5s spikes come up and deal 15 damage to every enemy on the tile. |
| `6` | Wall spikes | `▲▶▼◀` | 20 | A wall section that fires every 2s, dealing 20 damage to the one tile it faces. Press `R` to rotate before placing. |
| `7` | House | `h` | 40 | +2 gold every 5s. Blocks movement. |
| `X` | Sell | `$` | - | Refunds 50% of cost, less if damaged. Sells the top layer first (a tower before the wall under it). |

### Towers on walls

Archers, cannons and catapults can stand on **open ground** or on **top of a wall**:

- **On a wall** (drawn on the wall colour with a strip along the top): the wall blocks enemies and takes all the hits. If the wall is destroyed, the tower falls with it, with no refund.
- **On the ground:** the tower blocks enemies like a building. Enemies only attack it when it is in the way of the keep.

Towers can't go on spikes, houses, the keep or the spawn zone. Hover a tower to see whether it is on a wall or the ground.

Towers always shoot the enemy closest to the keep. Traps fire on a fixed timer from the moment they're built, whether or not an enemy is there.

### Controls

| Input | Action |
|---|---|
| `1`-`7`, `X` or click a tool | Select a build tool / sell |
| Left click | Place (or sell) |
| Left drag | Paint walls, spikes, or sell along the dragged tiles |
| Right click or `Esc` | Clear the selected tool |
| `R` | Rotate wall spikes |
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
| `npm run coverage` | Run the tests with coverage (fails under 80% lines in `src/sim/`; HTML report in `coverage/`) |
| `npm run typecheck` | Typecheck without building |
| `npm run format` | Format all files with Prettier |

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
src/render/           Canvas drawing (reads state, never changes it)
src/ui/               Side panel, input, hover info, game-over dialog
src/styles.css        System 6/7 style window chrome
tests/sim/            Unit tests for the simulation
```

The UI never changes game state directly. Input is turned into commands (`build`, `sell`, `togglePause`, `sendWave`) that `applyCommand` validates, which keeps the simulation testable and leaves a clean seam for multiplayer later.

## Tuning

Every gameplay number lives in `src/sim/config.ts`. The current values are first-pass guesses and haven't been balanced yet.
