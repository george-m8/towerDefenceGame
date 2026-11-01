# Spec: fog of war

Status: APPROVED (2026-10-25)
Builds on `tile-layers`, `map-gen`, `players`, `net-client` and `enclosures`. Not on the capability map yet: one self-contained capability.
Last updated: 2026-10-25 (v1.2 - fog raised in layers, like the raised blocks)

## Objective

Make the map something you push out into. You start seeing only the ground around your keep. Everything you build lets you see further. Close to your buildings you see everything, including enemies. Further out you see the land but not what's moving on it. Beyond that the map is covered in white fog until you've seen it, though you can just make out the land at its edge.

### User stories

1. As a player, at the start I see the land around my keep. The rest of the map is covered in white fog, apart from the enemy spawn strip.
2. As a player, building something lets me see the area around it, so I can explore by building outward. Different buildings see different distances: the keep furthest, then towers (along their firing arc), with walls seeing least.
3. As a player, I can build a watchtower that sees all round as far as a cannon fires, to scout without building a weapon.
4. As a player, I can only build on land I've seen.
5. As a player, I only see enemies close to my buildings. Further out I can see the land but not the enemies on it, so I can't watch a wave coming the whole way.
6. As a player, once I've seen an area it stays on my map, even after I sell what revealed it.
7. As a player in co-op, I see everything my teammates see and can build there too.

## Rules

**Three tiers**

Every tile is in one of three tiers:

| Tier | When | What you see | Build? |
|---|---|---|---|
| **In sight** | Within the inner sight radius of the keep or any structure you built | Everything: terrain, structures, chests, enemies, shots | Yes |
| **Seen** | Within the outer sight radius of anything, or seen at some point before | Terrain, structures and chests, under a thin white mist. No enemies or shots. | Yes |
| **Unexplored** | Never seen | Nothing (solid white), except the 2 tiles next to explored land, which are see-through. No enemies or shots. | No |

- "In sight" is live: it's worked out from what's standing now. If a structure is sold or destroyed, the area around it drops from in sight to seen.
- "Seen" is remembered: once a tile has been seen it stays seen for the rest of the game. A tile never goes back to unexplored.
- The enemy spawn strip starts seen. You know where enemies come from, but you don't see them there.

**What gives sight**

Each kind of building has its own sight region: an inner radius (in sight) and an outer radius (seen). The keep sees furthest, towers come next, and walls see least. Distances are measured centre to centre, like tower range. A structure sees from its own tile; the keep sees from its nearest tile.

| Source | In sight (inner) | Seen (outer) | Shape |
|---|---|---|---|
| Keep | 12 | 18 | all round |
| Catapult | 10 (range + 1) | 14 | all round |
| Archer | 6 (range + 1) | 10 | its 90° arc |
| Cannon | 5 (range + 1) | 9 | all round |
| **Watchtower** (new) | 5 | 9 | all round |
| House | 3 | 6 | all round |
| Floor spikes, wall spikes, bridge | 2 | 4 | all round |
| Wall | 1 | 1.5 | all round |
| Ruin | none | none | |

- **Towers see along their arc.** A tower's sight region has the same shape as its field of fire, so an archer sees a 90° wedge in the direction it faces. Cannons and catapults turn to fire all round, so they see all round. Every tower also sees the tiles right next to it (1.5 tiles, all round), so you can see what's attacking it from behind.
- A tower's inner sight always covers its range, so you see every enemy it can shoot at.
- A wall's inner 1 covers the 4 tiles beside it (where enemies stand to attack it), so you see what's attacking your walls even out on the edge. Its outer 1.5 adds the diagonals. Walls barely reveal anything, so painting walls is no way to explore: that's what watchtowers are for.
- Where regions overlap, a tile takes the best tier any of them gives. A tower on a wall adds its region to the wall's.
- All numbers and shapes live in `src/sim/config.ts` and are expected to be tuned in play.

**Watchtower**
- A new structure that only gives sight. It doesn't attack.
- It sees all round, as far as a cannon (5 in sight, 9 seen).
- It's a mount, like the other towers: it stands on open ground (where it blocks movement) or on top of a wall, and falls if its wall is destroyed. It can't go on spikes, houses, the keep or the spawn zone.
- Cost 20, 30 HP. Key `9`, glyph `T`. It has no facing, so `R` does nothing while placing it.
- Hover shows its sight region, the way a tower shows its arc.

