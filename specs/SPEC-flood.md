# Spec: No looking back (flood)

Status: FIRST BUILD (2026-11-01): solo, endless, with swarms; see "Still to do"
Module: `flood` (a game mode; the code keeps the issue's name). Issue #70. Builds on `fog-of-war`, `raiders` (planning with flags), `build-zone` and `mapgen`. It replaces Journey home (#78), whose camp, keep at the end and swarms it covers as variants.
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
- It spreads (`spreadLava`): a tile beside lava (or on the map's left edge) that the edge has passed fills at `flowRate` (1.25) times the lava's speed (never slower than it starts), and goes under once full. So it creeps round corners and through gaps at its own pace, just keeping up with its edge in the open. It turns to lava, and every structure on it is removed. Units, chests and flags on it go too.
- **Walls hold it.** A finished wall or a ruin (an old wall), a tower on either, and a goal's keep never go under: the lava flows round it, and land a closed ring of walls shuts in stays dry. If the wall goes (sold, say), the lava gets in. Walls hold along their sides; lava doesn't go corner to corner.
- The tiles it'll take soon glow (`lavaGlow`, worked out each tick): out from the tiles beside it, through tiles it can take only, up to `warnTiles` (4) steps and 4 tiles on from its edge, more strongly, and pulsing faster, the nearer they are (a filling tile as full as it is). Walls, and land they shut in, never glow.
- It's drawn raised: half a wall high where it's deep, 1 px at its fringe (beside land) and 2 px a tile in.
- If the king's tile goes under, the game is over. How far he got (`distanceTravelled`: tiles across the world from where he started) is the score.
- HUD: "Lava: starts in Ns" or "N tiles behind" (his row's edge), "Distance: N tiles", and the lava's speed.

**The land never ends** (`shiftWorld`)

- Once the king is within `aheadTiles` (48, at most half the map's width) of the map's right edge, the world moves on `shiftColumns` (3) columns, a column at a time. The leftmost column is dropped, with all on it (structures removed, units killed). Everything else moves a column left: every tile layer, structures, units (whose ways are found again), chests, the king, his flags and way, and the lava's front. A column of new land comes in on the right.
- New land is generated `chunkColumns` (40) columns at a time, as its own map (a river with fords, coast only top or bottom, rocks, forests, ruins, chests, resources), seeded by the game's seed and how far the world has moved. It's handed out a column at a time. A new piece is generated again (up to 20 tries) until you can walk from the left of the land before it right across the new piece, with ruins counted as in the way, and at least `seamRows` (3) open rows where they join.
- The camera moves with the world, so the view doesn't jump, then glides after the king (see "The camera"); the 3D view repaints its ground at once.

**The king's escort** (`FLOOD.escorts`; `keepEscort` in flood.ts, `escort` in units.ts)

- A barracks soldier and an archer, the player's units, each with a spot beside the king (the soldier ahead of him, the archer behind). They join him when the game's made.
- Each tick an escort fights anything in reach (as a guard does). One that closes in to fight (range 1, the soldier) goes after the enemy in its sight nearest the king, within `escortChase` (4) tiles of him. Otherwise it walks to its spot beside him, or anywhere beside him if that's blocked, and stands there.
- One that falls (to a swarm, or the lava) is gone for good.

**Swarms** (`src/sim/floodSwarms.ts`)

- On the starting map, about one per `FLOOD.swarm.tilesPerSwarm` (900) tiles, 4-8 enemies each round a middle at least `swarm.spacing` (10) from other swarms and `swarm.clearOfStart` (20) from the king's start. Each piece of new land brings as many for its size, placed when the land round their middle has come in. A swarm is as tough as wave 1 + one for each `FLOOD.tilesPerWave` (40) tiles across the world from the king's start, up to `hardestWave` (25).
- Asleep, a member stands at its post or walks back to it. One that sees the king (`swarm.sight`, 6 tiles) or is hurt wakes its whole swarm. Awake, it walks to the king by a short path round what's in the way (it never breaks walls), and once beside him hits him for its damage every attack interval. On the way, at each tile, it stops to fight a unit of the player's beside it (the weakest), as wave enemies do, so the escort and other units get fought. It goes back to sleep `swarm.giveUpSeconds` (6 s) after it last saw him (or was hurt).
- The king has `FLOOD.kingHp` (150) HP, shown in the HUD ("King") and as a bar over him once hurt. At 0 the game's over ("The king has fallen.").
- Kills pay their bounty as usual. Lava kills enemies it reaches (no bounty). They move with the world, posts and all; a post that's dropped off the map leaves its enemy roaming.

**Building**

- Anywhere you've seen, as usual. Build time is measured from the king instead of a keep.
- Enclosures are cheaper (`ENCLOSURE_DISCOUNT.outer`, 25%) as usual. With no spawn strip, the outside is open ground joined to the map's edges (where new land and swarms come from).

**The camera** (`src/ui/lavaCamera.ts`)

- It's the player's to pan and zoom: nothing pushes it on or holds it back.
- When the world moves on, the camera moves with it at once (`moveWithWorld`), so what's on screen stays put, and then glides (`GLIDE_RATE`) along the way the lava runs until the king is `FOLLOW_AT` (35%) across the screen from the lava's side, with the new land ahead of him in view. It stops there, at the map's edge, or as soon as the player pans.

**The 3D view** (`?3d`)

- Lava and its height come from the shared terrain and block heights. The king stands as a glyph card, like units, a little taller. His flags and way are drawn over the view on the tops they're on. The lava's glow is painted into the map's texture, without the pulse.

## Balance

First guesses, checked with a scripted king that plants a flag every second on the reachable tile furthest right. With the fog on (so it walks into dead ends) it lasts 4-10 minutes and gets 100-350 tiles. With the fog off it lasts 16-20 minutes and gets 800-1,100 tiles, until the lava outruns it. A player who plans ahead, bridges rivers and walls off tongues of lava should land in between. Ticks average 0.1-1 ms.

**A goal** (`floodGoal`: the mode's Goal setting, Endless or a keep at 250, 500 or 1,000 tiles; or `&goal=N`)

- A keep (not one you defend: no HP, not in `state.keeps`) stands `goal` tiles on from the king's start. If that's on the starting map, it's made with a keep's clear patch round it. Otherwise it goes in the piece of new land its column falls in, on that piece's clear patch (moved there), so it's always on open ground you can reach. Nothing's on its tiles, and lava flows round it.
- Once the keep and `pastKeep` (8) tiles beyond it are on the map, no more new land comes.
- The king on, or next to, any of its tiles wins. The HUD shows "Keep: N tiles to go" in place of the lava's speed.

## Still to do

- **Campaign levels** using goals (level files with `mode: flood` and a goal).
- Wandering goblins (as Journey home had).
- PvP from the issue (a lane each, or one shared map).
- A best distance kept between games.
- A HUD button and a pad binding for the Route tool (keyboard H only).
