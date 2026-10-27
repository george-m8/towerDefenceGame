# Spec: moats

Status: POSTPONED (2026-10-27): ideas only. Not on the build order yet; see [`tasks/roadmap.md`](tasks/roadmap.md). Write the full spec (data model, tests, success criteria) when it comes up.
Module: `moats`. Would build on `enemy-pathing` ([`SPEC-enemy-pathing.md`](SPEC-enemy-pathing.md)), `enclosures` ([`SPEC-enclosures.md`](SPEC-enclosures.md)) and `map-editor` ([`SPEC-map-editor.md`](SPEC-map-editor.md)).
Last updated: 2026-10-27

## Objective

Players dig moats round their walls: water that land enemies can't cross, so they bunch up in front of the walls (and the towers). Moats give marines a reason to exist and give dwarves something to do.

## Ideas so far

- **Digging:** a moat is a structure or terrain change built on open ground next to (or anywhere near) walls. Probably slow to dig and expensive, and it can't be undone cheaply.
- **Marines** swim across moats (as they swim rivers today, `MARINE_COSTS`), but they can't break walls, so a moat plus a wall still stops them.
- **Dwarf bridge-builders:** a dwarf kind that builds a bridge across a moat tile when its route is blocked by one. A counter, and a dwarvish thing to do.
- **Bomber craters:** a bomber's blast on open ground leaves a crater that becomes moat (optional, last).
- **Drawbridge:** a gate over a moat. George has further ideas for it; later.

## The design risk to solve first

Walls can be broken; a moat can't. A moat ring round the keep would seal it off for good, which breaks the rule that enemies always have a way in. A moat would also close enclosures (discounts) for almost nothing. Options to choose between:

1. **Land walkers wade** through moat slowly (high field cost, slowed while in it). Never a total seal. Proposed.
2. **Diggers or bridge-builders** fill or bridge moats, so a seal is temporary.
3. **A moat can never complete a ring:** building one that would cut every land route is refused.

## Touches

- Flow fields: a moat cost per movement profile.
- Enclosures: whether a moat closes a ring.
- The map editor's terrain brush and the `.map` format (a `moat` terrain or structure).
- Line of sight: moats never block.
- The balance file: dig cost, dig time, wade cost and slow.

## Open questions

1. Structure (owned, sellable) or terrain (permanent)?
2. Which of the three options above, or a mix?
3. Do workers dig, or is it instant like other building (with build time by distance)?
4. Does a moat next to a wall make the wall harder to attack (enemies must stand in water)?
