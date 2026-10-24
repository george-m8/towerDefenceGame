# Spec: Glyph Art Studio

Status: APPROVED (v1.0)
Last updated: 2026-10-24

## Objective

A browser dashboard for making tile art for Keep Defence out of type characters. You pick typefaces, then place coloured characters on a square tile (or a block of tiles, e.g. 3x3 for the keep) by hand (painting) or with code (generators), across layers and animation frames. Output is a JSON description that the game can draw at any size, or PNG images.

**Who it's for:** the developer, making art for the tower defence game. The studio is a dev tool, not a public product.

**What success looks like:** the developer can make each of these in a few minutes and export it:
1. A seamless **ground texture** (e.g. scattered `.,'"` in a brown range) that tiles without visible seams.
2. A **wall** tile made of painted `#`, `=` and `█` characters.
3. An **archer tower** in two layers, a static base and a turret that rotates around a pivot, previewed spinning.
4. A **4-frame animation** (e.g. spikes rising) that plays at a set fps.

### User stories

1. Pick one or more typefaces: any **installed system font** or any **Google Font**, by typing its name or choosing from a short built-in suggestion list (Press Start 2P, VT323, Silkscreen, IBM Plex Mono, Space Mono, Noto Sans Symbols 2).
2. Choose characters from the font: type them, or pick from a character grid (letters, punctuation, box-drawing, blocks, shapes, arrows).
3. Paint: click or drag to stamp characters onto the tile, with brush settings for character(s), size, rotation, colour and spacing. Optional **sub-grid snapping** (2x2, 3x3, 4x4 ... cells per tile, off by default) places glyphs at cell centres for blocky art.
4. Choose colours from a picker or from swatches, including the game's palette colours preloaded.
5. Edit: select glyphs to move, rotate, scale, recolour, reorder or delete them, with undo/redo.
6. Generate: add a generator layer (e.g. "scatter 40 glyphs from `.,'` in this colour range, sizes 0.1-0.3 tile, random rotation"), change its settings and see the result live, and re-roll the seed.
7. Organise art in **layers** (e.g. base + turret). A layer can be marked as **rotating** and given a **pivot** point.
8. Animate with **frames**: add, duplicate, delete and reorder them, set the fps, play, and see the previous frame faintly (onion skin).
9. Preview at game scale (20px), on the game's ground colours, as a 3x3 tiled patch (to check seams), and with rotating layers spinning.
10. Export the piece as **JSON**, as a **PNG** of the current frame at a chosen scale, or as a **PNG sprite sheet** of all frames with an index JSON.
11. Save and reopen work: autosave in the browser, plus save/open `.json` files.

## Capability Map

The request bundles several capabilities that can be tested on their own. Because each one is small, they share this single spec instead of one spec per module, but the module ids below set the code boundaries and the build order.

| Module id | Responsibility | Depends on |
|---|---|---|
| `piece-model` | Piece JSON types, versioning, validation, (de)serialisation | - |
| `piece-render` | Pure draw function: piece + frame + layer rotations -> canvas 2D calls. Font loading. **The part the game imports.** | `piece-model` |
| `generators` | Seeded procedural glyph generators (scatter first), baking to glyphs | `piece-model` |
| `editor` | Studio UI: canvas, tools, brush, selection, layers, frames, undo/redo, autosave | `piece-model`, `piece-render`, `generators` |
| `fonts` | Font picker: system fonts (Local Font Access API, or by name) + Google Fonts by name, character grid | `piece-render` |
| `export` | JSON download, PNG frame, PNG sprite sheet + index | `piece-model`, `piece-render` |

Build order: `piece-model` -> `piece-render`, `generators` -> `editor` (with `fonts`) -> `export`

## Data Model (`piece-model`)

Every position and size is in **tile units**: `(0,0)` is the top-left of the piece and `(size.w, size.h)` the bottom-right, so a 1x1 piece spans 0..1. Glyphs may sit outside that box (art that spills past the tile). This keeps pieces independent of resolution: the game's 20px tile and a 256px export use the same file.

