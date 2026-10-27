# Spec: long-shadows

Status: APPROVED (2026-10-27)
Last updated: 2026-10-27 (built: heights cached per frame; drawing timed faster than before)
Module: `long-shadows`, on the capability map's Day and night section. Builds on `day-night` ([`SPEC-day-night.md`](SPEC-day-night.md)).

## Objective

Long shadows as the sun comes up and as it goes down. Today no shadow is longer than 1.25 times its block's height, which keeps every shadow within a tile, so at dawn and dusk shadows hit that cap and stop growing. This lets them reach about 2 tiles, and makes the sun's arc shallower at sunrise and sunset so they stay long for longer.

1. As a player watching a played day (Debug > Day/night), shadows stretch out long at dawn, shorten towards noon, and stretch out long again through the evening.
2. Nothing else changes: noon looks the same, and the default sun (no clock) looks as it does now.

## Rules

- `SUN.maxLength` goes from 1.25 to 2.5: the tallest block (15px) casts at most 37.5px, under 2 tiles (40px).
- A block's shadow can now fall on lower blocks up to 2 tiles away, so neighbour shading checks the 24 tiles within 2 (it checked the 8 within 1). The shading rules are the same: tops and front faces, never a block as tall as the caster or taller.
- The ground-shadow pass starts 2 tiles beyond the view on every side, so long shadows from just off screen still show.
- The day's arc gets shallower at the ends: `DAY_NIGHT.arcAtSunrise` 20° to 10°, `arcAtSunset` 160° to 170°. Noon stays 90°.
- All numbers stay in `SUN` and `DAY_NIGHT` (`src/render/palette.ts`).

## Out of scope

- Shadows longer than 2 tiles, soft or blurred shadows, shadows from units and enemies.
- The gaps on front faces shaded by the block in front (known, from `day-night`).

## Data and code

- `src/render/sun.ts`: `CASTERS` becomes every offset within 2 tiles (24), worked out once. `castShade` is unchanged (its clipping already works at any distance).
- `src/render/canvas.ts`: the ground pass margin goes from 1 tile to 2 (one constant, `SHADOW_REACH_TILES`, from `SUN`). Block heights are worked out once per frame for the view plus the margin, not looked up 24 times per block.
- `src/render/palette.ts`: `SUN.maxLength`, `DAY_NIGHT.arcAtSunrise`, `arcAtSunset`.

## Testing

- Unit tests (`tests/render/sun.test.ts`): the tallest block's shadow stays under 2 tiles; `CASTERS` covers the 24 offsets; a block 2 tiles away shades a lower one when the shadow is long enough, and not when it's short.
- Performance: an XL map covered in walls and towers, zoomed out, draws a frame within today's time plus at most 2ms (measured in the browser before and after).
- Browser, by hand: play a day; dawn and dusk shadows reach about 2 tiles and join their blocks.

## Success criteria

- [ ] Dawn and dusk shadows reach about 2 tiles; noon and the default sun look as before. (By hand: still to check.)
- [x] Long shadows shade lower blocks up to 2 tiles away, never taller ones.
- [x] Drawing an XL map stays within 2ms of today's frame time.
- [x] Unit tests, the typecheck and the build pass.

## Open questions

None.
