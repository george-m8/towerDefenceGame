# Tasks: day-night (step 1, sun angle)

Spec: [`SPEC-day-night.md`](../../SPEC-day-night.md) · Plan: [`plan.md`](../plan.md) ("Day and night: day-night")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests read their numbers from `SUN` and `TILE_SIZE`, never repeat them. Browser checks use `npm run dev`; before Task 4, set the sun from the console with `__ui.sun = 0.2`.

## Task 1: shadowOffset and the SUN table

`src/render/sun.ts`: `shadowOffset(sun)` returns `{ dx, dy }`, the ground offset per pixel of caster height. The direction sweeps from left (0) through down (0.5) to right (1). The length factor is shortest at noon and longest at the ends, and is capped so the tallest block (15px) casts at most a tile. `DEFAULT_SUN` and every number are in a `SUN` table in `src/render/palette.ts`.

- [ ] Noon: `dx` is 0, `dy` > 0, and it's the shortest shadow of the day
- [ ] Sunrise and sunset mirror each other; `dy` is never negative for any `sun` in [0, 1]
- [ ] Length never exceeds `TILE_SIZE / 15` per pixel of height
- [ ] The default sun points mostly right (`dx` well above `dy`), about 0.5 long

Files: `src/render/sun.ts` (new), `src/render/palette.ts`, `tests/render/sun.test.ts` (new). Size: S. Depends on: none.

## Task 2: Ground shadows follow ui.sun

`UiState` gets `sun` (default `DEFAULT_SUN`) and `showSun` (default false). The renderer's ground-shadow pass draws each block's footprint moved by `h * shadowOffset(ui.sun)`, all in one path with a single fill. The pass starts one tile above and left of the view so shadows from just off screen still show.

- [ ] At the default sun, ground shadows go sideways to the right, close to today's look
- [ ] `__ui.sun = 0.5` gives short shadows straight down, showing on the ground in front of blocks
- [ ] Where shadows overlap (a row of walls at noon) the ground isn't darker than one shadow

Files: `src/ui/state.ts`, `src/render/canvas.ts`. Size: S. Depends on: 1.

## Task 3: Cast shadows on any lower neighbour

`drawCastShadow` is generalised from "the block on the left" to whichever of the 8 neighbours the offset reaches. A pure helper (in `sun.ts`) says which neighbours a shadow reaches and how far. The shape stays as today: the shaded part of a face narrows with height, and the top gets the part left after the receiver's own height. A block never shades one as tall or taller.

- [ ] Morning (`sun` 0.1): a tower on a wall shades the wall to its left; evening (0.9): the wall to its right
- [ ] Noon: a tower on a wall shades the top and face of the wall in front of it (the row below)
- [ ] No shadow is drawn on a block as tall as its caster or taller (keep corners, trees beside walls)
- [ ] Unit tests for the helper: neighbours reached at 0, 0.5 and 1; none when the receiver is as tall

Files: `src/render/sun.ts`, `src/render/canvas.ts`, `tests/render/sun.test.ts`. Size: M. Depends on: 2.

## Checkpoint A: after Task 3

- [ ] Standard verification passes
- [ ] Browser: `__ui.sun` at 0, 0.25, 0.5, 0.9 and 1 over walls, towers on walls, trees, rocks and the keep looks right (screenshots for review)
- [ ] Review the shadows together before building the UI

## Task 4: Sun slider in the Debug menu

A **Sun slider** row in the Debug menu (beside Show paths) toggles `ui.showSun`. Turning it off resets `ui.sun` to the default. `src/ui/sunSlider.ts` shows a floating `label.slider` with an `input type="range"` over the map while it's on, labelled "Sun 0.90", moving `ui.sun` live. It hands the arrow keys back to the map on `change`, like the sound sliders.

- [ ] The row turns the slider on and off; off resets the sun; a reload starts off at the default
- [ ] Dragging moves shadows live, including while paused, in solo and online games
- [ ] Arrow keys pan the map again after letting go of the slider

Files: `src/ui/sunSlider.ts` (new), `src/main.ts`, `src/styles.css`, `index.html` (if it needs a mount point). Size: M. Depends on: 3.

## Task 5: Debug button and slider in the map editor

In `body.editing`, `.map-left` shows with only its Debug button (View, Journal, Settings and the panel stay hidden). Rows that only apply in a game (infinite keep health, infinite money, fog of war) get `available: () => !editorActive`, leaving Sun slider and Show paths. The slider shows over the editor's map and moves its shadows.

- [ ] The editor shows a Debug button (and `` ` `` opens it) with just Sun slider and Show paths
- [ ] The slider moves the editor's shadows; Play and back keep the sun as set
- [ ] The game's Debug menu still lists every row

Files: `src/main.ts`, `src/styles.css`, `src/ui/mapButtons.ts` (only if `available` needs a refresh on open). Size: S. Depends on: 4.

## Checkpoint B: after Task 5

- [ ] Standard verification passes
- [ ] Browser, by hand: the full flow in a solo game, an online game and the editor

## Task 6: Docs

A "Since `day-night`" line in `SPEC.md`, a `day-night` row in `CAPABILITIES.md`, and the Sun slider in the README's Debug menu notes. The spec's "Last updated" says what was built.

- [ ] `SPEC.md`, `CAPABILITIES.md` and README updated and accurate
- [ ] Each task's "Built:" notes added below it where the build differed from the plan

Files: `SPEC.md`, `CAPABILITIES.md`, `README.md`, `SPEC-day-night.md`. Size: S. Depends on: 5.
