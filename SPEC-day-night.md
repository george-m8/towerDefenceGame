# Spec: day-night

Status: APPROVED (2026-10-26)
Module: `day-night`. This spec covers **step 1, the sun angle**: shadows follow a sun that crosses the sky, set by a slider switched on from the Debug menu. Later steps (an automatic cycle, night darkness, lights) get their own sections once this one is built. Builds on the raised blocks and their shadows in `src/render/canvas.ts`. Not on the capability map yet.
Last updated: 2026-10-26 (v1.0 - default shadow mostly sideways; slider in the editor too)

## Objective

Today every block (walls, towers, trees, rocks, the keep) casts a fixed shadow. It falls to the right, as if the sun were low and to the top-left of the screen, and it shades lower blocks beside it (a tower on a wall shades the wall to its right). We want days and nights. The first step is a sun that moves: one value, the time of day, sets where the sun is, and every shadow follows it.

The sun travels in an arc across the top of the screen:

| Time | Sun | Shadows |
|---|---|---|
| Sunrise | low, right | long, falling left |
| Noon | high, top-middle | short, falling straight down |
| Sunset | low, left | long, falling right |

In between, shadows lean toward the camera, so they show on the ground in front of blocks and on the front faces of lower blocks. They never point up the screen.

### User stories

1. As a developer, I can turn on a sun slider from the Debug menu (top left of the map, or `` ` ``).
2. As a developer, dragging the slider from sunrise to sunset moves every shadow smoothly, as if the sun were passing overhead.
3. As a developer, when the slider is off, the game looks much as it does today: late-afternoon shadows going sideways to the right.
4. As a player, nothing changes in this step unless I turn the slider on in the Debug menu. The sim and network don't change.

## Rules

**The sun**
- The time of day is one number, `sun`, from 0 (sunrise) through 0.5 (noon) to 1 (sunset). It isn't game state. It lives in the renderer only and is never sent over the network.
- `sun` sets two things:
  - **Direction.** The shadow's direction sweeps from left (sunrise) through straight down (noon) to right (sunset). The sweep stays in the lower half: a shadow never points up the screen.
  - **Length.** Shadows are longest at sunrise and sunset and shortest at noon. A shadow's length is the caster's height times a factor that follows the sun's elevation.
- A shadow is never longer than one tile (20px), even from the tallest block (15px) at sunrise. So a block only ever shades the tiles next to it, and we never have to look further than one tile away.
- The default `sun` is late afternoon (about 0.9). Its shadows go mostly sideways to the right, with only a slight lean down, and are about as long as today's (half the caster's height). It doesn't need to match today pixel for pixel.
- Every number (the direction sweep, the shortest and longest factor, the default) goes in one `SUN` table in `src/render/palette.ts`, to tune by eye.

**What casts and receives shadows**
- Only raised blocks cast shadows, as now. Units, enemies, fog and textures don't.
- A block's shadow on the **ground** is its footprint, moved by the shadow offset. Where it falls past the block's front face, it now shows on the ground in front of the block. (Today the offset is sideways only.)
- A block's shadow on a **lower block next to it** shades that block's front face and top, in proportion to the height difference. This is today's left-neighbour rule, extended to whichever neighbours the shadow reaches: left or right, the block in front (the row below), and the diagonal between them.
- A block never shades a block that's as tall as it or taller.
- The shadow colour (`SHADOW`, 30% black) doesn't change with the sun in this step.

**The slider**
- A new row in the existing **Debug** menu (`src/ui/mapButtons.ts`, opened from its button or `` ` ``): **Sun slider**, off by default. It works like **Show paths**: a flag on `UiState`.
- When it's on, a slider floats over the map, labelled with the time of day (e.g. "Sun 0.80"). It runs from sunrise to sunset and moves shadows live as you drag it, even when the game is paused.
- Turning the row off hides the slider and puts the sun back to the default.
- The switch and the slider position aren't saved. A reload starts with the slider off and the sun at the default.
- The slider works in solo and online games, and in the map editor (it's local drawing only). The editor hides the game's buttons today, so it gets the **Debug** button on its own, showing only the rows that apply there (the Sun slider and Show paths).
- Like the sound sliders, the slider gives arrow keys back to the map when you let go.

## Out of scope

- An automatic cycle (time passing on its own), and anything to do with night: darkness, lit windows, torches, and fog or sight changing with the light.
- Changing the shadow colour or strength through the day, or colouring the light (golden hour, blue night).
- Shadows longer than one tile, or shadows cast by units, enemies or projectiles.
- Any change to the sim, game state, network protocol or saved settings.
- A player-facing sun or time-of-day control.

## Data and code

- `src/render/sun.ts` (new): `shadowOffset(sun: number): { dx: number; dy: number }`. This is the ground offset per pixel of caster height, in map pixels (+x right, +y down). It's a pure function and is the only place the sun's maths lives. `DEFAULT_SUN` comes from `SUN`.
- `src/render/palette.ts`: a `SUN` table with the direction sweep, the shortest and longest length factors (the longest capped so `15 * factor <= TILE_SIZE`), and the default.
- `src/render/canvas.ts`:
  - The renderer takes the sun (e.g. `renderer.setSun(sun)`, or a field on `UiState`; the plan picks one). It's read every frame.
  - The ground-shadow pass draws each block's footprint moved by `h * offset`, not by `h / 2` sideways.
  - `drawCastShadow` is generalised from "the left neighbour" to "any neighbour the offset reaches", keeping its shape: the shaded part of a face narrows with height, and the top gets the part left over after the receiver's own height.
- `src/ui/state.ts`: `showSun: boolean` (default false) and `sun: number` (default `DEFAULT_SUN`) on `UiState`. The renderer reads `ui.sun` each frame, as it reads `ui.showFlow`.
- `src/main.ts`: a **Sun slider** row in the Debug menu's list, beside **Show paths**. Turning it off also resets `ui.sun`. Rows that only make sense in a game get `available: () => !editorActive`.
- `src/styles.css`: in `body.editing`, show `.map-left` with only its Debug button (View, Journal, Settings and the panel stay hidden).
- `src/ui/sunSlider.ts` (new): the floating slider, shown while `ui.showSun` is on. Markup and styles follow `soundControls.ts` (`label.slider`, `input type="range"`).
- Docs: a "Since `day-night`" line in `SPEC.md`, a `day-night` row in `CAPABILITIES.md`, and the Sun slider in the README's Debug menu notes.

## Tech stack and commands

TypeScript, Vite, Canvas 2D, Vitest. No new dependencies.

```
Dev:        npm run dev            (then Debug > Sun slider)
Test:       npm test
Typecheck:  npm run typecheck
Build:      npm run build
```

## Code style

Match `src/render/canvas.ts` and `src/ui/soundControls.ts`: small named functions with a one-line doc comment saying what they draw or hold, tuning numbers in `palette.ts`, British spelling (`colour`), and no new abstractions beyond `sun.ts` and `sunSlider.ts`.

```ts
/** Where a block's shadow lands on the ground, per pixel of its height, for the time of day. */
export function shadowOffset(sun: number): { dx: number; dy: number } {
  // ...
}
```

## Testing strategy

- **Unit tests** (`tests/render/sun.test.ts`) for `shadowOffset`:
  - At noon the shadow points straight down (`dx` is 0, `dy` > 0) and is the shortest of the day.
  - Sunrise and sunset mirror each other (`dx` swaps sign, `dy` is the same).
  - `dy` is never negative for any `sun` in [0, 1] (no shadow points up the screen).
  - Length is never more than `TILE_SIZE / 15` per pixel of height, so the tallest block's shadow fits in a tile.
  - The default sun gives a shadow mostly to the right (`dx` well above `dy`), about half the caster's height long.
- **Existing tests** (`tests/render/canvas.test.ts` and the rest) pass unchanged.
- **Visual check in the browser** (dev server): with the slider on, drag it from end to end over a map with walls, towers on walls, trees and the keep. Shadows sweep smoothly and stay on the near side. A tower on a wall shades the wall to its left in the morning and to its right in the evening. No shadow is drawn on top of a taller block. With the slider off, the game looks like today.

## Boundaries

- **Always:** keep the sun out of the sim and the network, put tuning numbers in `palette.ts`, run `npm test` and `npm run typecheck` before each commit, and stage files explicitly.
- **Ask first:** making the slider anything other than a Debug menu option, shadows longer than a tile, changing block heights, and any change to how blocks are drawn other than their shadows.
- **Never:** add a dependency, change game state or the protocol for this step, or push or merge (you do that).

## Success criteria

- [ ] The Debug menu has a Sun slider row. Turning it on shows the slider over the map, and turning it off hides it and resets the sun.
- [ ] With the switch on, the slider moves every block's shadow live, from long down-left at sunrise, through short and straight down at noon, to long down-right at sunset.
- [ ] Shadows fall on the ground in front of blocks and on the faces and tops of lower neighbouring blocks (left, right, in front, diagonal), never on taller or equal blocks.
- [ ] No shadow is ever longer than one tile, or points up the screen.
- [ ] With the switch off, or after a reload, shadows are at the default late-afternoon angle: mostly sideways to the right, close to today's look.
- [ ] The map editor shows a Debug button with the Sun slider row, and the slider moves the editor's shadows.
- [ ] `shadowOffset` unit tests pass. All existing tests, the typecheck and the build pass.
- [ ] `SPEC.md`, `CAPABILITIES.md` and the README are updated.

## Open questions

None. Settled on 2026-10-26: the default only needs its shadow going sideways (close to today is fine), and the editor gets the slider through its own Debug button.
