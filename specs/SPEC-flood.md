# Spec: No looking back (flood)

Status: FIRST BUILD (2026-11-01): solo or co-op, endless, with swarms; see "Still to do"
Module: `flood` (a game mode; the code keeps the issue's name). Issue #70. Builds on `fog-of-war`, `raiders` (planning with flags), `build-zone` and `mapgen`. It replaces Journey home (#78), whose camp, keep at the end and swarms it covers as variants.
Last updated: 2026-11-01

## Objective

An endless mode about keeping moving, solo or co-op. You have no keep of your own. Each player's **royal** starts on the left edge and walks on into new land for as long as it can. Behind them, lava creeps in, slowly at first and faster all the time, and takes everything it reaches except walls. You can't dig in for long. You plan your royal's way forward with flags, as a raider plans, bridge or wall off what you need to, and see how far the team gets.

**Player-facing outcome:** pick Solo, then No looking back. The map opens on the king (`♚`, in your colour) at the left edge. The HUD says the lava starts in 20 s. You click well to the right, Shift+click a flag past a river's ford, and he sets off. The lava comes in behind him in a ragged, glowing line, a tongue of it running ahead here and there. The camera glides after him, and new land keeps coming in on the right. Ten minutes on, the lava is faster than he can walk and catches him: "The king got 412 tiles, in 11m 3s." In co-op, a friend's queen walks beside him in their colour, and when he falls, his player builds on with her.

## Rules

**The map**

- At the start, generated as an Endless map, with a clear patch round the royals' start (as a keep's would be), no spawn strip and the coast only along the top or bottom. All walkable land is joined up.
- New land comes in on the right as the royals go (see "The land never ends"). Everything is seeded, so a game plays the same for the same seed and the same moves.

**The royals** (`state.flood.royals`; `assignRoyals`)

- One per player, up to 4 (a room's most): the first player (by id) leads the king (`♚`), then the queen (`♛`), a prince (`♔`) and a princess (`♕`). They're handed out when the game's made (solo) or when a room's host starts it (and on restart), on the start column, a few rows apart (`FLOOD.startRows`), each with its own escort. A player who joins once it's going has none, and builds with the rest.
- Not keeps and not units: each is a tile (`at`), plus `progress` toward the next, with `royalHp` (150) HP. Nothing but swarms attack them.
- Each sees `FLOOD.royalSight` (7 tiles clearly, 10 dimly) from wherever it stands, for its player's team (the whole team, in co-op). What it sees is explored, so a player whose royal has fallen still builds anywhere the team's seen.
- Each walks at `royalSpeed` (1.5 tiles a second) when it has a flag to walk to.
- A royal falls when the lava reaches its tile ("lava") or swarms take all its HP ("swarm"): it's gone, and its player can't plan any more ("Your royal has fallen"). Once all have fallen the game's over. How far any got (`flood.best`, the furthest across the world from the start any royal has stood) is the score.

**The plan** (`planKing {x, y, queue?}`: the player's own royal's), as a raider plans their enemy's

- A list of flags, at most `maxFlags` (10). Without `queue`, the flag replaces its plan; with it, it's added after its others ("Too many flags" past the limit). A flag on the royal itself (without `queue`) clears its plan: it stops. Refused off the map, where you've never seen, and on lava.
- It walks to its first flag by the shortest way (4-way steps; of the shortest ways, the one nearest the straight line, so it walks a staircase rather than an L) over tiles it can step on: walkable terrain or a bridge, nothing blocking it, and explored by its team. Once there, or as near as it can get if it can't be reached, that flag's done and it heads for the next. Its way (`path`) is found again at each step.
- Input: with nothing in hand (or the Route tool, H), a click plans: plain for a new plan, Shift to add a flag. Drawn as a raider's flags (numbered pennants in the player's colour, joined from the royal by a faint dashed line), with its way to the next flag as a dot on each tile. Each player sees only their own royal's.

**The lava**

