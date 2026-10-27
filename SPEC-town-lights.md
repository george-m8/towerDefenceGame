# Spec: town-lights

Status: APPROVED (2026-10-27)
Module: `town-lights`, on the capability map's Day and night section. Builds on `day-night` (the night wash) and `game-clock`.

## Objective

At night, your town glows. Today night is one even dark wash over the whole map. With this, everything you've built gives off light, and so (a little) do your units, so the town and its walls stand out against the dark land beyond, where the enemies come from.

1. As a player at night, my keep is a pool of light, towers and buildings glow round them, and walls show as a thin lit line.
2. My units carry a little light as they move. Scouts don't: they stay dark, out in the night.
3. Enemies and the open land stay dark.
4. By day nothing changes.

## Rules

**What gives light**
- Every structure that's been built (not one still being built) gives light, whoever owns it. Ruins don't.
- Each kind has a radius in tiles and a strength (how much of the darkness it lifts, up to 1). To start with:

| Source | Radius (tiles) | Strength |
|---|---|---|
| Keep | 6 | 0.9 |
| Towers (archer, cannon, catapult, watchtower) | 3 | 0.8 |
| Houses, farms, shops, yards, mines, halls and the other buildings | 2.5 | 0.7 |
| Walls, gates, spikes, bridges | 1.5 | 0.5 |
| Units (except scouts) | 1 | 0.35 |
| Scouts, enemies | none | |

- A tile's light is the brightest of the lights reaching it, fading from full strength at the source to nothing at its radius (smoothly, not in rings). Lights don't add up past the brightest one, so a dense town isn't brighter than its keep.
- Light lifts the night: a tile with light L is drawn with `darkness x (1 - L)`. A faint warm tint goes over lit ground, strongest at the brightest.
- The light map is worked out at one value per tile and drawn smoothed across the map, so pools of light have soft edges (unlike fog, which keeps hard tile edges).
- Every number (radii, strengths, the tint) is in a `LIGHTS` table in `src/render/palette.ts`, by structure kind, with one entry for units and none for scouts.

**When**
- Only while it's dark (`darknessAt(hour) > 0`): in the evening the lights come up as the light fades, and go at dawn. By day no light map is worked out.
- With fog of war, lights are drawn wherever their sources are (your own buildings are always on explored land).

## Out of scope

- Lights that flicker, change colour or cast shadows; light from projectiles, fires or explosions.
- Light changing what you can see (fog and sight are unchanged) or anything in the game.
- Lights you can turn on and off, or that cost anything.

## Data and code

- `src/render/lights.ts` (new, pure): `lightSources(state)` (from structures and units, using `LIGHTS`) and `lightMap(sources, region)` (a value per tile, the brightest within reach, smooth falloff).
- `src/render/palette.ts`: `LIGHTS`.
- `src/render/canvas.ts`: `drawNight` draws the darkness through the light map: a small canvas, one pixel per tile for the view plus the largest radius, its alpha `darkness x (1 - light)`, drawn scaled and smoothed over the map; then the warm tint the same way.

## Testing

- Unit tests (`tests/render/lights.test.ts`): built structures and units give light, by kind; scouts, enemies, ruins and buildings still being built don't; a tile's light is the brightest reaching it and fades to nothing at the radius; lights don't add past the brightest.
- Performance: the benchmark script (as for `long-shadows`) at midnight on an XL map full of walls: within 2ms a frame of the night without lights.
- Browser, by hand: a night game; the keep, towers, buildings and walls glow, units carry a little light, scouts don't, and lights come up at dusk and go at dawn.

## Success criteria

- [ ] At night, built structures and units (not scouts) light the darkness round them, by kind; enemies and open land stay dark.
- [ ] Lights fade smoothly to their radius and come up and go with the darkness; by day nothing changes.
- [ ] Night drawing on an XL map stays within 2ms a frame of today's.
- [ ] Unit tests, the typecheck and the build pass.

## Open questions

None. Settled 2026-10-27: soft pools of light, as drafted (blocky is a one-line change if it looks wrong in play).