```ts
interface Piece {
  format: "glyph-art";
  version: 1;
  name: string;
  size: { w: number; h: number }; // footprint in whole tiles, default 1x1 (the keep is 3x3)
  snap: number;              // sub-grid cells per tile for painting, 0 = off (default). Editor setting, saved with the piece
  fonts: FontRef[];          // every font the piece uses
  fps: number;               // animation speed; ignored when frameCount is 1
  frameCount: number;        // 1 = static
  wrap: boolean;             // seamless texture: glyphs crossing an edge of the piece also draw on the opposite edge
  layers: Layer[];           // bottom to top
}

interface FontRef {
  family: string;            // e.g. "Press Start 2P", "Menlo"
  source: "google" | "system";
}

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;           // 0..1
  rotates: boolean;          // the game rotates this layer at runtime (e.g. a turret)
  pivot: { x: number; y: number }; // rotation origin, tile units
}

interface PaintLayer extends LayerBase {
  kind: "paint";
  frames: Glyph[][];         // length 1 (same in every frame) or frameCount
}

interface GeneratorLayer extends LayerBase {
  kind: "generator";
  generator: GeneratorSpec;  // studio-only: editable, re-rollable settings
  frames: Glyph[][];         // baked output, kept in sync with `generator`
}

type Layer = PaintLayer | GeneratorLayer;

interface Glyph {
  char: string;              // one grapheme
  x: number; y: number;      // glyph centre, tile units
  size: number;              // font size as a fraction of the tile (1 = tile height)
  rotation: number;          // degrees, clockwise, about the glyph centre
  colour: string;            // "#rrggbb" or "#rrggbbaa"
  font: number;              // index into Piece.fonts
  weight: number;            // 100-900
}

interface GeneratorSpec {
  type: "scatter";
  seed: number;
  count: number;
  area: { shape: "rect" | "circle"; x: number; y: number; w: number; h: number }; // defaults to the whole piece
  chars: string;             // picked at random
  font: number;
  weight: number;
  size: { min: number; max: number };
  rotation: { min: number; max: number };
  colour: ColourRange;
  minSpacing: number;        // 0 = allow overlap
  perFrame: boolean;         // re-scatter every frame (shimmer) vs same glyphs in all frames
}

type ColourRange =
  | { mode: "hsl"; h: [number, number]; s: [number, number]; l: [number, number] }
  | { mode: "palette"; colours: string[] };
```

So the game never has to run generators: a generator layer's `frames` always holds its baked glyphs, which renderers draw like any paint layer.

## Renderer Contract (`piece-render`)

```ts
/** Draw one frame of a piece with its top-left at (x, y) pixels. It covers size.w * tileSize by size.h * tileSize. */
function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  opts: {
    x: number; y: number;
    tileSize: number;                    // px per tile
    frame?: number;                      // default 0, wrapped by frameCount
    layerRotation?: Record<string, number>; // radians per layer id, for rotating layers
  },
): void;

/** Resolve after every font in the piece is loaded, so canvas draws use it. */
function loadPieceFonts(piece: Piece): Promise<void>;
```

- No DOM access beyond the passed context and `document.fonts`, so the game can import it unchanged.
- Glyph sizes scale with `tileSize`, not with the piece size, so a glyph of size 0.5 is half a game tile tall in a 1x1 or a 3x3 piece.
- Glyphs draw with `textAlign = "center"`, `textBaseline = "middle"`, the same as the game's `drawGlyph` today.
- Google Fonts load through the CSS2 API (`fonts.googleapis.com/css2?family=...`). System fonts are used as named; if `document.fonts.check` reports one missing, the studio warns that the piece **will not render the same on other machines**.

## Tech Stack

Same stack as the game, so code moves between them easily:
- TypeScript 6 (strict), Vite 7, Vitest 5, Prettier. Versions match `../package.json`.
- No UI framework: plain DOM + canvas 2D, like the game.
- No runtime dependencies. Adding one needs approval.

## Commands

```sh
cd art-studio
npm install
npm run dev          # http://localhost:5174 (the game uses 5173)
npm test             # vitest run
npm run typecheck    # tsc --noEmit
npm run build        # tsc --noEmit && vite build
npm run format       # prettier --write .
```

## Project Structure

```
art-studio/
  SPEC.md, README.md
  index.html
  src/
    art/              # shared and pure - safe for the game to import
      types.ts        # piece-model types
      piece.ts        # create, validate, migrate, (de)serialise
      render.ts       # drawPiece
      fonts.ts        # loadPieceFonts, Google/system font helpers
      generators.ts   # scatter + bake
      rng.ts          # seeded RNG (same algorithm as the game's sim/rng.ts)
      colour.ts       # HSL/hex helpers, ColourRange sampling
      gamePalette.ts  # swatches copied from the game's render/palette.ts
    studio/           # editor UI (DOM), not imported by the game
      main.ts, state.ts, history.ts, canvasView.ts, tools/, panels/, export.ts
  tests/              # vitest, *.test.ts
  pieces/             # sample pieces (.json) for the success-criteria examples
  tasks/              # plan.md, todo.md
```