- `front`, in tiles from the left edge, starts moving after `graceSeconds` (20). Its speed is `lavaSpeed`: 0.35 tiles a second, 0.06 more each minute after that, up to 1.8, faster than a royal walks, so every game ends.
- Its edge isn't straight. Each row's edge (`lavaEdge`) is the front pushed on or held back by up to `edge.reach` (3) tiles, by two slow waves across the rows that drift over time (seeded). Each tile also goes under up to `edge.rough` (1.5) tiles later, fixed for its place in the world.
- It spreads (`spreadLava`): a tile beside lava (or on the map's left edge) that the edge has passed fills at `flowRate` (1.25) times the lava's speed (never slower than it starts), and goes under once full. So it creeps round corners and through gaps at its own pace, just keeping up with its edge in the open. It turns to lava, and every structure on it is removed. Units, chests and flags on it go too.
- **Walls hold it.** A finished wall or a ruin (an old wall), a tower on either, and a goal's keep never go under: the lava flows round it, and land a closed ring of walls shuts in stays dry. If the wall goes (sold, say), the lava gets in. Walls hold along their sides; lava doesn't go corner to corner.
- A wall (only a wall) can be built on lava if a tile beside it (not corner to corner) has a wall, finished or not, or a ruin: "A wall on lava has to join on to a wall" otherwise. So a line of walls can be pushed out across the lava.
- **Hills and rock hold it too.** Hills (`hill` terrain, `floodHills.ts`) are rough ovals of high ground, `FLOOD.hills.across` by `down` tiles, up to `perPiece` (3) on each piece of new land and as many for its width on the starting map, raised over open ground before the ruins go in. They're walked and built on as ground is, and drawn 3 px up (with whatever's on them). Rock and gold-veined rock hold the flood as well.
- **Or water** (`floodLiquid`: the mode's Flood setting, Lava or Water; or `&liquid=water`; `FLOOD_LIQUIDS`). Water floods just as lava does, as `floodwater` terrain, and it's the same everywhere but this: it leaves trees and berry bushes standing too, and goes round them as it goes round walls (they hold it, don't glow, and land they shut in stays dry). Clear one and the water can take its tile. Water is drawn blue, with a blue glow ahead of it, and lies a third of a wall high where it's deep. Everything below about lava goes for water too: it takes royals, can be walled across, and drains away (as lava cools) once walled off.
- **Walled-off lava cools** (`coolLava`, once a second). Lava still joined, through lava (not walls or ruins on it), to where it comes in on the left edge is live. Lava cut off from it stops spreading (tiles beside only it come off the edge list, so they don't fill or glow), and cools back to ground from its edges in: a tile of it beside land (or a wall) turns to ground once it's been cut off and beside land `coolSeconds` (4 s). So a pocket dies away a ring at a time. If a wall goes, what's left joins the live lava again.
- The tiles it'll take soon glow (`lavaGlow`, worked out each tick): out from the tiles beside it, through tiles it can take only, up to `warnTiles` (4) steps and 4 tiles on from its edge, more strongly, and pulsing faster, the nearer they are (a filling tile as full as it is). Walls, and land they shut in, never glow.
- It's drawn raised: half a wall high where it's deep, 1 px at its fringe (beside land) and 2 px a tile in.
- A royal whose tile goes under has fallen (see "The royals").
- HUD: "Lava: starts in Ns" or "N tiles behind" (your royal's row's edge), your royal's HP (or how many still stand, once yours has fallen), "Distance: N tiles", and the lava's speed.

**The land never ends** (`shiftWorld`)

- Once a royal is within `aheadTiles` (48, at most half the map's width) of the map's right edge, the world moves on `shiftColumns` (3) columns, a column at a time. The leftmost column is dropped, with all on it (structures removed, units killed). Everything else moves a column left: every tile layer, structures, units (whose ways are found again), chests, the royals, their flags and ways, and the lava's front. A column of new land comes in on the right.
- New land is generated `chunkColumns` (40) columns at a time, as its own map (a river with fords, coast only top or bottom, rocks, forests, ruins, chests, resources), seeded by the game's seed and how far the world has moved. It's handed out a column at a time. A new piece is generated again (up to 20 tries) until you can walk from the left of the land before it right across the new piece, with ruins counted as in the way, and at least `seamRows` (3) open rows where they join.
- The camera moves with the world, so the view doesn't jump, then glides after your royal (see "The camera"); the 3D view repaints its ground at once.

**Each royal's escort** (`FLOOD.escorts`; `joinEscort` in flood.ts, `escort` in units.ts)

- A barracks soldier and an archer, the royal's player's units, each with a spot beside it (the soldier ahead, the archer behind). They join it when the royals are handed out.
- Each tick an escort fights anything in reach (as a guard does). One that closes in to fight (range 1, the soldier) goes after the enemy in its sight nearest its royal, within `escortChase` (4) tiles of it. Otherwise it walks to its spot beside the royal, or anywhere beside it if that's blocked, and stands there. Its royal fallen, it stands where it is and fights.
- One that falls (to a swarm, or the lava) is gone for good.

**Ruins** (`FLOOD.ruins`; `src/sim/floodRuins.ts`)

- Each piece of new land gets up to `perPiece` (4) ruins, fewer where they'd overlap (2 tiles apart at least) or touch a goal's keep, of each kind by weight (`kinds`). They're placed with their own RNG over what the map generator made, clearing the ground under them, and before the walk-across check, so they never block the way on.
  - **Forts**: closed square rings of ruins, `fortSize` (7-9) across, at full HP.
  - **Halls**: rings `hallWidth` (11-17) by `hallHeight` (9-13), weathered (`weathered`, 60% HP), with `gaps` (1-3) gaps `gapWidth` (2) wide in their sides, never at a corner.
  - **Compounds**: two forts side by side (across or down), sharing a wall with a one-tile doorway in it, at full HP.
  - **Lines**: a straight stretch of ruined wall `lineLength` (6-14) long, across or down, with (half the time) a bend `bendLength` (3-8) long at its far end; weathered.
- In each room (an enclosure's inside): a chest of `chestGold` (60-150) in the middle (`chestChance`, 80%); a 2x2 to 3x2 patch of gold-veined rock, trees or berries in a corner (`resourceChance`, 40%), never on the middle row or column; and a swarm (`swarmChance`, 40%; rooms at least 5 across), placed when the land round the room's middle has come in.
- Ruins hold lava, so a closed fort's inside stays dry. There's no way in but selling a ruin (they're nobody's).
- The starting map gets them too (`withStartingRuins`), as many for its width as new land gets, clear of the royals' start (`swarm.clearOfStart`) and a goal's keep, and only where they leave a way from the start to the right edge (tried 10 times, else none). Their swarms are placed with the map's others.

**Swarms** (`src/sim/floodSwarms.ts`)

- On the starting map, about one per `FLOOD.swarm.tilesPerSwarm` (900) tiles, 4-8 enemies each round a middle at least `swarm.spacing` (10) from other swarms and `swarm.clearOfStart` (20) from the royals' start. Each piece of new land brings as many for its size, placed when the land round their middle has come in. A swarm is as tough as wave 1 + one for each `FLOOD.tilesPerWave` (40) tiles across the world from the royals' start, up to `hardestWave` (25).
- Asleep, a member stands at its post or walks back to it. One that sees a royal (`swarm.sight`, 6 tiles) or is hurt wakes its whole swarm. Awake, it walks to the nearest royal by a short path round what's in the way (it never breaks walls), and once beside it hits it for its damage every attack interval. On the way, at each tile, it stops to fight a unit of the player's beside it (the weakest), as wave enemies do, so the escort and other units get fought. It goes back to sleep `swarm.giveUpSeconds` (6 s) after it last saw a royal (or was hurt).
- A royal's HP shows in its player's HUD ("King", "Queen"...) and as a bar over it once hurt. At 0 it falls (see "The royals").
- Kills pay their bounty as usual. Lava kills enemies it reaches (no bounty). They move with the world, posts and all; a post that's dropped off the map leaves its enemy roaming.

**Building**

- Anywhere you've seen, as usual. Build time is measured from your royal (or, once it's fallen, the nearest one) instead of a keep.
- Enclosures are cheaper (`ENCLOSURE_DISCOUNT.outer`, 25%), and tinted, as usual, but here an enclosure of ruins alone counts too (elsewhere a player's building has to be part of its wall), since forts and halls are made to be enclosures. With no spawn strip, the outside is open ground joined to the map's edges (where new land and swarms come from).

**The camera** (`src/ui/lavaCamera.ts`)

- It's the player's to pan and zoom: nothing pushes it on or holds it back.
- When the world moves on, the camera moves with it at once (`moveWithWorld`), so what's on screen stays put, and then glides (`GLIDE_RATE`) along the way the lava runs until your royal (or, once it's fallen, the one furthest on) is `FOLLOW_AT` (35%) across the screen from the lava's side, with the new land ahead of it in view. It stops there, at the map's edge, or as soon as the player pans.

**The 3D view** (`?3d`)

- Lava and its height come from the shared terrain and block heights. Each royal stands as a glyph card, like units, a little taller. Your royal's flags and way are drawn over the view on the tops they're on. The lava's glow is painted into the map's texture, without the pulse.

## Balance

First guesses, checked (solo) with a scripted king that plants a flag every second on the reachable tile furthest right. With the fog on (so it walks into dead ends) it lasts 4-10 minutes and gets 100-350 tiles. With the fog off it lasts 16-20 minutes and gets 800-1,100 tiles, until the lava outruns it. A player who plans ahead, bridges rivers and walls off tongues of lava should land in between. Ticks average 0.1-1 ms.

**A goal** (`floodGoal`: the mode's Goal setting, Endless or a keep at 250, 500 or 1,000 tiles; or `&goal=N`)

- A keep (not one you defend: no HP, not in `state.keeps`) stands `goal` tiles on from the royals' start. If that's on the starting map, it's made with a keep's clear patch round it. Otherwise it goes in the piece of new land its column falls in, on that piece's clear patch (moved there), so it's always on open ground you can reach. Nothing's on its tiles, and lava flows round it.
- Once the keep and `pastKeep` (8) tiles beyond it are on the map, no more new land comes.
- A royal on, or next to, any of its tiles wins. The HUD shows "Keep: N tiles to go" in place of the lava's speed.

**Online** (co-op rooms)

- A room can be made as No looking back (`create` with `mode: "flood"`, an optional `goal` and an optional `liquid`), up to 4 players. The waiting room shows which royal each will lead.
- Updates carry the royals and the lava's front and glow (`clientFlood`: not the lava's edge list or the new land still to come, which only the server needs). When the world moves on, the update's `flood.shifted` says by how much: each client moves its tile layers along (`shiftLayers`) and the server moves its record of what it sent the same way, so only the new columns and real changes are sent, not the whole map.

## Still to do

- **Campaign levels** using goals (level files with `mode: flood` and a goal).
- Wandering goblins (as Journey home had).
- PvP from the issue (a lane each, or one shared map).
- A best distance kept between games.
- A HUD button and a pad binding for the Route tool (keyboard H only).
