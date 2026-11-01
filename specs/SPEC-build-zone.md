# Spec: build-zone

Status: POSTPONED (2026-10-27): ideas only. The part about long build times far from the keep has moved to the rebalance ([`tasks/roadmap.md`](tasks/roadmap.md)); revisit this module if that isn't enough to stop outpost cheese.
Module: `build-zone`. Would build on `enclosures` ([`SPEC-enclosures.md`](SPEC-enclosures.md)) and `fog-of-war` ([`SPEC-fog-of-war.md`](SPEC-fog-of-war.md)).
Last updated: 2026-10-27

## Objective

Players can only build near land they control, so they can't put up towers anywhere on the map at once. A setup option, off by default.

## Ideas so far

- **Setup option:** **Build: anywhere / near your land**, with a distance (for example 5, 10 or 15 tiles).
- **The zone:** the keep enclosure (the warm yellow shade from `enclosures`) plus a skirt of N tiles round it. The skirt is large enough that outposts still make sense.
- **Watchtowers** can be built on any explored tile, so they're how you reach further out.
- **Shown** as the yellow shade plus an outline for the skirt; building outside it is refused ("Too far from your land").
- `getEnclosures` is cached by `gridVersion` and computed on the client too, so the zone needs no protocol change.

## Why it's postponed

George (2026-10-27): watchtowers and outposts are already a little odd, and build time already grows with distance from the keep (`BUILD_TIME`). Making building near the keep very fast and far away very slow may solve the same problem: a far outpost takes so long that it's likely destroyed before it's finished. That curve is now part of the rebalance.

## Open questions (for when it comes back)

1. When a wall breaks and the keep enclosure is lost, does the zone shrink to a ring round the keep, or keep the last zone that held?
2. Does a walled outpost become new land (its own zone)?
3. Co-op: one shared zone, or one per player? PvP: each player's own keep.
4. Do watchtowers grant a small zone round themselves?
