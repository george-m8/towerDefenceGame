# Tasks: Glyph Art Studio

Spec: [`../SPEC.md`](../SPEC.md). Plan: [`plan.md`](plan.md).

Every task also meets the Definition of Done: `npm test` and `npm run typecheck` pass, no regressions, behaviour checked in the browser where there's UI, and README updated if anything user-facing changed.

---

## Phase 1: Foundation and first slice

### Task 1: Scaffold the art-studio project

**Description:** Create the Vite + TS + Vitest project in `art-studio/`, matching the game's tool versions and config style, with a placeholder page and a stub README.

**Acceptance criteria:**
- [ ] `package.json` with `dev` (port 5174), `build`, `test`, `test:watch`, `coverage`, `typecheck` and `format` scripts; dev dependency versions match `../package.json`
- [ ] Strict `tsconfig.json` mirroring the game's; Vitest config with 80% line coverage on `src/art/**`
- [ ] `index.html` + `src/studio/main.ts` render an empty studio layout (toolbar, canvas area, side panel)

**Verification:**
- [ ] `npm install && npm test` passes (one smoke test), `npm run build` succeeds
- [ ] Manual: `npm run dev` shows the layout at http://localhost:5174

**Dependencies:** None
**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/studio/main.ts`, `src/studio/styles.css`, `README.md`, `.gitignore`, `tests/smoke.test.ts`
**Scope:** S (config-heavy)

### Task 2: Piece model

**Description:** Implement the spec's data model: types, `createPiece()` defaults (1x1, one paint layer, one frame, snap off), `validatePiece()` with readable error paths, and `parsePiece`/`serialisePiece`.

**Acceptance criteria:**
- [ ] Types match SPEC "Data Model", including `size`, `snap`, `wrap` and the layer kinds
- [ ] `parsePiece` rejects bad input (wrong `format`/`version`, bad colour, out-of-range font index, frame count mismatch) with messages like `layers[1].frames[0][3].colour: expected #rrggbb`
- [ ] `parsePiece(serialisePiece(p))` deep-equals `p`

**Verification:**
- [ ] `npm test -- piece` passes

**Dependencies:** 1
**Files:** `src/art/types.ts`, `src/art/piece.ts`, `tests/piece.test.ts`
**Scope:** S

### Task 3: `drawPiece` renderer

**Description:** Implement the renderer contract: draw visible layers bottom to top with opacity, each glyph at its tile-unit position/size/rotation/colour/font/weight, using the right frame (single-frame layers repeat), with `layerRotation` applied about each layer's pivot. Multi-tile pieces draw at `size * tileSize`. (`wrap` comes in Task 12.)

**Acceptance criteria:**
- [ ] Tests with a recording fake `CanvasRenderingContext2D` confirm the font string, fill colour, transform and `fillText` position for a known glyph at two tile sizes
- [ ] Hidden layers are skipped; opacity sets `globalAlpha`; the frame index wraps by `frameCount`
- [ ] A rotating layer with `layerRotation` rotates about its pivot (tested numerically); context state is saved/restored so the caller's `ctx` is unchanged afterwards

**Verification:**
- [ ] `npm test -- render` passes

**Dependencies:** 2
**Files:** `src/art/render.ts`, `tests/render.test.ts`, `tests/fakeCtx.ts`
**Scope:** S

### Task 4: Editor slice - stamp, autosave, save/open

**Description:** First end-to-end slice. The canvas view shows the piece zoomed (e.g. 320px per tile) with the tile outline and a 1-tile overflow margin, drawn with `drawPiece`. A stamp tool places a fixed glyph (`#`, Menlo, white, size 0.8) on click. The piece autosaves to `localStorage` and restores on load. Toolbar has New, Save JSON (download) and Open JSON (file picker, validated, error shown on bad file).

**Acceptance criteria:**
- [ ] Clicking stamps a glyph at the clicked tile-unit position (screen -> tile conversion is a tested pure function), including in the overflow margin
- [ ] Reloading the page restores the piece; New resets it (with a confirm)
- [ ] Save then Open round-trips; opening an invalid file shows the validation message and leaves the current piece alone

**Verification:**
- [ ] `npm test` passes (coordinate conversion, autosave serialisation)
- [ ] Manual: stamp 3 glyphs, reload, save, New, open -> same 3 glyphs

**Dependencies:** 3
**Files:** `src/studio/state.ts`, `src/studio/canvasView.ts`, `src/studio/storage.ts`, `src/studio/main.ts`, `tests/canvasView.test.ts`
**Scope:** M