## Code Style

Matches the game: small modules, named exports, `camelCase` functions, `PascalCase` types, double quotes, a JSDoc line only where the intent isn't obvious, `ctx!` style kept out of shared code.

```ts
/** Scatter glyphs inside an area. Same seed + spec always gives the same glyphs. */
export function scatter(spec: ScatterSpec, frame: number): Glyph[] {
  const rng = createRng(spec.perFrame ? spec.seed + frame : spec.seed);
  const glyphs: Glyph[] = [];
  for (let i = 0; i < spec.count; i++) {
    const { x, y } = pointInArea(spec.area, rng);
    glyphs.push({
      char: pick(spec.chars, rng),
      x,
      y,
      size: between(spec.size, rng),
      rotation: between(spec.rotation, rng),
      colour: sampleColour(spec.colour, rng),
      font: spec.font,
      weight: spec.weight,
    });
  }
  return glyphs;
}
```

## Testing Strategy

- **Vitest unit tests** for all of `src/art/`: validation accepts good pieces and rejects bad ones with clear messages; serialise/parse round-trips; generators are deterministic per seed, stay inside their area and respect min spacing; colour sampling stays in range; sprite-sheet layout maths; `drawPiece` checked with a recording fake context (right calls, transforms, wrap copies, layer rotation about the pivot).
- **Editor logic** (history/undo, selection maths, brush spacing) lives in plain functions with unit tests; DOM wiring is thin.
- **Manual browser check** for each success-criteria example, with screenshots of the 4 sample pieces.
- Coverage: 80% lines on `src/art/**`, the same threshold the game uses for `src/sim`.

## Boundaries

- **Always:** keep `src/art/` pure (no DOM besides the passed canvas context and `document.fonts`); keep positions in tile units; bump `version` and add a migration when the piece format changes; run `npm test` and `npm run typecheck` before calling a task done; keep README.md current.
- **Ask first:** adding any dependency; changing the piece format after v1 is approved; changing anything outside `art-studio/` (including wiring it into the game).
- **Never:** touch the game's source as part of this work; commit unless asked; ship a Google Fonts API key in the repo.

## Success Criteria

1. Each of the 4 example pieces above is made in the studio, saved under `pieces/`, and reloads exactly as it was.
2. A wrapped texture shows no seam in the 3x3 tiled preview.
3. A rotating layer spins about its pivot in preview, and `drawPiece` with `layerRotation` gives the same result.
4. A 4-frame animation plays at its fps in the studio, and the sprite sheet export contains all 4 frames in order with a correct index.
5. Exporting a PNG at 20px and at 256px per tile gives the same picture at different resolutions, with a transparent background. A 3x3 piece exports at 3x the width and height of a 1x1 piece at the same scale.
6. The same generator spec and seed always produces the same glyphs (unit tested).
7. A Google Font piece renders correctly after a cold page reload (fonts load before draw); a system font that isn't available shows a warning.
8. With snapping on (e.g. 4 cells per tile), painted glyphs land exactly on cell centres; with it off, they land where clicked.
9. Undo/redo covers every edit to the piece (paint, transform, delete, layer, frame and generator changes).
10. `npm test`, `npm run typecheck` and `npm run build` pass; `src/art/` coverage is at least 80%.
11. README.md documents setup, the studio's features and the piece JSON format.

## Out of Scope (v1)

- Animated GIF/WebM export, SVG export.
- Generators beyond scatter (e.g. grid/pattern fill, noise-driven density, text along a path). The `GeneratorSpec` union leaves room to add them.
- Wiring pieces into the game (a later task, made easy by the shared renderer).
- Browsing the full Google Fonts catalogue (needs an API key). Any family can still be typed by name.
- Cloud storage or sharing.

## Decisions

Open questions from v0.1, resolved 2026-10-24:

1. **Google Fonts:** type any family name, plus a short built-in suggestion list. No API key, no catalogue browsing in v1.
2. **Multi-tile art:** pieces have `size: { w, h }` in whole tiles, default 1x1.
3. **Snapping:** optional sub-grid snapping, off by default.
4. **Game palette:** the game's palette colours are preloaded as swatches (copied into `src/art/gamePalette.ts`, not imported from the game).

## Open Questions

None.
