# Spec: No looking back (flood)

Status: FIRST BUILD (2026-11-01): solo, playable, no enemies; see "Still to do"
Module: `flood` (a game mode; the code keeps the issue's name). Issue #70. Builds on `journey` (the map layout), `fog-of-war`, `raiders` (painted paths) and `build-zone`.
Last updated: 2026-11-01

## Objective

A solo mode about keeping moving. You have no keep of your own. Your **king** starts on the far left edge and has to walk home, a keep on a raised mountain on the right edge. Behind him, lava comes in from the left in waves. Each wave runs fast across a stretch of land and takes everything on it, then there's a calm. Each wave is bigger than the last, and each calm is shorter. Ahead of the king, the land rises as he comes. You can't dig in. You paint the king's way forward, bridge what's in the way, and use each calm to get ahead of the next wave.

**Player-facing outcome:** pick Solo, then No looking back. The map opens on the king (`♚`, in your colour) at the left edge. Darkness lies a few tiles past what he can see, and home's mountain shows through it far off on the right. The land behind him glows orange and the HUD counts down to the first wave. You press H and drag a line of dots to the right, and he walks it while the land rises out of the dark ahead of him. The wave runs in behind him, faster than he walks, and stops short. The glow moves on to the next stretch. You paint on.

## Rules

**The map**

- Generated as for Journey home. The king starts where the camp would, and home (a `KEEP_SIZE` keep, not one you defend: it has no HP and isn't in `state.keeps`) is where Journey home's keep would be. Map generation's connectivity check means every walkable tile can reach home without bridges (rivers have fords), so there's always a way home. Bridges are a shortcut. There's no spawn strip, no starter walls, no Endless waves and no enemies. Hand-made maps can't be No looking back maps yet.
- The whole map is generated from the seed at the start. Land "rising" shows what was always there, so the game is deterministic.

**The mountain**

- Rings of tiles out to `mountainRadius` (4) round home's keep, each a step higher toward the keep, with the keep on top. It's cleared to open ground (no rock, trees, ruins or chests) and explored from the start.
- Lava never covers it, so the king, units and route on it are safe. Nothing can be built on it ("Nothing can be built on the mountain").

**The king**

- Not a keep and not a unit: he has no HP and nothing attacks him. He's `state.flood.king`, a tile, plus `progress` toward the next one.
- He sees `FLOOD.kingSight` (7 tiles clearly, 10 dimly) from wherever he stands. What he sees is explored.
- He walks at `kingSpeed` (1.5 tiles a second) when there's route to walk. If not, he stands still.

**The route** (`paintRoute {x, y, erase?}`)

- A list of tiles, in the order they were painted, at most `maxRouteTiles` (300). Painting is refused off the map, on land that hasn't risen, where you've never seen, and on lava. Painting a tile that's already painted does nothing (it keeps its place in the order). `erase` removes a tile.
- As with raiders' paths: each step, the king takes the shortest way, over painted tiles he can step on, from where he stands to the tile painted last that he can reach that way. He can step on walkable terrain or a bridge with nothing blocking it, on land that has risen. Each tile he steps on is used up.
- Painting over something he can't step on (a river, a ruin, a tree) is allowed. He walks as far as he can and waits there until the way is clear (a bridge built, the tree cleared), or until the route is repainted round it.
- Input: the Route tool (H, the key Journey home uses for Move camp). Click and drag to paint. A drag that starts on a painted tile rubs out instead.
- Drawn as Journey home draws the camp's way: a dot in the player's colour on each tile, with the last one outlined. Both, and the king, are lifted onto the mountain's tops.

**The lava**

- `front`, in tiles from the left edge. It comes in waves. The first comes after `graceSeconds` (20). A wave runs `surgeTiles` further at `surgeSpeed` (4 tiles a second): 14 tiles for the first, 3 more for each wave after, up to 36. Then comes a calm of `calmSeconds`: 18 s after the first wave, 1 s less after each one, down to 8 s.
- Each column the front fully passes turns to lava (terrain `lava`: impassable, unbuildable), except the mountain. Every structure on it is removed, units on it die, and route tiles on it go.
- The land the coming wave will take (from the front to where that wave will stop) glows. During a calm it glows more strongly, and pulses faster, as the wave nears. While a wave is coming in, it glows at full strength.
- If the king's tile turns to lava, the game is lost.
- HUD: "Lava: wave N in Ss" or "wave N coming in!", how many tiles behind the king it is ("Safe on the mountain" once he's on it), and how far home he is.

**The land ahead**

- Columns from `risen` onward haven't risen. `risen` is the king's column plus `riseAhead` (9), plus 1, and it only ever grows. Unrisen land is drawn as a dark void over the fog, with the mountain showing through. It can't be painted or built on, and the king can't step on it.

**Building**

- Only within `buildRadius` (6) tiles of the king, in any direction ("Too far from the king"), and only on risen land ("That land hasn't risen yet"). Everything else is as in Endless. Build time is measured from the king instead of a keep.

**Winning**

- The king on, or next to, any tile of home's keep wins.

## Balance

The numbers above are first guesses, checked with a scripted king that repaints the shortest known way toward home every second and bridges rivers. It never needed a bridge: it walked to the fords. It wins every S and M map tried (5 seeds each), with the lava 20-50 tiles behind at the end. It wins 4 of 5 L maps, where the margin is about 17 tiles. A player who stops to plan, build and back out of dead ends should feel the lava. Ticks average 0.1 ms, worst under 2 ms.

## Still to do

- **Enemies on** (the issue's option): Journey home's swarms, which would need a target that isn't a keep (the king), and the king given HP.
- Endless (score on distance) and PvP variants from the issue. Endless needs real generation ahead, not a pre-made map. Online play needs the same, seeded.
- Lava that changes direction, or follows the king.
- A HUD button and a pad binding for the Route tool (keyboard H only).
- The 3D view: the king, the mountain, the void and the glow aren't drawn there, and new land doesn't rise.
- With the view turned (Q), the build ghost's "not risen yet" check uses the turned column.
- `lava` is listed in the map editor's terrain, like every terrain; it does nothing special there.
