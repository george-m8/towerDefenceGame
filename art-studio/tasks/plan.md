# Implementation Plan: Glyph Art Studio

Spec: [`../SPEC.md`](../SPEC.md) (APPROVED v1.0). Tasks with full acceptance criteria: [`todo.md`](todo.md).

## Overview

A Vite + TypeScript browser studio for making tile art from coloured type characters, with a pure, game-importable renderer in `src/art/`. The build starts with a thin end-to-end slice (make a piece, stamp a glyph, see it, save/open JSON) and then adds to it one capability at a time: painting, editing, layers, multi-tile/wrap preview, generators, frames, and exports. Each phase ends by making one of the spec's four example pieces.

## Architecture Decisions

- **The piece JSON is the single source of truth.** Editor state = `{ piece, ui }`. Every edit is a pure function `(piece, ...) => piece`, which keeps edits testable and makes undo/redo simple.
- **Undo/redo stores whole-piece snapshots** (structured clones, capped at 200). Pieces are small (hundreds of glyphs), so a command pattern isn't worth the extra complexity.
- **The renderer contract is fixed early (Task 3)** and covers layers, frames, opacity, glyph transforms, layer rotation about a pivot and multi-tile size. Only `wrap` comes later (Task 11). The studio's canvas view calls the same `drawPiece` the game will, so what you see in the studio is what the game draws.
- **The RNG is mulberry32, copied from the game's `src/sim/rng.ts`**, so seeds behave the same if generators ever run in the game.
- **Fonts:** Google Fonts load via an injected CSS2 `<link>` and then `document.fonts.load(...)` for each family/weight before drawing. System fonts are listed with `window.queryLocalFonts()` where the browser supports it (Chrome), with a typed name as fallback, and checked with `document.fonts.check`.
- **Thin DOM, thick logic:** the panels are small DOM modules that call pure functions in `src/art/` or `src/studio/*Logic.ts`. Tests target the pure parts; the DOM is checked manually in the browser.
- **Own `package.json`** in `art-studio/`, with dev dependency versions pinned to match the game's. The dev server runs on port 5174.

## Dependency Graph

```
scaffold (1)
  └── piece-model (2)
        ├── piece-render (3) ──┐
        ├── generators (13) ───┤
        └───────────────────── editor slice (4)
                                  ├── history (5)
                                  ├── brush + snap (6) ── colour (7)
                                  ├── fonts (8) ── char grid (9)
                                  ├── select/transform (10a, 10b)
                                  ├── layers + pivot (11)
                                  ├── size, wrap, preview (12)
                                  ├── generator layers (14)  [needs 13]
                                  ├── frames + playback (15)
                                  └── export PNG / sheet (16)
                                         └── samples + docs (17)
```

## Task List

### Phase 1: Foundation and first slice
- [ ] Task 1: Scaffold the art-studio project
- [ ] Task 2: Piece model - types, create, validate, parse/serialise
- [ ] Task 3: `drawPiece` renderer
- [ ] Task 4: Editor slice - canvas view, stamp a glyph, autosave, save/open JSON

### Checkpoint A: Foundation
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass
- [ ] Stamping a glyph, reloading the page, and save -> open JSON all round-trip
- [ ] Human review

### Phase 2: Painting
- [ ] Task 5: Undo/redo history
- [ ] Task 6: Brush settings and sub-grid snapping
- [ ] Task 7: Colour picker, swatches and the game palette
- [ ] Task 8: Fonts - Google + system, loading, availability warning
- [ ] Task 9: Character grid

### Checkpoint B: Painting (example piece: **wall**)
- [ ] A wall tile made from `#`, `=` and `█` in a Google Font, saved to `pieces/wall.json`, renders the same after a cold reload
- [ ] Human review

### Phase 3: Editing and structure
- [ ] Task 10a: Select tool - click/box select, move, delete
- [ ] Task 10b: Inspector - rotate, scale, recolour, reorder selected glyphs
- [ ] Task 11: Layers panel, pivot and rotating layers
- [ ] Task 12: Multi-tile size, wrap and the preview panel

### Checkpoint C: Structure (example piece: **archer** with a rotating turret)
- [ ] The turret spins about its pivot in preview; the 3x3 tiled preview shows a wrapped texture with no seam
- [ ] Human review

### Phase 4: Generators and animation
- [ ] Task 13: Seeded RNG, colour ranges and the scatter generator (pure)
- [ ] Task 14: Generator layers in the editor
- [ ] Task 15: Frames, timeline, playback and onion skin

### Checkpoint D: Generators and animation (example pieces: **ground texture**, **spikes animation**)
- [ ] Ground texture made with a wrapped scatter layer; 4-frame spikes animation plays at its fps
- [ ] Human review

### Phase 5: Export and finish
- [ ] Task 16: PNG frame export and sprite sheet with index
- [ ] Task 17: Sample pieces, README and final verification

### Checkpoint E: Complete
- [ ] Every spec success criterion (1-11) checked off
- [ ] Coverage at least 80% lines on `src/art/**`
- [ ] Human review

## Parallelisation

Single agent, sequential by default. If run in parallel: Tasks 3 and 13 depend only on Task 2. Tasks 7, 8 and 9 are independent once Task 6 is done.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fonts aren't loaded when the canvas draws, so glyphs render in a fallback font (worst in PNG export) | High | `loadPieceFonts` awaits `document.fonts.load` for every family/weight; export awaits it too; tested with a cold reload (Checkpoint B) |
| `queryLocalFonts()` is Chrome-only and needs a permission prompt | Med | Typed font name as fallback in all browsers; `document.fonts.check` warning |
| `textBaseline = "middle"` doesn't centre glyphs visually the same way in every font | Low | Accept for v1 (the game does the same); revisit with `actualBoundingBox` metrics if it looks wrong |
| Node v23.7 is installed but Vitest supports 22/24 LTS (per the game's README) | Med | Pin Vitest to the game's version (proven to work in this environment); if it breaks, switch to Node 24 |
| Whole-piece snapshots get heavy with large generator layers | Low | Cap history at 200 entries; generator layers re-bake from params, so dragging a slider records one entry on release, not one per change |
| The renderer contract changes after the game starts using it | Med | Fix the contract in Task 3 with tests; any change after v1 is "ask first" (spec Boundaries) and bumps `version` |

## Open Questions

None. Run `/build` to start with Task 1.