### Checkpoint A: Foundation
- [ ] `npm test`, `npm run typecheck`, `npm run build` pass
- [ ] Task 4's manual round-trip works
- [ ] Human review before Phase 2

---

## Phase 2: Painting

### Task 5: Undo/redo history

**Description:** Snapshot-based history wrapping every piece change, capped at 200 entries, with Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and toolbar buttons. Changes made during a drag or slider movement are merged into one entry.

**Acceptance criteria:**
- [ ] `history.ts` is pure and tested: push, undo, redo, a new push clears the redo stack, the cap drops the oldest entry, begin/commit merges a batch
- [ ] Every edit path in the editor goes through history (stamp now; later tasks must use it too)

**Verification:**
- [ ] `npm test -- history` passes; manual: stamp, drag-paint, undo, redo

**Dependencies:** 4
**Files:** `src/studio/history.ts`, `src/studio/state.ts`, `src/studio/main.ts`, `tests/history.test.ts`
**Scope:** S

### Task 6: Brush settings and snapping

**Description:** Brush panel: characters (one or more, in order or at random), size, rotation (fixed or random range), spacing along a drag, and sub-grid snap (0 = off, 2-8 cells per tile; snap is saved on the piece). Drag-painting places glyphs at that spacing along the pointer path. A grid overlay shows when snap is on.

**Acceptance criteria:**
- [ ] Pure `brushStamps(path, brush, snap, rng)` tested: spacing respected, sequence vs random chars, snapped glyphs land exactly on cell centres
- [ ] A drag is one undo entry
- [ ] Snap is off by default and the grid overlay matches the snap cells

**Verification:**
- [ ] `npm test -- brush` passes; manual: paint a line with snap off, then with snap 4

**Dependencies:** 5
**Files:** `src/studio/brush.ts`, `src/studio/panels/brushPanel.ts`, `src/studio/canvasView.ts`, `tests/brush.test.ts`
**Scope:** M

### Task 7: Colours and game palette

**Description:** `colour.ts` (hex <-> HSL, validation), a colour control in the brush panel (native picker + hex input + alpha), a swatch row with the game palette copied into `gamePalette.ts`, and recently used colours.

**Acceptance criteria:**
- [ ] hex/HSL conversions round-trip within 1 unit (tested)
- [ ] All `COLOURS` and `STRUCTURE_COLOURS` values from the game's `palette.ts` appear as named swatches (rgba values converted to `#rrggbbaa`)
- [ ] Clicking a swatch sets the brush colour

**Verification:**
- [ ] `npm test -- colour` passes; manual: paint with 3 game swatches

**Dependencies:** 6
**Files:** `src/art/colour.ts`, `src/art/gamePalette.ts`, `src/studio/panels/colourControl.ts`, `tests/colour.test.ts`
**Scope:** S

### Task 8: Fonts

**Description:** `fonts.ts`: Google CSS2 URL builder, `loadPieceFonts(piece)`, `isFontAvailable(family)`. Font panel: add a font by typed name as Google or system, a Google suggestion list (spec list), system font listing via `queryLocalFonts()` when supported, and a weight selector. The brush uses the selected font. Missing system fonts show a "not portable" warning. The canvas redraws once fonts load.

**Acceptance criteria:**
- [ ] URL builder tested (spaces, several families/weights, deduped); `loadPieceFonts` tested with a stubbed `document.fonts`
- [ ] Adding "Press Start 2P" (Google) and painting with it renders in that font after a cold reload
- [ ] A made-up system font name shows the warning

**Verification:**
- [ ] `npm test -- fonts` passes; manual check of the two cases above

**Dependencies:** 6
**Files:** `src/art/fonts.ts`, `src/studio/panels/fontPanel.ts`, `src/studio/main.ts`, `tests/fonts.test.ts`
**Scope:** M

### Task 9: Character grid

**Description:** A panel of clickable characters grouped as Letters, Digits, Punctuation, Box drawing, Blocks, Shapes and Arrows, drawn in the current font, plus a free text field. Clicking sets (or with Shift adds to) the brush characters.

**Acceptance criteria:**
- [ ] Groups are defined as data (code-point ranges/lists) with a test that every entry is a single grapheme
- [ ] Clicking and Shift+clicking update the brush characters; the grid renders in the selected font

**Verification:**
- [ ] `npm test -- charsets` passes; manual: pick `█`, then Shift+pick `▓` and `▒`, then paint at random

**Dependencies:** 8
**Files:** `src/studio/charsets.ts`, `src/studio/panels/charGrid.ts`, `tests/charsets.test.ts`
**Scope:** S