**Building and selling**
- You can build on a tile that's in sight or seen. Unexplored tiles can't be built on ("Can't build on unexplored land").
- Selling and tree clearing follow the same rule, so you can't clear trees or salvage ruins in unexplored land. (Everything you built is on seen land anyway.)
- Everything else about building is unchanged: price, enclosure discounts, layers, gold.

**Enemies**
- Enemies behave exactly as before. They move, wander, attack and reach the keep whether or not anyone can see them. Fog is only about what players see and where they can build.
- An enemy is drawn only while the tile it's on (rounded to the nearest tile) is in sight. That goes for the main map, the minimap and hover info.
- Shot and splash effects are drawn only when the tile they land on is in sight.
- Sound cues are unchanged.

**Co-op**
- Sight is shared. Everyone sees what any player's structures see, and anyone can build on any seen tile.

**Showing it**
- In sight: drawn as now.
- The fog is a white mist drawn over everything else (`FOG` in `src/render/palette.ts`).
- Seen: a thin mist (30% opacity), so terrain, structures and enclosure shading all show, a little washed out.
- Unexplored: solid white, except along its edge, so you can just see beyond what you've explored. Unexplored tiles next to explored land (counting diagonals) are 50% opaque, the ring after that 80%, and everything further out 100%.
- Every tile has one flat opacity. Tile edges are hard (no smoothing), to fit the grid look.
- The fog is raised like the raised blocks: each tile's fog top is lifted by its height, with a darker grey front face where it's higher than the fog (or clear land) in front of it. Seen fog is very low (2px), each edge band a little higher (5px, then 9px), and unexplored fog highest (14px, above the tallest block, so nothing pokes through). So the fog reads as layers stepping up into the unexplored land. It casts no shadow.
- Like the ground, the fog is a checker of two colours: white and a very light grey.
- The band widths, every opacity and height, and the fog colours are all in `FOG` (`src/render/palette.ts`), to tune in play.
- The minimap uses the same three tiers, mixed with white (seen 30%, unexplored solid), and only shows enemy dots that are in sight.
- Hover info on an unexplored tile says "Unexplored". On a seen tile it shows terrain and structures as usual, plus "Out of sight: enemies here aren't shown".
- The build preview on an unexplored tile shows as not allowed, with the reason in the info line.

## Out of scope

- Line-of-sight blocking (walls, trees or rocks blocking sight). Sight is a plain radius. That belongs with `line-of-sight`.
- Scouting units, or sight-only structures other than the watchtower.
- Sight that turns with a cannon's or catapult's aim. They see all round.
- Enemies that hide or have their own sight.
- Per-player fog, or fog as an option in the lobby.
- Hiding enemy data from clients over the network. Co-op has no reason to cheat, so the server keeps sending every enemy and the client decides what to draw.

## Data and code

- `src/sim/config.ts`:
  - `sight?: { inner, outer }` on `StructureStats`, set on every buildable kind (none on ruins). The shape comes from the tower's `arcDegrees` and facing; non-towers see all round. `KEEP_SIGHT` for the keep, and `SIGHT_CLOSE_RADIUS` (1.5) for the all-round ring every tower gets.
  - A `watchtower` row: `layer: "mount"`, cost 20, 30 HP, blocks movement, no `tower` stats (so it never fires), `sight: { inner: 5, outer: 9 }`.
- `src/sim/fog.ts`:
  - `sightRegion(structure)` lists the tiles a structure sees, inner and outer, using its radii and arc. The tower-arc check reuses the angle maths in `aiming.ts`.
  - `getSight(state)` returns the tier of every tile (`UNEXPLORED`, `SEEN`, `IN_SIGHT`). The live part (the regions of the keep and every built structure) is cached by `gridVersion`, like enclosures. It's then combined with `state.explored`.
  - `tierAt(state, x, y)`, `canSeeEnemiesAt(state, x, y)` and `isExplored(state, x, y)`.
  - `reveal(state, structure)` marks the structure's outer region as explored.
- Watchtower in the UI: the `9` tool and button, glyph `T`, hover and preview showing its sight region (the renderer gets a sight-region overlay that works for any structure). README structures table and controls updated.
- Mount rules: the "is this a tower" checks in placement and selling go by `layer === "mount"`, so a watchtower follows them without a `tower` block. Anything that assumes every mount has `tower` stats (targeting, aiming, the arc overlay) skips mounts without them.
- `GameState.explored: number[]` (1 = seen, 0 = unexplored). It's stored as numbers rather than booleans to keep it small over the wire. It's part of the state because it depends on history (what used to stand there), which can't be worked out from the grid.
  - `createGame` marks the keep's outer disc and the spawn strip.
  - `placeStructure` calls `reveal` for any player-built structure, so building reveals the land. Ruins placed by the map generator reveal nothing.
