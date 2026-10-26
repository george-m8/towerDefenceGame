# Spec: Tower Defence MVP - Endless Keep

Status: APPROVED (v1.1 - spike trap styles, open questions resolved)
Last updated: 2026-10-24

## Objective

A browser-based, top-down, grid-based tower defence game where the player grows a fortified settlement around a central keep. The MVP is one endless level with procedurally scaling waves. Visuals are text glyphs and coloured squares only (Dwarf Fortress / classic Apple System inspired), no sprites.

**Who it's for:** the developer (and friends) as a playable prototype, and as a solid foundation for later features (unit spawners, portcullis, moat, pushers, multiplayer).

**Core loop:** enemies spawn at the map edge -> path to the keep -> towers kill them for gold -> gold buys walls, towers and houses -> houses produce income -> waves get bigger -> survive as long as possible.

### User stories

1. As a player, I start with a keep in the centre of the map and some starting gold.
2. As a player, I can place walls one tile at a time (click, or click-drag to paint a line).
3. As a player, I can build static defences: **Archer tower, Cannon, Catapult, Floor spikes, Wall spikes**.
4. As a player, I can build **Houses** (town tiles) that generate gold over time.
5. As a player, I can sell/demolish any structure I built for a partial refund.
6. As a player, I see a countdown to the next wave, the wave number, gold, and keep HP at all times.
7. As a player, I can pause, and I can still build while paused.
8. As a player, enemies take the open route to my keep. They only break through walls/structures when no open path exists.
9. As a player, when the keep's HP reaches 0 the game ends and shows the wave I reached. I can restart.

### Game rules (MVP)

**Map**
- Fixed-size grid, default 153 x 102 tiles (configurable; was 48 x 32 until the map controls arrived).
- The map view scrolls and zooms: arrow keys pan, the mouse wheel and `+`/`-` zoom (from the whole map up to 3x), and a minimap in the panel shows the whole map, enemies and the current view, and moves the view when clicked or dragged.
- Keep: 3x3 footprint at map centre, has HP (default 99; 300 since `enemy-kinds`).
- Spawn zone: a marked strip on the map edge. MVP has a single fixed zone on the left edge. Nothing can be built inside it.
- Terrain: all tiles are open ground for the MVP (no rocks/water yet).
- Build area: anywhere in bounds except the keep, the spawn zone, occupied tiles, and tiles with an enemy currently on them (stops enemies being trapped inside walls).

**Time**
- Real-time simulation at a fixed tick rate (20 ticks/sec), decoupled from rendering.
- Space toggles pause. Building is allowed while paused.
- Between waves there is a countdown (default 20s). A "Send next wave now" button skips it and awards +1 gold per full second skipped.

**Structures** (all occupy one tile unless stated; numbers are starting values to tune, kept in one config file)

| Structure | Glyph | Cost | HP | Behaviour |
|---|---|---|---|---|
| Keep | `K` | - | 99 | Game over at 0. Enemies that reach it deal damage and are removed. |
| Wall | `#` | 5 | 50 | Blocks movement. |
| Archer tower | fletched arrow (faces its arc) | 25 | 40 | Range 5, fast fire (1/s), single target, low damage. Blocks movement. |
| Cannon | `C` | 50 | 60 | Range 4, slow (0.4/s), small splash (radius 1). Blocks movement. |
| Catapult | `P` | 80 | 40 | Range 9, min range 3, very slow (0.2/s), large splash (radius 2). Blocks movement. |
| Floor spikes | `^` | 15 | - | Walkable. Fires every 1.5s: spikes come up from the floor and deal 15 damage to every enemy on its tile. Does not block. Never attacked. |
| Wall spikes | arrow `↑→↓←` | 20 | 50 | A wall section with spikes facing one direction (chosen before placing). Fires every 2s, dealing 20 damage to every enemy on the one adjacent tile it faces. Blocks movement. |
| House | `h` | 40 | 30 | Generates +2 gold every 5s. Blocks movement. |

