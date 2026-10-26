# Spec: map-editor

Status: APPROVED (2026-10-26)
Module: `map-editor`, the first of three editors. A **level** will combine three files: a `.map` file (this module), a `.wave` file and a `.loadout` file (the next two modules). Builds on `map-gen` ([`SPEC-map-gen.md`](SPEC-map-gen.md)), `tile-layers` ([`SPEC-tile-layers.md`](SPEC-tile-layers.md)) and the keep walls from `enclosures` ([`SPEC-enclosures.md`](SPEC-enclosures.md)).
Last updated: 2026-10-26 (built: panning as in game, with no drag-to-pan; the Map tab lives in the editor's toolbar)

## Objective

The team can design maps by hand. A new editor page shows a map with the game's own renderer and lets you:

- paint terrain;
- place the keeps and enemy spawns;
- drop ruins and chests;
- pre-build structures.

Designs are saved as **`.map` files** in a `maps/` folder in the repo, committed like code. A `.map` file holds the map only. Waves, starting gold and other settings belong in the `.wave` and `.loadout` files to come. Any map can be test-played from the editor in one click.

Today every map is generated from a seed, with the keep and spawn in fixed places. `.map` files make hand-made maps possible, and are the map part of the levels to come.

**Player-facing outcome:** a designer opens `/?editor`, picks **New**, and chooses size M, Endless, starting from a generated map with seed 12. The map appears. They:

1. press `4` for the Map tab and pick River, then paint a river across the middle with a 3-wide brush;
2. pick Tree and hold `Shift` while dragging to fill a forest rectangle;
3. drag the keep to the left and drag a spawn zone onto the right edge;
4. drop two chests behind the river;
5. press `1`, pick an archer tower, turn it with `R` and place it facing east.

**Save** asks for a name, and `maps/river-crossing.map` appears in the repo. **Play** starts a single-player game on that map with today's endless waves and starting gold. **Back to editor** returns to the design, unchanged. Opening the editor later lists `river-crossing` under **Open**.

## Scope

### The editor page

- **Route:** `?editor` (like `?soundtest`), in dev and in a production build. No intro, start screen or server connection.
- **Layout:** the map fills the window, drawn by the game's renderer, with the same tiles, heights, textures and glyphs. The editor's toolbar sits where the game's HUD is, and a status line shows the hovered tile, the current tool and any validation problems.
- **Camera:** the same as in game: wheel, WASD or arrow keys, `+` / `-`, the minimap and Fit. Fog is off.
- **File actions:**
  - **New:** name, size XXS to XL, Endless or PvP, blank or generated from a seed.
  - **Open:** maps from the folder, or a file from disk.
  - **Save:** into `maps/`, under the dev server only.
  - **Download:** a `.map` file; works anywhere.
  - **Play:** test-plays the map.
- **Undo / redo:** `Ctrl+Z`, then `Ctrl+Shift+Z` or `Ctrl+Y`, at least 100 steps. One brush stroke or rectangle is one step.
- **Unsaved changes:** a dot by the map's name. Leaving the page, or New / Open, asks first.

### Keys and tools

The editor uses the game's keys, and none of them means anything different in the editor:

| Key | In game | In the editor |
|---|---|---|
| WASD, arrows, `+` / `-` | Pan, zoom | Same |
| `1` / `2` / `3` | Build picker on Defence / Civic / Offence | Same: pick a structure to place |
| `R` | Turn the facing | Same, for structures that face |
| `X` | Sell tool | Eraser |
| `Esc` | Close a window, else drop the tool | Same |
| Right-click | Drop the tool | Same |
| `4` | (unused) | Picker on a **Map** tab: terrain, keep, spawn zone, ruin, chest |

`Space`, `F`, `J` and the dev keys (`E`, `U`, `M`) do nothing in the editor. Editor-only keys: `[` / `]` for brush size or the picked item's amount, `Shift` + drag to fill a rectangle, `Ctrl+Z` / `Ctrl+Y` to undo and redo, and `P` to Play.

The Map tab (`4`), picked by click like the build picker:

| Item | What it does |
|---|---|
| Terrain: ground, ford, river, sea, rock, gold rock, tree, berries | Paints while dragging. Brush size is 1, 3 or 5, set with `[` / `]`. `Shift` + drag fills a rectangle |
| Keep | Click to place a 3x3 keep centred on the tile, or drag an existing keep to move it. Endless has exactly one keep, so placing one moves it. PvP has two, placed in order: Player 1's, then Player 2's |
| Spawn zone | Drag a rectangle of spawn tiles. Endless only. Several zones are allowed |
| Ruin | Click to place a ruin. `[` / `]` sets its starting HP, 20%–100% in steps of 20% |
| Chest | Click to place a chest. `[` / `]` sets its gold, 25–200 in steps of 25 |
| Keep walls (button) | Rebuilds the starter ring of walls and a gate round each keep, as a new game has today. New maps start with them |

**Structures** (`1`–`3`) are placed as in game, with the facing from `R`, but they're free and finish building at once. Each belongs to a keep: the nearest one by default. In PvP the owner is shown with the game's owner mark.

**The eraser** (`X`) removes the top thing on a tile, in this order:
1. a structure;
2. a ruin or chest;
3. a spawn tile.

On bare terrain it paints ground. Dragging erases along the path, as the sell tool does.

**Placing rules:** placement follows the game's own rules where they apply:
- structures only on terrain they can stand on, using the base and mount layers;
- nothing on keep tiles;
- nothing but terrain in a spawn zone.

Painting terrain under something that can't stand on it removes that thing, and the status line says so.

### Validation

Checked live and shown in the status line. Problems are **errors** or **warnings**. Errors block Play, but you can still Save and Download, so work isn't lost.

- **Errors:**
  - the wrong number of keeps for the mode (Endless 1, PvP 2);
  - a keep off the map, overlapping another keep, or on terrain that isn't walkable;
  - Endless with no spawn tiles, or a spawn tile that isn't walkable;
  - no walkable route, ignoring structures, from any spawn tile to the keep (Endless) or between the two keeps (PvP);
  - a structure, ruin or chest on terrain it can't stand on.
- **Warnings:**
  - a keep within 10 tiles of a spawn tile;
  - a chest that can't be reached from the keep.

### `.map` files

- **Where:** `maps/<name>.map` at the repo root. The name is lowercase letters, digits and dashes (`river-crossing`); the editor turns "River Crossing!" into that. The next two modules use the same pattern with `.wave` and `.loadout` files.
- **Listed automatically:** a Vite plugin (`tools/maps.ts`, like `tools/musicPacks.ts`) scans the folder when the dev server starts and at build time. It reads the files itself and serves them as `virtual:maps`, so the editor's Open lists them without a server, and a production build bundles them as data. The hosted game ships with these files, and they're what players will choose from. The server build gets the same list, ready for rooms to pick a map by name later.
- **Saving:** under `npm run dev`, the plugin adds an endpoint, `POST /__maps/<name>`. It parses the body as a map and writes the file, pretty-printed so diffs read well. It refuses names that don't match the pattern and bodies over 2 MB. The endpoint only exists in the dev server; a production build hides Save, and Download does the same job.
- **Contents:** JSON, readable in a diff, with terrain as one string per row and one character per tile. Map content only, no settings:

```json
{
  "format": "keep-defence-map",
  "version": 1,
  "title": "River Crossing",
  "mode": "endless",
  "size": "M",
  "seed": 12,
  "terrain": [
    "..........TTTT..~~....",
    "......o...TTT...~~..b."
  ],
  "keeps": [{ "x": 20, "y": 50 }],
  "spawns": [{ "x": 145, "y": 40, "width": 4, "height": 20 }],
  "ruins": [{ "x": 60, "y": 30, "hp": 0.6 }],
  "chests": [{ "x": 70, "y": 52, "gold": 75 }],
  "structures": [{ "kind": "archer", "x": 30, "y": 50, "facing": "E", "keep": 0 }]
}
```

  - **`terrain`:** `.` ground, `,` ford, `~` river, `=` sea, `o` rock, `$` gold rock, `T` tree, `b` berries. There's one row per tile row of the size, and each row is as long as the map is wide.
  - **`mode`:** says what the map is built for: one keep and spawns (Endless), or two keeps (PvP).
  - **`seed`:** fixes how much each tree, rock and bush holds, so the map plays the same every time. A generated start keeps the seed it came from.
  - **`keeps[i]`:** the top-left of keep `i` (3x3). In PvP, keep 0 is Player 1's.
  - **`spawns`:** rectangles, so a strip is one line, not 80 tiles.
  - **`structures[].keep`:** the index of the keep the structure belongs to. Its owner is that keep's player; in Endless that's the shared side, as the starter walls are today. The keep walls are stored as ordinary structures, so a designer can move or remove them.
  - **Versioning:** fields the editor doesn't know are kept on load and save. A file with a newer `version` than the game knows is refused with a clear message.

### Playing a map

- **Play:** `P` or the button starts a local, single-player game on the map. `createGame(seed, { map })` builds the state from the file instead of generating it.
- **Settings for now:** until `.wave` and `.loadout` files exist, Play uses today's waves, starting gold and rules.
- **PvP maps:** start with Player 1 on keep 0 and keep 1 unowned and inert. That's enough to check the layout and walk the routes; real PvP on a map comes with levels.
- **Back to editor:** the game runs as a normal game does (HUD, building, pause, speed, game over). The **Back to editor** button ends it and returns to the editor with the design and undo history as they were.
- **Games without a map:** `createGame` without a map is unchanged: the same seed gives the same map as today.

## Out of scope

- The `.wave` and `.loadout` editors, and how a level combines the three files.
- Choosing a map or level from the start screen, or playing one online or in a room.
- Real PvP play on a map (two players), and maps for more than two players.
- Map sizes other than XXS to XL, keeps that aren't 3x3, and new terrain kinds.
- Editing a map inside a running game.
- Copy and paste of regions, mirroring, or symmetry tools.

## Data model

```ts
// src/sim/mapFile.ts (new)
export const MAP_FORMAT = "keep-defence-map";
export const MAP_VERSION = 1;

export interface MapFile {
  format: typeof MAP_FORMAT;
  version: number;
  title: string;
  mode: GameMode;
  size: MapSize;
  seed: number;
  terrain: string[];
  keeps: Point[];
  spawns: { x: number; y: number; width: number; height: number }[];
  ruins: { x: number; y: number; hp: number }[];
  chests: { x: number; y: number; gold: number }[];
  structures: { kind: StructureKind; x: number; y: number; facing: Facing; keep: number }[];
  [extra: string]: unknown; // kept as-is
}

export function parseMap(json: unknown): { map: MapFile } | { error: string };
export function serializeMap(map: MapFile): string; // stable key order, one terrain row per line
export function validateMap(map: MapFile): { errors: string[]; warnings: string[] };
export function mapFromGenerated(title: string, mode: GameMode, size: MapSize, seed: number): MapFile;
```

`GameOptions` gains `map?: MapFile`. When it's set, `createGame` takes the following from the file and skips map generation and the starter walls:
- size and mode;
- terrain, and resource amounts from the file's seed;
- keeps and spawn tiles;
- ruins, chests and structures.

The editor works on a `MapFile` directly. It draws through a `GameState` built from that file, updated only for the tiles that change.

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/mapFile.ts` (new): the format: parse, serialize, validate, and making a map file from a generated map
- `src/sim/game.ts`: `createGame` from a map file
- `src/editor/` (new): `editor.ts` (page, state, undo), `tools.ts` (each tool), `toolbar.ts` (DOM), `files.ts` (open, save, download)
- `src/ui/input.ts`: the game's keys that act on a running game (`Space`, `F`, `J`, dev keys) and its clicks are off while the editor has the map; the editor reuses the rest
- `src/main.ts`: the `?editor` route, and Play / Back to editor
- `src/styles.css`: the editor's toolbar and dialogs, in the game's existing style
- `tools/maps.ts` (new): the Vite plugin (list and save); `vite.config.ts` and the server build add it
- `maps/` (new): `.map` files, starting with one example
- Docs: README (the editor, its keys, where files go), SPEC.md, CAPABILITIES.md and `tasks/plan.md` (the three editors and levels)
- Tests: `tests/sim/mapFile.test.ts`, `tests/tools/maps.test.ts`, `tests/editor/*.test.ts` (new)

## Code style

Tools are small objects in a table, so the `.wave` and `.loadout` editors' tools can follow the same shape:

```ts
const TOOLS: Record<ToolId, EditorTool> = {
  terrain: {
    down: (ed, tile) => ed.stroke((map) => paint(map, tile, ed.terrain, ed.brushSize)),
    drag: (ed, tile) => ed.stroke((map) => paint(map, tile, ed.terrain, ed.brushSize)),
  },
  // ...
};
```

Every change to the map goes through `ed.stroke` or `ed.apply`, which records an undo step and redraws only the tiles touched.

## Testing strategy

Vitest tests, written before each change:

- **Format:**
  - serialize then parse gives back the same map, extra fields included;
  - the example file parses;
  - bad files are refused with a message naming the problem: wrong format, newer version, short rows, unknown terrain character, unknown structure kind.
- **Validation:** one test per error and warning above, on small hand-written maps.
- **Generated start:** `mapFromGenerated` for a seed, then `createGame` from it, gives the same as `createGame` with that seed today: terrain, resource amounts, ruins, chests, keeps, spawn tiles and starter walls.
- **Playing:**
  - `createGame` with a map places everything where the file says, owned as it says, with no starter walls added;
  - ticks run, and enemies walk from the map's spawns to its keep;
  - without a map, games are unchanged (the determinism test still passes).
- **Plugin:**
  - scanning a folder lists its maps by name;
  - saving writes the file;
  - names outside the pattern, oversize bodies and invalid maps are refused;
  - nothing is written outside `maps/`.
- **Editor logic:**
  - each tool changes the map as described: terrain, rectangle, keep, spawn zone, ruin, chest, structure and eraser;
  - painting under a structure removes it;
  - `1`–`4`, `R`, `X` and `Esc` do what the key table says;
  - undo and redo step back and forward through strokes.

**Browser checks:**
- design a map from scratch and from a generated map;
- save, reload and open it; download it and open it from disk;
- play it, lose, and go back to the editor;
- check every tool and key.

Coverage for `src/sim/` and `tools/` stays at 80% or more.

## Boundaries

- **Always:**
  - maps go through `parseMap` before use;
  - the editor never writes outside `maps/`;
  - numbers (brush sizes, ruin HP and chest gold steps, limits) live in config;
  - the editor's keys match the game's;
  - README and SPEC.md are updated.
- **Ask first:**
  - changing the `.map` format once maps exist in the repo (bump `version` and migrate);
  - adding settings to `.map` files;
  - letting production builds save to a server;
  - anything that changes how today's generated maps come out.
- **Never:**
  - run code from a map file;
  - let the save endpoint exist outside the dev server;
  - change `createGame` results for games without a map.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Redrawing the whole map for every brush dab on XL (48,600 tiles) | Laggy painting | The renderer already draws only on-screen tiles. The editor changes state tile by tile, and the caches (flow fields, enclosures) are only rebuilt on Play |
| `.map` is also the extension for JavaScript source maps | Tools or Vite treating them as source maps | The plugin reads them with `fs`, never through Vite's imports. A `.vscode/settings.json` entry opens them as JSON |
| The format needs to change when levels arrive | Old files break | A version number, unknown fields kept, and waves and loadouts in their own files |
| A save endpoint in the dev server writes files | A bad name could write elsewhere | Strict name pattern, fixed folder, size limit, parsed body, dev server only, tested |
| Hand-made maps break assumptions made for generated ones (keep in a corner, spawn next to the keep, no route) | Odd games, stuck enemies | Validation blocks Play on the hard cases; the game's pathing already handles walled-in keeps |
| Test-playing a PvP map alone shows little | PvP layouts are hard to judge | Accepted for now. The inert second keep still shows routes and enclosures; real PvP on maps comes with levels |

## Success criteria

1. `?editor` opens the editor. New, Open, Save, Download and Play all work under `npm run dev`; in a production build, Save is hidden and the rest work.
2. Every terrain kind, keeps, spawn zones, ruins, chests and structures can be placed, moved and removed, with undo and redo, using the game's keys.
3. Saved maps appear as readable `.map` files in `maps/` and are listed by Open without a restart.
4. A map started from a generated one plays exactly like that seed's normal game.
5. Play runs a normal game on the map, with today's settings, and Back to editor returns to the design unchanged.
6. Games without a map are unchanged.
7. `npm run typecheck`, `npm test` and `npm run build` pass, and coverage stays at 80% or more.

## Open questions

None.

## Resolved decisions (2026-10-26)

- **Home:** a separate page in the app (`?editor`), not the start screen.
- **Files:** in the repo; under the dev server, Save writes straight into the folder. Download and open from disk also work.
- **Contents:** size and terrain, keeps and spawns, ruins and chests, and starting structures.
- **Play-test:** a Play button in the editor. Choosing maps from the start screen comes with levels.
- **Keys:** the editor uses the game's keys. Structures are on the build picker's tabs (`1`–`3`), and the map pieces are on a fourth tab (`4`).
- **Settings:** none in the file. Files are `.map` files holding only the map, to be combined with `.wave` and `.loadout` files into levels. Until those exist, Play uses today's defaults.
- **Solo maps on the mode screen (asked for once the editor was built):** solo, the Endless card has a map dropdown: a new generated map, or any Endless map in `maps/` with no errors (`?solo&map=<name>` does the same). A chosen map brings its own size. Online rooms still play generated maps until `levels`.
- **Online:** the hosted game ships with its `.map` files, and players choose from those. No uploading. The client and the game server both read the same bundled set, so a room only needs to send a map's name. Wiring that up comes with levels; this module keeps the plugin's list usable from the server build too (`virtual:maps` in `vite build --ssr`).