- `GameOptions.fog` (default `true`) and `GameState.fog: boolean`. With fog off, every tile is in sight. The shared test helpers turn it off, so existing tests that build anywhere on the map keep working, and fog tests turn it on.
- Dev switch: a `?fog=off` URL flag creates the game with fog off. It works in solo play. Online, the host's flag is sent with the start-game request and applies to the whole room. It's for testing, not a lobby option, and isn't shown in the UI.
- `canBuild` and `sellStructure` reject unexplored tiles.
- Network: `explored` and `fog` go in the welcome snapshot (`ClientState`). `explored` is also sent in a `StateUpdate` whenever the grid changes, alongside terrain, base and mount. `applyUpdate` copies it into the view.
- Renderer, minimap and hover info read `getSight` on the client's own state, and filter `state.enemies` and `state.effects` through `canSeeEnemiesAt`.

## Testing strategy

Vitest, on blank maps with fog on:
- A new game: the tiles around the keep are in sight, a wider ring around them is seen, the spawn strip is seen, and the far corners are unexplored.
- Each kind's region matches the table: the keep's is the largest, a wall's the smallest. Building a wall at the edge of the seen area reveals only its 8 neighbours, with the 4 beside it in sight.
- An archer facing east sees a 90° wedge to the east, plus the ring right around it, and nothing 3 tiles to its west. A cannon and a catapult see all round. Every tower's in-sight radius covers its range.
- A watchtower sees all round to 5 (in sight) and 9 (seen), never fires, can be placed on a wall or open ground, and falls with its wall.
- Building on an unexplored tile is refused with the reason, and charges no gold. Selling or clearing a tree there is refused too.
- Selling a structure drops its area from in sight to seen, never to unexplored.
- Ruins from the map generator reveal nothing.
- Co-op: player 2 can build on land only player 1's structures revealed.
- `canSeeEnemiesAt` is true only for in-sight tiles. The renderer helpers drop enemies and effects on seen and unexplored tiles.
- Network: `explored` survives a round trip through `toClientState` / `fromClientState`, and a build sends it in the next update.
- Fog off: every tile is in sight, and existing behaviour is unchanged.
- Performance: working out sight on a 153×102 map with a few thousand structures takes a few milliseconds.

## Boundaries

- **Always:** keep `src/sim/` deterministic. Explored land only grows, and only through `placeStructure` and `createGame`, so the server and clients agree.
- **Ask first:** changing what gives sight, adding a lobby toggle for fog, or hiding enemies from clients on the server.
- **Never:** let fog change how enemies move, fight or pathfind.

## Success criteria

1. A new game shows the area around the keep, a lightly misted ring of seen land, the spawn strip, and white fog everywhere else, with see-through steps at its edge.
2. Building reveals the land around it. The keep sees furthest, then towers (archers along their arc), with walls seeing least. A watchtower sees all round as far as a cannon.
3. Building on unexplored land is refused, and the preview and hover info say why.
4. Enemies are only drawn (main map, minimap, hover) on in-sight tiles.
5. Seen land stays seen after the structure that revealed it is sold.
6. Co-op players share sight.
7. `npm run typecheck`, `npm test`, `npm run coverage` and `npm run build` pass.

## Resolved decisions

1. Sight comes from the keep and everything players build, with a region per kind: the keep's is the largest, towers' next (in the shape of their firing arc), walls' the smallest. Ruins see nothing.
2. Beyond sight the map is white fog until seen, with see-through steps at its edge. Seen land is remembered for the rest of the game.
3. Sight is shared in co-op.
4. The spawn strip starts seen: visible, but enemies there aren't shown.
5. You can build on seen land as well as land in sight.
6. A watchtower is added: sight only, all round, as far as a cannon.
7. Walls see very little (1 in sight, 1.5 seen), so exploring needs watchtowers or towers.
8. The start is more open: the keep sees 12 in sight and 18 seen.
9. A `?fog=off` URL flag turns fog off for testing.

## Open questions

1. **"As far as cannons."** I've read this as the cannon's sight (5 in sight, 9 seen), which covers its range of 4. If you meant it should see as far as a cannon *shoots* (4), or as far as the furthest tower (the catapult), say so.
2. **Watchtower details.** Cost 20, 30 HP, key `9`, glyph `T`, mountable on walls. Change any of them.
3. **The other numbers** in the sight table are a first guess, to tune in play.