- Towers target the enemy closest to the keep (by path distance) within range. Projectiles are instant hit for the MVP (no travel time); splash is applied at the target tile.
- Spike traps run on a fixed cycle from the moment they're built, whether or not an enemy is there, so timing matters. A brief "spikes up" visual shows each time they fire.
- Sell refunds 50% of cost. Damaged structures refund proportionally less. Floor spikes always refund 50%.
- **Since `tile-layers`:** towers (archer, cannon, catapult) can also be built on top of walls. A wall-mounted tower is shielded by its wall and falls with it; selling removes the tower before the wall. See [`SPEC-tile-layers.md`](SPEC-tile-layers.md).
- **Since `map-gen`:** the map is no longer an empty field. Each game is generated from a seed with a coast, a river with fords, rocks, forests, ruins and treasure chests; bridges cross rivers and trees can be cleared. See [`SPEC-map-gen.md`](SPEC-map-gen.md).
- **Since `tower-aiming`:** towers face a direction when placed. Archers only fire inside a fixed 90° arc; cannons and catapults fire all round but must turn onto targets first. See [`SPEC-tower-aiming.md`](SPEC-tower-aiming.md).
- **Since `players`:** the simulation supports several players sharing one keep. Gold is per player (a single-player game has just player 1), every structure has an owner (ruins are neutral), and only the owner can sell it. Bounties pay the player who struck the killing blow. Pause and fast-forward are unanimous votes of connected players. See [`SPEC-players.md`](SPEC-players.md).
- **Since `game-server`:** a Node WebSocket server (`npm run server`) hosts rooms, each running this simulation at 20 Hz, applying each connection's commands as its own player and sending 10 Hz updates. `ws` is the first runtime dependency (server only). See [`SPEC-game-server.md`](SPEC-game-server.md).
- **Since `net-client`:** the browser plays online through the server (`?create&name=` / `?room=CODE`), via a `Session` that is either the local simulation or the server's game. See [`SPEC-net-client.md`](SPEC-net-client.md).
- **Since `enclosures`:** areas enemies can't reach from the spawn (closed by walls, other structures, terrain or the map edge, with at least one player-built piece) make building cheaper: 50% off in the keep's enclosure, 25% elsewhere, inside and on their walls. Refunds are half of what was paid. See [`SPEC-enclosures.md`](SPEC-enclosures.md).
- **Since `lobby`:** the page opens on a start screen (name, Play solo, Create room, Join by code), and new rooms wait until their host starts the game. See [`SPEC-lobby.md`](SPEC-lobby.md).
- **Since `fog-of-war`:** players start seeing only the land around the keep. The keep and everything built see a region (inner: enemies visible; outer: land only), and land once seen stays seen; unexplored land is black and can't be built on. A new **watchtower** (`9`, 20g) only gives sight. Sight is shared in co-op. See [`SPEC-fog-of-war.md`](SPEC-fog-of-war.md).
- **Since `enemy-kinds`:** enemies come from a roster of eight kinds (goblin, zerg, wolf rider, barbarian, dwarf, barbarian chief, dwarf thane, golem), each with variants shown by glyph size. Each hits with its own damage and interval, and enemies that reach the keep stay and attack it until killed (keep HP 300). Until `wave-director`, each wave spends a threat budget of `5 + 3N` on the kinds unlocked by that wave, so waves 1-2 are unchanged. The Enemies and Waves tables below describe the MVP. See [`SPEC-enemy-kinds.md`](SPEC-enemy-kinds.md).
- **Since `field-units`:** the Offence tab's scout camps, barracks and archery ranges send scouts (push back the fog), soldiers and rangers (hunt visible enemies, else patrol the fog's edge; in PvP, march on a known rival keep through its weakest wall). They walk only on explored land. No building shows a facing notch any more: spawners show their door instead (a border while placing, a faint `S` once built), and every spawner turns its door with `R`. Buildings get symbols (keep `⛫`, house `⌂`, farmland `𐤄`...; see [`GLYPHS.md`](GLYPHS.md)), and the digger is `t`. See [`SPEC-field-units.md`](SPEC-field-units.md).
- **Since `units`:** guardhouses, archery posts and paladin halls (Defence tab, placed facing a way) each keep up to 3 swordsmen, archers or paladins, a new one every 30 s, on the open tiles in front of them. Swordsmen chase enemies within 3 tiles of their spot and return; archers shoot arrows from their spot; paladins hold theirs. In PvP, units fight rival units. See [`SPEC-units.md`](SPEC-units.md).
- **Since `town-economy`:** farmhouses earn per farmland tile joined to them (up to 8), shops add a flat income beside houses, and enemies have a `weight` that tramples farmland (light ones don't). The build picker has Defence / Civic / Offence tabs on `1` / `2` / `3`; tools are picked by clicking (only `X` for sell keeps a key). See [`SPEC-town-economy.md`](SPEC-town-economy.md).
- **Since `resources`:** trees, rocks, gold-veined rocks and berry bushes hold resource (`state.resources`, per tile); every hit (`harvest`) pays gold, and a used-up tile becomes open ground. Timber yards (`T`), mines (`G`) and forager huts (`B`) spawn lumberjacks, miners and foragers (5 each, one a minute) who gather the nearest resource of their kind. Gold only until `food`. See [`SPEC-resources.md`](SPEC-resources.md).
- **Since `unit-core`:** players have units (`state.units`): each has an owner, HP and armour, fights by a behaviour (`hold`), finds its own path (breadth-first, at most 8 searches a tick) and gives fog sight. Spawner buildings (a `spawner` row on a structure kind) make units free, one per interval up to a quota. Enemies fight units in their way or beside them (rams don't); PvP towers shoot rival units first. A dev militia (`U`, offline) is the only unit so far. See [`SPEC-unit-core.md`](SPEC-unit-core.md).
- **Since `enemy-pathing`:** enemies move by one of three cached flow fields: followers (today's rule), breachers (`d`, `D`, `G`, `R`: a wall costs the tiles they could walk while breaking it, so they break through when that's quicker) and marines (`m`, `M`: can swim, river cheaper than sea). Wandering respects terrain. Behaviours run on top: bands (`b` with `B`, `d` with `D`), bombers (`x`, `X`), shamans (`s`), diggers (`n`) and battering rams (`R`). Seven new kinds; hover shows what an enemy is doing. See [`SPEC-enemy-pathing.md`](SPEC-enemy-pathing.md).
- **Since `bestiary`:** a monster journal (`J`) fills in as each kind of enemy first comes into sight, with a notice; found kinds show their stats and variants, the rest are locked. Kept per device, in the browser only. See [`SPEC-bestiary.md`](SPEC-bestiary.md).
- **Since `audio`:** our own Web Audio chiptune synth plays sound effects from simulation cues (`state.cues`, played once each, capped per sound) and MIDI music on the title and start screens. See [`SPEC-audio.md`](SPEC-audio.md).

**Enemies** (one type for the MVP)

| Stat | Value (wave 1) | Scaling |
|---|---|---|
| HP | 20 | x (1 + 0.15 * (wave - 1)) |
| Speed | 1.5 tiles/s | constant |
| Damage to keep | 5 | constant |
| Damage to structures | 5 per second | constant |
| Bounty | 2 gold | +1 every 5 waves |
| Wander chance | 10% per tile | constant |

**Pathfinding**
- A single flow field (Dijkstra from the keep outwards) is recomputed whenever the grid changes. Every enemy follows it, so cost does not grow with enemy count.
- Open tiles and floor spikes cost 1. Blocking structures (walls, wall spikes, towers, houses) cost a very large value (greater than the total number of tiles), so any open route, however long, always wins.
- Wandering: at each tile, with chance `wanderChance` (`ENEMY.wanderChance`, copied onto the game state so it can be changed mid-game), an enemy steps sideways (at right angles to its path step) onto a random open tile. It never steps backwards (opposite its path step) or into a blocking structure; if neither sideways tile is open it follows the path.
- No doubling back: enemies remember the tile they just left. Wandering never returns to it, and when two path steps are equally short they take the other one. They only step back onto it if it is the only shortest step.
- If the only route to the keep goes through structures, enemies follow it and attack the first blocking structure in their way until it is destroyed, then the field is recomputed.
- Diagonal movement is not allowed (4-directional) for the MVP, which keeps wall-building intuitive.

**Waves**
- Wave N spawns `5 + 3N` enemies (rounded), staggered at 0.5s intervals across the spawn zone.
- The next wave countdown starts once the current wave has finished spawning (waves can overlap if the player is slow).
- Endless: no final wave.

**Economy**
- Starting gold: 150.
- Income: kill bounties + house income.

**Controls**
- `1`-`7` or click the sidebar to select a build tool (Wall, Archer, Cannon, Catapult, Floor spikes, Wall spikes, House). `X` selects sell.
- `R` rotates the facing of wall spikes before placing (cycles N, E, S, W). The ghost preview shows the facing.
- Left click places. Left drag paints walls/floor spikes/wall spikes along the dragged tiles.
- Right click or `Esc` clears the selected tool.
- Hovering a tile shows what's on it. Hovering a tower (or holding a tower tool) shows its range.
- `Space` pauses.
- `F` (or the `>>` button next to Pause) toggles fast forward at 2x game speed.

**Visual style**
- Canvas grid of coloured squares with a single glyph per tile, rendered in a monospace pixel font.
- Side panel and dialogs styled like classic Mac System 6/7: 1px black borders, striped title bars, white background, monochrome UI chrome. The map itself uses a limited colour palette.
- No sound in the MVP (see Out of Scope).

### Out of scope for the MVP (planned later)

Unit-spawning towers (swordsmen), portcullis, drawbridge, moat, pushers, crossbowmen, spike pit (floor spikes are now in the MVP, so this needs redefining, e.g. a pit that traps or slows), battering ram, ballista, multiple enemy types / armour, builder & digger enemies that target walls, sprites, pixel graphics, bit-crushed sound, save/load, multiplayer.

**Design constraints so those stay cheap later:**
- The simulation is pure TypeScript with no DOM access, deterministic given a seed. This enables unit tests now and lockstep/server-authoritative multiplayer later.
- Structure and enemy types are data-driven (one config table), so new towers/enemies are mostly new rows plus a behaviour function.
- The renderer reads game state and never mutates it, so the ASCII renderer can be replaced by a sprite renderer later.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Build/dev server:** Vite 7 (Vite 8 hits an npm 10 install bug with its optional devtools peers)
- **Rendering:** HTML5 Canvas 2D for the map, plain HTML/CSS for the side panel
- **Tests:** Vitest 5, with `@vitest/coverage-v8` for coverage (approved)
- **Formatting:** Prettier
- **Runtime deps:** none. Font: a pixel/monospace web font (e.g. "VT323" or "Silkscreen" via Google Fonts, or bundled locally).
- **Node:** 22 or 24 LTS (Vitest 5 engine range)

## Commands

```
Install:    npm install
Dev:        npm run dev          # Vite dev server, http://localhost:5173
Build:      npm run build        # tsc --noEmit && vite build -> dist/
Preview:    npm run preview      # serve the production build
Test:       npm test             # vitest run
Test watch: npm run test:watch   # vitest
Coverage:   npm run coverage     # vitest run --coverage
Typecheck:  npm run typecheck    # tsc --noEmit
Format:     npm run format       # prettier --write .
```

## Project Structure

```
index.html              -> Page shell: canvas + side panel
src/
  main.ts               -> Bootstraps game, game loop (fixed tick + render)
  sim/                  -> Pure simulation. NO DOM, NO Math.random (use rng.ts)
    config.ts           -> All tunable numbers: structure/enemy stats, wave formula, economy
    types.ts            -> Shared types (GameState, Tile, Structure, Enemy, ...)
    rng.ts              -> Seeded PRNG
    grid.ts             -> Grid creation, placement rules, occupancy
    pathfinding.ts      -> Flow field computation
    enemies.ts          -> Movement, attacking structures/keep
    towers.ts           -> Targeting and damage
    waves.ts            -> Wave scheduling and spawning
    economy.ts          -> Gold, bounties, house income, sell refunds
    game.ts             -> createGame(), tick(), applyCommand()
  render/
    canvas.ts           -> Draws grid, structures, enemies, overlays
    palette.ts          -> Colours and glyphs
  ui/
    panel.ts            -> Side panel (tools, gold, wave, keep HP, pause)
    input.ts            -> Mouse/keyboard -> commands
  styles.css            -> System 6/7 style chrome
tests/
  sim/                  -> Vitest unit tests for each sim module
README.md
SPEC.md
tasks/                  -> plan.md, todo.md (created in the planning phase)
```

The UI never mutates state directly. Input is turned into **commands** (`{ type: "build", kind: "wall", x, y }`, `{ type: "sell", x, y }`, `{ type: "togglePause" }`) that `applyCommand(state, playerId, command)` validates. This is also the seam for multiplayer: the acting player is passed alongside the command, never inside it.

## Code Style

- Plain data objects + functions for the simulation; avoid class hierarchies.
- `camelCase` for variables/functions, `PascalCase` for types, `SCREAMING_SNAKE_CASE` for config constants.
- Small, named functions; no magic numbers outside `config.ts`.
- Prettier defaults, 2-space indent, double quotes.

```ts
// src/sim/towers.ts
import { STRUCTURES } from "./config";
import type { GameState, Structure, Enemy } from "./types";

export function updateTower(state: GameState, tower: Structure): void {
  const stats = STRUCTURES[tower.kind];
  tower.cooldown -= 1;
  if (tower.cooldown > 0) return;

  const target = findTarget(state, tower, stats.range, stats.minRange ?? 0);
  if (!target) return;

  dealDamage(state, target, stats.damage, stats.splashRadius ?? 0);
  tower.cooldown = stats.fireIntervalTicks;
}

function findTarget(state: GameState, tower: Structure, range: number, minRange: number): Enemy | undefined {
  // Closest to the keep by flow-field distance, within [minRange, range].
  ...
}
```

## Testing Strategy

- **Vitest unit tests for everything in `src/sim/`.** The simulation is deterministic, so tests build a small grid, run N ticks, and assert on state.
- Required coverage areas:
  - Pathfinding: open path preferred over a shorter walled path; fully enclosed keep makes enemies target the cheapest wall; field updates after placing/removing a structure.
  - Placement: can't build on occupied tiles, the keep, the spawn zone, or out of bounds; can't build without enough gold.
  - Towers: range and min range respected; fire rate respected; splash hits neighbours; targets the enemy closest to the keep.
  - Spikes: floor spikes hit only enemies on their tile, on their cycle; wall spikes hit only the faced adjacent tile; routing unaffected by floor spikes.
  - Waves: enemy count and HP follow the formula for wave N; countdown and early send work.
  - Economy: bounties, house income timing, sell refunds (including damaged structures).
  - Game over triggers at keep HP <= 0.
- Coverage target: >= 80% lines for `src/sim/`. Rendering and UI are verified manually in the browser (no automated visual tests in the MVP).
- Tests live in `tests/sim/<module>.test.ts`.

## Boundaries

- **Always:**
  - Keep `src/sim/` free of DOM and `Math.random`.
  - Put tunable numbers in `config.ts`.
  - Run `npm run typecheck && npm test` before considering a task done.
  - Update README.md when commands, controls, or features change.
- **Ask first:**
  - Adding any npm dependency (runtime or dev) beyond Vite, TypeScript, Vitest, `@vitest/coverage-v8`, Prettier.
  - Changing core rules in this spec (pathfinding rules, economy model, tick rate).
  - Adding features listed under "Out of scope".
- **Never:**
  - Mutate game state from render/UI code.
  - Delete or skip failing tests to get green.
  - Commit `node_modules/` or `dist/`.

## Success Criteria

1. `npm install && npm run dev` opens a playable game in a modern browser (Chrome, Firefox, Safari) with no console errors.
2. The player can build all 7 structure types and sell them, with gold deducted/refunded correctly.
3. Enemies spawn from the spawn zone, follow the open route to the keep, and re-route within one tick when a wall is placed or removed.
4. When the keep is fully enclosed, enemies attack and destroy the structure on the cheapest route, then continue.
5. Each defence visibly behaves differently (fire rate, range, splash, catapult min range, floor spikes on their tile, wall spikes on their faced tile).
6. Houses produce income on their timer.
7. Wave N contains `5 + 3N` enemies with scaled HP, and the game continues indefinitely until the keep dies.
8. Game over screen shows the wave reached and offers a restart.
9. Stable 60 fps rendering with 200 enemies on screen on a typical laptop.
10. `npm run typecheck` and `npm test` pass, with >= 80% line coverage on `src/sim/`.

## Resolved Decisions (2026-10-24)

1. **Build area:** anywhere except the keep, spawn zone, occupied tiles and enemy-occupied tiles.
2. **Spawn zones:** one fixed zone on the left edge.
3. **Enemies attack structures** only when no open path exists. Builder/digger enemies that target walls on purpose come later.
4. **Spike traps:** two styles (floor, directional wall), firing on a fixed cycle. No durability or wear.
5. **Sound:** none in the MVP.
6. **Hosting:** local only.
7. **Version control:** `git init` in Task 1.
8. **Early wave send:** +1 gold per full second skipped.

## Open Questions

None currently.