### Checkpoint B: Painting
- [ ] Make the **wall** example and save it to `pieces/wall.json`; it renders the same after a cold reload
- [ ] All tests, typecheck and build pass
- [ ] Human review

---

## Phase 3: Editing and structure

### Task 10a: Select, move, delete

**Description:** Select tool: click a glyph to select it (topmost first, hit-test on its rotated bounding box), Shift+click to add, drag a box to select several, drag the selection to move it (snapping if snap is on), and Delete/Backspace to remove. The selection is outlined.

**Acceptance criteria:**
- [ ] Pure hit-test and box-select functions tested, including rotated glyphs
- [ ] Moving and deleting are each one undo entry; selection is limited to the active layer and frame

**Verification:**
- [ ] `npm test -- selection` passes; manual: box-select 3 glyphs, move them, undo, delete

**Dependencies:** 9 (Checkpoint B)
**Files:** `src/studio/selection.ts`, `src/studio/tools/selectTool.ts`, `src/studio/canvasView.ts`, `tests/selection.test.ts`
**Scope:** M

### Task 10b: Inspector

**Description:** An inspector panel for the current selection: character, size, rotation, colour, font, weight (showing "mixed" when values differ), plus nudge with the arrow keys, bring forward/send back, and duplicate.

**Acceptance criteria:**
- [ ] Editing a field applies to every selected glyph as one undo entry; mixed values only change if edited
- [ ] Reorder and duplicate tested as pure piece operations

**Verification:**
- [ ] `npm test -- edits` passes; manual: recolour and rotate a 3-glyph selection

**Dependencies:** 10a
**Files:** `src/studio/edits.ts`, `src/studio/panels/inspector.ts`, `tests/edits.test.ts`
**Scope:** S

### Task 11: Layers, pivot, rotating layers

**Description:** Layers panel: add, delete, rename, reorder, show/hide, opacity, set active, and mark a layer as rotating. Rotating layers show a draggable pivot handle (snaps to cell centres when snap is on) and a "preview spin" toggle that animates `layerRotation`.

**Acceptance criteria:**
- [ ] Layer operations are pure, tested and undoable
- [ ] The pivot handle drag updates `pivot`; the spin preview rotates the layer about its pivot
- [ ] Painting and selecting only affect the active layer

**Verification:**
- [ ] `npm test -- layers` passes; manual: base + turret, set pivot to the centre, spin

**Dependencies:** 10b
**Files:** `src/studio/layers.ts`, `src/studio/panels/layersPanel.ts`, `src/studio/canvasView.ts`, `tests/layers.test.ts`
**Scope:** M

### Task 12: Size, wrap and preview

**Description:** Piece settings: size `w x h` (1-8 tiles) and `wrap`. Add wrap to `drawPiece`: a glyph whose bounds cross an edge is also drawn shifted by the piece width/height (including corners). The preview panel shows the piece at 20px per tile on the game ground colour, as a 3x3 tiled patch, with rotating layers spinning.

**Acceptance criteria:**
- [ ] Wrap tested: a glyph crossing the right edge draws twice, one crossing a corner draws four times, one fully inside draws once
- [ ] Changing size resizes the canvas view and tile outline; glyph sizes stay relative to one tile
- [ ] The preview panel updates live with every edit

**Verification:**
- [ ] `npm test -- render` passes; manual: wrapped texture shows no seam in the 3x3 preview; a 3x3 piece displays correctly

**Dependencies:** 11
**Files:** `src/art/render.ts`, `src/studio/panels/pieceSettings.ts`, `src/studio/panels/preview.ts`, `tests/render.test.ts`
**Scope:** M

### Checkpoint C: Structure
- [ ] Make the **archer** example (base + rotating turret) and save it to `pieces/archer.json`; the turret spins about its pivot in preview
- [ ] All tests, typecheck and build pass
- [ ] Human review

---

## Phase 4: Generators and animation

### Task 13: RNG, colour ranges, scatter

**Description:** `rng.ts` (mulberry32 copied from the game), `sampleColour(range, rng)` for HSL and palette ranges, and `scatter(spec, frame, pieceSize)` that bakes glyphs per the spec, including circle areas, min spacing (with rejection attempts capped), and `perFrame`.

**Acceptance criteria:**
- [ ] Same spec + seed gives identical output; a different seed gives different output
- [ ] All glyphs fall inside the area; min spacing respected when achievable (count is capped and reported when not)
- [ ] HSL samples stay within each range, including hue ranges that wrap past 360

**Verification:**
- [ ] `npm test -- generators colour` passes

