# Spec: No looking back (flood)

Status: FIRST BUILD (2026-11-01): solo, endless, no enemies; see "Still to do"
Module: `flood` (a game mode; the code keeps the issue's name). Issue #70. Builds on `fog-of-war`, `raiders` (planning with flags), `build-zone` and `mapgen`.
Last updated: 2026-11-01

## Objective

An endless solo mode about keeping moving. You have no keep of your own. Your **king** starts on the left edge and walks on into new land for as long as he can. Behind him, lava creeps in, slowly at first and faster all the time, and takes everything it reaches except walls. You can't dig in for long. You plan the king's way forward with flags, as a raider plans, bridge or wall off what you need to, and see how far you get.

**Player-facing outcome:** pick Solo, then No looking back. The map opens on the king (`♚`, in your colour) at the left edge. The HUD says the lava starts in 20 s. You click well to the right, Shift+click a flag past a river's ford, and he sets off. The lava comes in behind him in a ragged, glowing line, a tongue of it running ahead here and there. The camera glides after the king, and new land keeps coming in on the right. Ten minutes on, the lava is faster than he can walk and catches him: "He got 412 tiles, in 11m 3s."

## Rules

**The map**

- At the start, generated as an Endless map, with a clear patch round the king's start (as a keep's would be), no spawn strip and the coast only along the top or bottom. All walkable land is joined up.
- New land comes in on the right as the king goes (see "The land never ends"). Everything is seeded, so a game plays the same for the same seed and the same moves.

**The king**

- Not a keep and not a unit: he has no HP and nothing attacks him. He's `state.flood.king`, a tile, plus `progress` toward the next one.
- He sees `FLOOD.kingSight` (7 tiles clearly, 10 dimly) from wherever he stands. What he sees is explored.
- He walks at `kingSpeed` (1.5 tiles a second) when he has a flag to walk to. If not, he stands still.

**The plan** (`planKing {x, y, queue?}`), as a raider plans their enemy's

- A list of flags, at most `maxFlags` (10). Without `queue`, the flag replaces his plan; with it, it's added after his others ("Too many flags" past the limit). A flag on the king himself (without `queue`) clears his plan: he stops. Refused off the map, where you've never seen, and on lava.
- He walks to his first flag by the shortest way (4-way steps; of the shortest ways, the one nearest the straight line, so he walks a staircase rather than an L) over tiles he can step on: walkable terrain or a bridge, nothing blocking it, and explored by you. Once there, or as near as he can get if it can't be reached, that flag's done and he heads for the next. His way (`path`) is found again at each step.
- Input: with nothing in hand (or the Route tool, H), a click plans: plain for a new plan, Shift to add a flag. Drawn as a raider's flags (numbered pennants in the player's colour, joined from the king by a faint dashed line), with his way to the next flag as a dot on each tile.

**The lava**

- `front`, in tiles from the left edge, starts moving after `graceSeconds` (20). Its speed is `lavaSpeed`: 0.35 tiles a second, 0.06 more each minute after that, up to 1.8, faster than the king walks, so every game ends.
- Its edge isn't straight. Each row's edge (`lavaEdge`) is the front pushed on or held back by up to `edge.reach` (3) tiles, by two slow waves across the rows that drift over time (seeded). Each tile also goes under up to `edge.rough` (1.5) tiles later, fixed for its place in the world.
- It spreads (`spreadLava`): each tick, each tile beside lava (or on the map's left edge) that the edge has passed goes under, a tile a tick, so it can pour round things. It turns to lava, and every structure on it is removed. Units, chests and flags on it go too.
- **Walls hold it.** A finished wall (and a tower on it) never goes under: the lava flows round it, and land a closed ring of walls shuts in stays dry. If the wall goes (sold, say), the lava gets in. Walls hold along their sides; lava doesn't go corner to corner.
- The `warnTiles` (4) tiles ahead of its edge glow, more strongly, and pulsing faster, the nearer they are.
- It's drawn raised: half a wall high where it's deep, 1 px at its fringe (beside land) and 2 px a tile in.
- If the king's tile goes under, the game is over. How far he got (`distanceTravelled`: tiles across the world from where he started) is the score.
- HUD: "Lava: starts in Ns" or "N tiles behind" (his row's edge), "Distance: N tiles", and the lava's speed.

**The land never ends** (`shiftWorld`)

- Once the king is within `aheadTiles` (48, at most half the map's width) of the map's right edge, the world moves on `shiftColumns` (3) columns, a column at a time. The leftmost column is dropped, with all on it (structures removed, units killed). Everything else moves a column left: every tile layer, structures, units (whose ways are found again), chests, the king, his flags and way, and the lava's front. A column of new land comes in on the right.
- New land is generated `chunkColumns` (40) columns at a time, as its own map (a river with fords, coast only top or bottom, rocks, forests, ruins, chests, resources), seeded by the game's seed and how far the world has moved. It's handed out a column at a time. A new piece is generated again (up to 20 tries) until you can walk from the left of the land before it right across the new piece, with ruins counted as in the way, and at least `seamRows` (3) open rows where they join.
- The camera moves with the world, so the view doesn't jump; the 3D view repaints its ground at once.

**Building**

- Anywhere you've seen, as usual. Build time is measured from the king instead of a keep.

**The camera** (`src/ui/lavaCamera.ts`)

- It keeps to the land in play. It shows no more than `LAVA_SHOWN` (3) tiles back over the lava's front, so it's pushed on as the lava comes, and it keeps the king (where he is, part way between tiles) at least `MARGIN` (4) tiles from its edges. It glides to where those rules want it (`GLIDE_RATE`) rather than jumping. Otherwise panning, zooming and looking ahead are free. With the view turned, the lava's side of the screen turns with it.

**The 3D view** (`?3d`)

- Lava and its height come from the shared terrain and block heights. The king stands as a glyph card, like units, a little taller. His flags and way are drawn over the view on the tops they're on. The lava's glow is painted into the map's texture, without the pulse.
- The camera rule works from the ground point in the middle of the screen.

## Balance

First guesses, checked with a scripted king that plants a flag every second on the reachable tile furthest right. With the fog on (so it walks into dead ends) it lasts 4-10 minutes and gets 100-350 tiles. With the fog off it lasts 16-20 minutes and gets 800-1,100 tiles, until the lava outruns it. A player who plans ahead, bridges rivers and walls off tongues of lava should land in between. Ticks average 0.1-1 ms.

## Still to do

- A **campaign**: the keep appearing after a set distance, reaching it to win.
- **Enemies on** (the issue's option).
- PvP from the issue (a lane each, or one shared map).
- A best distance kept between games.
- A HUD button and a pad binding for the Route tool (keyboard H only).
