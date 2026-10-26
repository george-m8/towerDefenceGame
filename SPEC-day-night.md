# Spec: day-night

Status: APPROVED (2026-10-26)
Module: `day-night`. This spec covers **step 1, the sun angle**: shadows follow a sun that crosses the sky on an arc, set by two sliders switched on from the Debug menu. Later steps (an automatic cycle, night darkness, lights) get their own sections once this one is built. Builds on the raised blocks and their shadows in `src/render/canvas.ts`. Not on the capability map yet.
Last updated: 2026-10-26 (v1.1 - two sliders: where the sun is across the sky, and how high its arc rises; built)

## Objective

Today every block (walls, towers, trees, rocks, the keep) casts a fixed shadow. It falls to the right, as if the sun were to the top-left of the screen, and it shades lower blocks beside it (a tower on a wall shades the wall to its right). We want days and nights. The first step is a sun that moves, set by two numbers:

- **Across**: where the sun is on its arc, from the left horizon (0) to the right horizon (1).
- **Arc**: how far the arc is tilted up from the horizon, in degrees. At 90° the sun passes straight overhead. Lower, it crosses the top of the sky, staying lower all day.

| Sun | Shadows |
|---|---|
| Low on the left | long, falling right |
| Highest point (across 0.5) | straight down, short; none at all when the arc is 90° |
| Low on the right | long, falling left |

A lower arc gives longer shadows that lean further down all day. Shadows never point up the screen.

### User stories