**Dependencies:** 2 (can run in parallel with Phase 2/3)
**Files:** `src/art/rng.ts`, `src/art/generators.ts`, `src/art/colour.ts`, `tests/generators.test.ts`
**Scope:** S

### Task 14: Generator layers in the editor

**Description:** "Add generator layer" creates a scatter layer filling the piece. A generator panel edits every `GeneratorSpec` field (character set, font/weight, count, area, size/rotation ranges, colour range as HSL sliders or a palette list from swatches, min spacing, per-frame) and has a Re-roll button. Every change re-bakes `frames` live; a slider drag is one undo entry.

**Acceptance criteria:**
- [ ] Changing any field re-bakes and redraws immediately; Re-roll changes the seed
- [ ] Saved JSON has both `generator` and the baked `frames`; reopening it reproduces the same glyphs
- [ ] Generator layers can't be painted on (the UI says so); a "Convert to paint layer" action bakes it permanently

**Verification:**
- [ ] `npm test` passes (bake-on-change logic); manual: build a ground texture with wrap on and check the 3x3 preview

**Dependencies:** 12, 13
**Files:** `src/studio/panels/generatorPanel.ts`, `src/studio/layers.ts`, `src/studio/main.ts`, `tests/layers.test.ts`
**Scope:** M

### Task 15: Frames, timeline, playback, onion skin

**Description:** Frame operations (add blank, duplicate, delete, reorder) with the rule that a single-frame paint layer is copied out to `frameCount` frames the first time it's edited on another frame. A timeline strip with thumbnails, fps input, play/pause, and onion skin (previous frame at 30% opacity, toggle). Per-frame generators bake one set per frame.

**Acceptance criteria:**
- [ ] Frame operations are pure, tested and undoable; `frameCount` and every layer's `frames` length stay consistent (validated after each op)
- [ ] Playback runs at the piece fps in the canvas and the preview
- [ ] Onion skin shows the previous frame and is never part of exports

**Verification:**
- [ ] `npm test -- frames` passes; manual: make the 4-frame spikes animation and play it

**Dependencies:** 14
**Files:** `src/studio/frames.ts`, `src/studio/panels/timeline.ts`, `src/studio/canvasView.ts`, `tests/frames.test.ts`
**Scope:** M

### Checkpoint D: Generators and animation
- [ ] **Ground texture** saved to `pieces/ground.json` (wrapped scatter, no seams); **spikes animation** saved to `pieces/spikes.json` (4 frames)
- [ ] All tests, typecheck and build pass
- [ ] Human review

---

## Phase 5: Export and finish

### Task 16: PNG export and sprite sheet

**Description:** Export dialog: scale (px per tile: 20, 32, 64, 128, 256 or custom), current frame PNG (transparent background, fonts awaited), and a sprite sheet laying out all frames in a grid (optionally one row per layer, so rotating layers can be drawn separately) plus an index JSON (`{ frameWidth, frameHeight, frames: [{ x, y, w, h, frame, layer? }], fps }`). Overflow beyond the tile is included by an optional padding setting (tiles of margin).

**Acceptance criteria:**
- [ ] Sheet layout maths tested (columns, rows, per-layer rows, padding)
- [ ] A 1x1 piece at 256px exports a 256x256 PNG; a 3x3 piece exports 768x768; a 4-frame sheet has 4 cells in order matching the index
- [ ] Export waits for fonts, so the PNG never shows a fallback font

**Verification:**
- [ ] `npm test -- export` passes; manual: export wall at 20px and 256px and compare; export the spikes sheet and check the index

**Dependencies:** 15
**Files:** `src/studio/export.ts`, `src/art/sheetLayout.ts`, `src/studio/panels/exportDialog.ts`, `tests/sheetLayout.test.ts`
**Scope:** M

### Task 17: Samples, README, final verification

**Description:** Make sure the 4 sample pieces in `pieces/` are final and valid (a test loads each through `parsePiece`), write the full README (npm setup, features, keyboard shortcuts, piece JSON format with an example, how the game can use `drawPiece`), and walk through every spec success criterion.

**Acceptance criteria:**
- [ ] `tests/samples.test.ts` parses all 4 pieces
- [ ] README covers setup, features, shortcuts, the JSON format and game integration notes
- [ ] Spec success criteria 1-11 checked, with coverage of at least 80% on `src/art/**`

**Verification:**
- [ ] `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build` all pass

**Dependencies:** 16
**Files:** `pieces/*.json`, `README.md`, `tests/samples.test.ts`
**Scope:** S

### Checkpoint E: Complete
- [ ] Every spec success criterion met
- [ ] Human review
