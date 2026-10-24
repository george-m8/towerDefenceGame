# Spec: enclosures

Status: APPROVED (2026-10-25)
Builds on `tile-layers`, `map-gen` and `players`. Not on the capability map yet: one self-contained capability.
Last updated: 2026-10-25

## Objective

Reward walling in. Once walls (with any other impassable things) fully close off an area, that area is claimed: it's shaded on the map, and building inside it is cheaper. Closing off the keep is worth the most.

### User stories

1. As a player, when I close a ring of walls, the area inside and the walls around it change shade, so I can see I've claimed it.
2. As a player, anything I build inside the walls around my keep costs 50% less.
3. As a player, anything I build inside any other closed-off area costs 25% less.
4. As a player, I can use the coast, a river, rocks, trees or the map edge as part of my walls.
5. As a player, the build preview and hover info tell me the discounted price before I build.
6. As a player in co-op, I get the discount in any enclosed area, whoever built its walls.

## Rules

**What's enclosed**
- An open tile (walkable, with nothing blocking on it) is **enclosed** when enemies can't walk to it from the spawn zone. Walls, every other blocking structure (towers on the ground, houses, wall spikes, ruins), impassable terrain (sea, river, rock, trees) and the map edge all count as closing it off. Floor spikes and bridges don't block.
- Enclosed open tiles form **areas**: groups of enclosed tiles connected through their edges.
- An area that touches the keep (any tile next to a keep tile) is a **keep enclosure**. It doesn't matter whether the walls go right round the keep or use the keep as part of the loop. Every other area is an **outer enclosure**.
- An area only counts once **something a player built** (anything but a ruin) is part of its wall. Ruins and terrain can box in small pockets on a fresh map, so a new map starts with no enclosures. Closing a ruin box with one wall claims it. *(Added during the build: a check found 89 ruin-boxed tiles on a fresh map.)*
- The walls themselves, and anything blocking or impassable next to an enclosed area, are its **boundary**. A boundary tile takes the discount of the best area it touches.

**Discount**
- Building on a tile inside a keep enclosure, or on its boundary, costs 50% less. Inside or on the boundary of an outer enclosure, 25% less. That includes towers mounted on boundary walls and bridges over an enclosed river. Everything else pays full price.
- Prices are rounded to the nearest whole gold and never go below 1. For example, a wall (5) costs 3 with 50% off and 4 with 25% off.
- The discount is worked out when you build: whatever closed the area must already be standing. The wall that completes a ring pays full price.
- **Co-op:** any player building in an enclosed area gets its discount. Enclosures aren't owned by anyone.

**Selling**
- Each structure remembers what was paid for it. Refunds are 50% of the price actually paid (and less if damaged), so buying cheap and selling dear isn't possible. Ruin salvage and tree clearing are unchanged.

**Losing an enclosure**
- If a wall is sold or destroyed and enemies can reach the area again, it stops being enclosed: the shading goes, and new builds pay full price. Structures already built keep their recorded price.

**Showing it**
- Enclosed tiles get a translucent shade: warm gold for a keep enclosure, a cooler tint for outer ones. Boundary walls get the same tint over their usual colour, so the claimed walls stand out.
- Hover info on an enclosed tile adds "Inside the keep's walls: builds 50% off" (or "Enclosed: builds 25% off").
- The build preview's info line shows the price you'll pay there, e.g. "Wall 3g (50% off)". The minimap shows the shading too.

## Out of scope

- Gates (walls players walk through but enemies don't), owned territory, different discounts per structure type, discounts on upkeep or income.
- Enemies deliberately targeting enclosures.

## Data and code

- `src/sim/enclosures.ts`: `getEnclosures(state)` returns a discount (0, 0.25 or 0.5) and an area kind for every tile. It's cached by `gridVersion`, like the flow field: a flood fill from the spawn, then grouping the enclosed tiles into areas and marking those that touch the keep. Also `priceAt(state, kind, x, y)`.
- `Structure.paid` records the price paid; `refundFor` uses it (falling back to the full cost for structures from before this change).
- `canBuild` checks the player can afford `priceAt`; `applyCommand` charges it.
- The renderer, minimap, hover info and build preview read `getEnclosures` on the client's own state. The client works it out itself from the map it already has, so there are **no protocol changes**.

## Testing strategy

Vitest, on blank maps with hand-built walls:
- Open map: nothing enclosed, full price everywhere.
- A ring of walls away from the keep: the inside is 25% off and so are its walls. A ring around the keep: 50%. Walls from the keep's side closing a pocket: 50%.
- A wall line against the map edge, and one against painted rock or river: enclosed.
- Applying a build charges the discounted price, and selling refunds half of what was paid.
- A tower mounted on a boundary wall gets the discount. A bridge over an enclosed river gets it.
- Selling a ring wall re-opens the area and full price returns.
- Co-op: player 2 gets the discount inside player 1's walls.
- Performance: working it out on a 153×102 map takes a few milliseconds.

## Boundaries

- **Always:** keep `src/sim/` deterministic; work the enclosures out from the grid only, so server and client agree.
- **Ask first:** different discount percentages, or making enclosures owned.
- **Never:** let a refund exceed the price paid.

## Success criteria

1. Closing a ring of walls shades the area and its walls. The keep's enclosure is shaded differently from the others.
2. Builds inside or on the boundary cost 50% (keep) or 25% (other) less. The preview and hover info show the price.
3. Natural barriers and the map edge can close an enclosure.
4. Refunds are based on the price paid.
5. Opening the walls removes the discount.
6. `npm run typecheck`, `npm test`, `npm run coverage` and `npm run build` pass.

## Resolved decisions

1. Anything impassable closes an enclosure, including terrain and the map edge.
2. Enclosures are shared in co-op: anyone building inside gets the discount, and the shade is neutral.
3. Refunds are based on the price paid.
4. The discount applies inside and on the boundary (towers on the walls included).

5. **Rounding:** nearest whole gold, never below 1.
6. **The keep itself:** if enemies can't reach the keep (and a built structure is part of what blocks it), it counts as enclosed. Structures touching it are its boundary (50%), so a ring hugging the keep makes those walls, and towers on them, half price.

## Open questions

None.