1. As a developer, I can turn on the sun sliders from the Debug menu (top left of the map, or `` ` ``).
2. As a developer, dragging the Across slider moves the sun from one horizon to the other, and every shadow follows smoothly.
3. As a developer, dragging the Arc slider makes the sun's path higher (shorter shadows, overhead at 90°) or lower (longer shadows leaning down).
4. As a developer, when the sliders are off, the game looks much as it does today: shadows going mostly sideways to the right.
5. As a player, nothing changes in this step unless I turn the sliders on in the Debug menu. The sim and network don't change.

## Rules

**The sun**
- The sun is `{ across, arc }`: `across` from 0 (left horizon) to 1 (right horizon), `arc` in degrees from 5 to 90. It isn't game state. It lives in the renderer only and is never sent over the network.
- The sun moves on a circle across the sky, tilted `arc` degrees up from the horizon towards the top of the screen. Its highest point is at `across` 0.5.
- For each pixel of a block's height, its shadow lands `cot(180° × across) / sin(arc)` pixels sideways and `cot(arc)` pixels down. So a shadow always leans down by the same amount for a given arc, and swings sideways as the sun crosses.
- A shadow is never longer than `SUN.maxLength` (1.25) times its block's height, which keeps the tallest block's shadow (15px) under a tile (20px). Near the horizons the shadow is cut to that length, keeping its direction. So a block only ever shades the tiles next to it.
- The default is across 0.33 and arc 80°: shadows mostly sideways to the right with a slight lean down, a little longer than today's. It doesn't need to match today pixel for pixel.
- Every number (the maximum length, the defaults, the slider ranges) goes in one `SUN` table in `src/render/palette.ts`, to tune by eye.

**What casts and receives shadows**
- Only raised blocks cast shadows, as now. Units, enemies, fog and textures don't.
- A block's shadow on the **ground** is its footprint, moved by the shadow offset. Where it falls past the block's front face, it shows on the ground in front of the block.
- A block's shadow on a **lower block next to it** shades that block's front face and top, in proportion to the height difference. This is today's left-neighbour rule, extended to whichever neighbours the shadow reaches: left or right, the block in front (the row below), and the diagonal between them.
- A block never shades a block that's as tall as it or taller.
- The shadow colour (`SHADOW`, 30% black) doesn't change with the sun in this step.

**The sliders**
- A new row in the existing **Debug** menu (`src/ui/mapButtons.ts`, opened from its button or `` ` ``): **Sun slider**, off by default. It works like **Show paths**: a flag on `UiState`.
- When it's on, a box floats over the map with two sliders: **Across** (labelled e.g. "Across 0.33") and **Arc** (e.g. "Arc 80°"). They move shadows live as you drag them, even when the game is paused.
- Turning the row off hides the box and puts the sun back to the default.
- The switch and the slider positions aren't saved. A reload starts with them off and the sun at the default.
- The sliders work in solo and online games, and in the map editor (it's local drawing only). The editor hides the game's buttons today, so it gets the **Debug** button on its own, showing only the rows that apply there (the Sun slider and Show paths).
- Like the sound sliders, they give arrow keys back to the map when you let go.

## Out of scope

- An automatic cycle (time passing on its own), and anything to do with night: darkness, lit windows, torches, and fog or sight changing with the light.
- Changing the shadow colour or strength, or colouring the light (golden hour, blue night).
- Shadows longer than one tile, or shadows cast by units, enemies or projectiles.
- Sun paths that cross the bottom of the sky (shadows pointing up the screen).
- Any change to the sim, game state, network protocol or saved settings.
- A player-facing sun control.

## Data and code

- `src/render/sun.ts` (new): `shadowOffset(sun: Sun): { dx: number; dy: number }`, the ground offset per pixel of caster height, in map pixels (+x right, +y down). `castShade(offset, caster, receiver)` gives the shade a caster puts on a lower neighbour's top and front face. `CASTERS` lists the neighbours a shadow can come from. All pure; the only place the sun's maths lives. `DEFAULT_SUN` comes from `SUN`.
- `src/render/palette.ts`: a `SUN` table with the maximum length, the tallest block, the defaults and the arc slider's range.
- `src/render/canvas.ts`:
  - The renderer reads `ui.sun` every frame.
  - The ground-shadow pass draws each block's footprint moved by `h * offset`, in one fill.
  - `drawCastShadows` draws `castShade` from each neighbour in `CASTERS`, in one fill per block.
- `src/ui/state.ts`: `showSun: boolean` (default false) and `sun: Sun` (default a copy of `DEFAULT_SUN`) on `UiState`.
- `src/main.ts`: a **Sun slider** row in the Debug menu's list, beside **Show paths**. Turning it off also resets `ui.sun`. Rows that only make sense in a game get `available: () => !editorActive`.
- `src/styles.css`: in `body.editing`, show `.map-left` with only its Debug button (View, Journal, Settings and the panel stay hidden).
- `src/ui/sunSlider.ts` (new): the floating box with both sliders, shown while `ui.showSun` is on. Markup and styles follow `soundControls.ts` (`label.slider`, `input type="range"`).
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
/** Where a block's shadow lands on the ground, per pixel of its height, for where the sun is. */
export function shadowOffset(sun: Sun): { dx: number; dy: number } {
  // ...
}
```

## Testing strategy

- **Unit tests** (`tests/render/sun.test.ts`):
  - `shadowOffset`: at the arc's highest point the shadow points straight down and is the shortest of the day; with a 90° arc there's none. The left and right horizons mirror each other. `dy` is never negative. No shadow is longer than `SUN.maxLength`, and near the horizons shadows are cut to it, pointing sideways. A lower arc gives longer shadows. The default points mostly right.
  - `castShade`: which neighbours shade a block's top and face for shadows falling left, right and down; none when the receiver is as tall as the caster.
- **Existing tests** pass unchanged.
- **Visual check in the browser** (dev server): with the sliders on, drag both over walls, towers on walls, trees and the keep. Shadows follow smoothly and stay on the near side. A tower on a wall shades the wall on whichever side its shadow falls. No shadow is drawn on top of a taller block. With the sliders off, the game looks like today.

## Boundaries

- **Always:** keep the sun out of the sim and the network, put tuning numbers in `palette.ts`, run `npm test` and `npm run typecheck` before each commit, and stage files explicitly.
- **Ask first:** making the sliders anything other than a Debug menu option, shadows longer than a tile, changing block heights, and any change to how blocks are drawn other than their shadows.
- **Never:** add a dependency, change game state or the protocol for this step, or push or merge (you do that).

## Success criteria

- [x] The Debug menu has a Sun slider row. Turning it on shows the sliders over the map, and turning it off hides them and resets the sun.
- [x] Across moves every shadow live, from long and right (sun low on the left), through straight down at the arc's top, to long and left. Arc makes the path higher or lower, with no noon shadow at 90°.
- [x] Shadows fall on the ground in front of blocks and on the faces and tops of lower neighbouring blocks (left, right, in front, diagonal), never on taller or equal blocks.
- [x] No shadow is ever longer than `SUN.maxLength` times its block's height (under a tile), or points up the screen.
- [x] With the switch off, or after a reload, shadows are at the default: mostly sideways to the right, close to today's look.
- [x] The map editor shows a Debug button with the Sun slider row, and the sliders move the editor's shadows.
- [x] Unit tests pass. All existing tests, the typecheck and the build pass.
- [x] `SPEC.md`, `CAPABILITIES.md` and the README are updated.

## Open questions

None. Settled on 2026-10-26: the default only needs its shadow going sideways (close to today is fine), and the editor gets the slider through its own Debug button. Changed the same day: a second slider for the arc's height, with the sun on a real tilted arc (in place of a fixed arc with a single time-of-day slider). Known, left for later: some shadows don't join up neatly where blocks meet.
