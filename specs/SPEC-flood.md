# Spec: No looking back (flood)

Status: FIRST BUILD (2026-11-01): solo, playable, no enemies; see "Still to do"
Module: `flood` (a game mode; the code keeps the issue's name). Issue #70. Builds on `journey` (the map layout), `fog-of-war`, `raiders` (painted paths) and `build-zone`.
Last updated: 2026-11-01

## Objective

A solo mode about keeping moving. You have no keep of your own. Your **king** starts on the far left edge and has to walk home, a keep on a raised mountain on the right edge. Behind him, lava comes in from the left in waves. Each wave runs fast across 3 tiles and takes everything on them, then there's a short calm, each a little shorter than the last. You can't dig in. You plan the king's way forward with flags, as a raider plans, bridge what's in the way, and use each calm to get ahead of the next wave.

**Player-facing outcome:** pick Solo, then No looking back. The map opens on the king (`♚`, in your colour) at the left edge, with home's mountain far off on the right. The land behind him glows orange and the HUD counts down to the first wave. You click well to the right, then Shift+click a second flag past a river's ford, and he sets off. The wave runs in behind him, faster than he walks, three tiles, then the next, and the camera rolls on with it. The glow moves on ahead of each. You plant more flags.

## Rules

**The map**

- Generated as for Journey home. The king starts where the camp would, and home (a `KEEP_SIZE` keep, not one you defend: it has no HP and isn't in `state.keeps`) is where Journey home's keep would be. Map generation's connectivity check means every walkable tile can reach home without bridges (rivers have fords), so there's always a way home. Bridges are a shortcut. There's no spawn strip, no starter walls, no Endless waves and no enemies. Hand-made maps can't be No looking back maps yet.
- The whole map is generated from the seed and there from the start, under the fog. The camera rolls on with the lava (see "The camera").

**The mountain**

- Rings of tiles out to `mountainRadius` (4) round home's keep, each a step higher toward the keep, with the keep on top. It's cleared to open ground (no rock, trees, ruins or chests) and explored from the start.
- Lava never covers it, so the king, units and flags on it are safe. Nothing can be built on it ("Nothing can be built on the mountain").

**The king**

- Not a keep and not a unit: he has no HP and nothing attacks him. He's `state.flood.king`, a tile, plus `progress` toward the next one.
- He sees `FLOOD.kingSight` (7 tiles clearly, 10 dimly) from wherever he stands. What he sees is explored.
- He walks at `kingSpeed` (1.5 tiles a second) when he has a flag to walk to. If not, he stands still.

**The plan** (`planKing {x, y, queue?}`), as a raider plans their enemy's

- A list of flags, at most `maxFlags` (10). Without `queue`, the flag replaces his plan; with it, it's added after his others ("Too many flags" past the limit). A flag on the king himself (without `queue`) clears his plan: he stops. Refused off the map, where you've never seen, and on lava.
- He walks to his first flag by the shortest way (4-way steps; of the shortest ways, the one nearest the straight line, so he walks a staircase rather than an L) over tiles he can step on: walkable terrain or a bridge, nothing blocking it, and explored by you. Once there, or as near as he can get if it can't be reached, that flag's done and he heads for the next. His way (`path`) is found again at each step, so he goes round what's built or blocks him on the way.
- Lava takes any flags on the columns it covers (but not on the mountain).
- Input: with nothing in hand (or the Route tool, H), a click plans: plain for a new plan, Shift to add a flag. Drawn as a raider's flags (numbered pennants in the player's colour, joined from the king by a faint dashed line), with his way to the next flag as a dot on each tile. All are lifted onto the mountain's tops.

**The lava**

- `front`, in tiles from the left edge. It comes in waves. The first comes after `graceSeconds` (20). A wave runs `surgeTiles` (3) further at `surgeSpeed` (4 tiles a second). Then comes a calm of `calmSeconds`: 2.4 s after the first wave, 0.03 s less after each one, down to 1.15 s (rounded to whole ticks).
- Each column the front fully passes turns to lava (terrain `lava`: impassable, unbuildable), except the mountain. Every structure on it is removed, units on it die, and flags on it go.
- The land the coming wave will take (from the front to where that wave will stop) glows. During a calm it glows more strongly, and pulses faster, as the wave nears. While a wave is coming in, it glows at full strength.
- If the king's tile turns to lava, the game is lost.
- HUD: "Lava: wave N in Ss" or "wave N coming in!", how many tiles behind the king it is ("Safe on the mountain" once he's on it), and how far home he is.

**Building**

- Only within `buildRadius` (6) tiles of the king, in any direction ("Too far from the king"). Everything else is as in Endless. Build time is measured from the king instead of a keep.

**The camera** (`src/ui/lavaCamera.ts`)

- Each frame, the view is moved, if it needs to be, so that it shows no more than `LAVA_SHOWN` (3) tiles back over the lava's front, so it's pushed on as each wave comes in. It also keeps the king at least `MARGIN` (4) tiles in from its edges, or as near as a small view allows. The king wins over the lava if the view can't hold both. Panning, zooming and looking ahead are otherwise free. With the view turned, the lava's side of the screen turns with it.

**The 3D view** (`?3d`)

- The lava, the mountain and home's keep come from the shared terrain and block heights, so they stand up there as on the flat map. The king stands as a glyph card, like units, a little taller. His flags, the dashed line and his way are drawn over the view on the tops they're on, as raiders' flags are. The lava's glow is painted into the map's texture, without the pulse (it's repainted every second or so).
- The camera rule works from the ground point in the middle of the screen: at least half the screen's width (in tiles) on from the lava, less `LAVA_SHOWN`, and no further from the king than that less `MARGIN`.

**Winning**

- The king on, or next to, any tile of home's keep wins.

## Balance

The numbers above are first guesses, checked with a scripted king that plants a flag every second on the reachable seen tile nearest home (or, if home's out of reach, the edge of what's seen nearest it). Over 5 seeds each of S, M and L, it wins all but one L map. The nearest the lava gets to it after the first 40 s is 23-36 tiles on S, 8-29 on M and 3-11 on L. The calms were set to be a little faster than the earlier big waves, which the same king beat with 18-32 tiles to spare on M. A player who stops to plan, build and back out of dead ends should feel the lava. Ticks average about 0.1 ms.

## Still to do

- **Enemies on** (the issue's option): Journey home's swarms, which would need a target that isn't a keep (the king), and the king given HP.
- Endless (score on distance) and PvP variants from the issue. Endless needs real generation ahead, not a pre-made map. Online play needs the same, seeded.
- Lava that changes direction, or follows the king.
- A HUD button and a pad binding for the Route tool (keyboard H only).
- `lava` is listed in the map editor's terrain, like every terrain; it does nothing special there.
