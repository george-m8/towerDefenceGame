# Tasks: map-editor

Spec: [`SPEC-map-editor.md`](../SPEC-map-editor.md) · Plan: [`plan.md`](plan.md) ("Editors and levels: map-editor")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests read their numbers from config, never repeat them.

## Task 1: The `.map` format

`src/sim/mapFile.ts`: `MapFile`, `parseMap`, `serializeMap`, `validateMap`. Editor numbers (brush sizes, ruin HP and chest gold steps, size limit) in `MAP_EDITOR` in config.

- [x] Serialize then parse gives back the same map, extra fields included
- [x] Bad files are refused with a message naming the problem: wrong format, newer version, wrong row count or length, unknown terrain character, unknown structure kind, bad size or mode
- [x] One test per validation error and warning in the spec

Files: `src/sim/mapFile.ts`, `src/sim/config.ts`, `tests/sim/mapFile.test.ts`. Size: M. Depends on: none.

## Task 2: A game from a map

`createGame(seed, { map })` builds the state from the file. `mapFromGenerated(title, mode, size, seed)` turns a generated map into a file.

- [x] A map from a generated seed gives the same game as that seed today: terrain, resource amounts, ruins, chests, keeps, spawn tiles, starter walls
- [x] Everything goes where the file says, owned as it says, with no starter walls added
- [x] Enemies walk from the map's spawns to its keep
- [x] A PvP map starts with Player 1 on keep 0
- [x] Games without a map are unchanged (determinism test untouched)

Files: `src/sim/mapFile.ts`, `src/sim/game.ts`, `tests/sim/mapFile.test.ts`. Size: M. Depends on: 1.

Built: `mapFromGenerated` lives in `game.ts` (it calls `createGame`), on top of `mapFromGame(state, title, size)` in `mapFile.ts`, so the format module never imports the game. Structures from a map carry `keep` (their keep's index); `assignKeeps` gives them that keep's player, as it does the starter walls.

## Task 3: Map files on disk

`tools/maps.ts`: lists `maps/*.map` as `virtual:maps` (client and server builds); under the dev server, `POST /__maps/<name>` saves one. An example map in `maps/`.

- [x] Scanning a folder lists its maps by name, parsed
- [x] Saving writes a pretty file; bad names, oversize bodies and invalid maps are refused; nothing is written outside the folder
- [x] The example map parses and validates with no errors

Files: `tools/maps.ts`, `vite.config.ts`, `src/virtual-modules.d.ts`, `maps/`, `tests/tools/maps.test.ts`. Size: M. Depends on: 1.

Built: `GET /__maps` lists the maps on disk now, so the editor's Open sees a save at once; a changed map only refreshes `virtual:maps` for the next import and never reloads the page (that would lose the editor's undo history). `.vscode/` is gitignored, so instead of a settings file the README says to open `.map` as JSON. `mapName` (title to file name) and `MAP_NAME_PATTERN` live in `mapFile.ts`. Checked against a live dev server: list, save, a `../` name refused.

## Task 4: Editor model

`src/editor/model.ts`: the editing operations on a `MapFile` and an undo history. No DOM.

- [x] Terrain brush (1, 3, 5) and rectangle fill; painting under something that can't stand there removes it
- [x] Keep: place and move (Endless one, PvP two in order), keep walls rebuilt on request
- [x] Spawn zones added and erased; ruins and chests placed with their amounts
- [x] Structures placed by the game's terrain and layer rules, with facing and nearest keep
- [x] Eraser: structure, then ruin or chest, then spawn tile, else ground
- [x] Undo and redo step through strokes, 100 deep

Files: `src/editor/model.ts`, `tests/editor/model.test.ts`. Size: L. Depends on: 1, 2.

Built: every edit returns `{ map, note? }`; the note goes to the status line ("Removed a wall and a chest that couldn't stand there", "Keeps can't overlap"). Placing a keep or a spawn zone puts ground under it and clears what was there. Rebuilding the keep walls runs the game's own `placeKeepWalls` on a scratch game, so the ring is exactly a new game's. `ringTiles` takes just a keep's position and size now.

## Task 5: Editor page

`?editor` route; the map drawn by the game's renderer with the game's camera; picker tabs `1`–`3` (structures) and `4` (Map); `R`, `X`, `Esc`, right-click as in game; `[` / `]`, `Shift`+drag, undo keys; a status line with the hovered tile, the tool and validation.

- [x] Key handling matches the spec's table (tested on the key-to-action function)
- [x] Browser: paint, place and erase everything with mouse and keys

Files: `src/editor/editor.ts`, `src/editor/toolbar.ts`, `src/main.ts`, `src/styles.css`, `tests/editor/keys.test.ts`. Size: L. Depends on: 4.

Built: the editor reuses the game's input handler for the keys they share (`bindInput` gained `playing()`, false while editing, which turns off `Space`, `F`, `J`, the dev keys and game clicks); its own keys are `keys.ts`. The map is drawn through a scratch game rebuilt at most once a frame when the map changes (9 ms on M, 20 ms on XL); validation was sped up to 2 ms on M, 4 ms on XL so it runs on every change. Panning is the game's (keys, wheel, minimap): the game has no drag-to-pan, so neither does the editor (spec updated). The Map tab lives in the editor's toolbar, not `ui/state.ts`. Dragging a keep clears only where it ends up. Browser-checked headless (Chrome over DevTools): every tool and key, the picker tabs, Esc, undo.

## Task 6: File dialogs

New (title, size, mode, blank or generated with a seed), Open (folder list or a file from disk), Save (dev only), Download; the unsaved dot and the leave prompt.

- [x] Titles become names (`River Crossing!` → `river-crossing`)
- [x] Browser: new, save, open; Save hidden in a production build (headless)
- [ ] Browser, by hand: reload with unsaved changes asks first; Download, then open that file from disk

Files: `src/editor/files.ts`, `src/editor/toolbar.ts`, `tests/editor/files.test.ts`. Size: M. Depends on: 3, 5.

Built: in dev, Open asks the server for the list (`GET /__maps`), so a map saved a moment ago is there; a build lists the bundled maps. `?editor=<name>` opens `maps/<name>.map` directly. Browser-checked headless: New (blank, and a generated PvP S map), Open from the list, Save with the name dialog (the title's unsaved dot goes), and in a production build Save is hidden, the endpoint answers nothing (POST 404) and the bundled example opens.

## Task 7: Play and back

`P` or Play starts a local single-player game on the map with today's settings; Back to editor returns with the design and undo history intact. Play is blocked while there are errors.

- [x] Browser: play a map, go back; the design is unchanged and undo still works (headless)
- [x] Browser, by hand: lose a game on a map (Restart replays it), then go back

Files: `src/main.ts`, `src/editor/editor.ts`. Size: M. Depends on: 2, 5.

Built: Play makes a local session from the map (`createLocalSession` takes `map`; restarting after game over replays the same map). The game's own controls show while playing, with Back to editor at the top; the editor's are hidden. Browser-checked headless: Play blocked while there are errors; play, Back to editor, design and undo intact.

## Task 8: Docs and coverage

- [x] README: the editor, its keys, where `.map` files go; SPEC.md "Since `map-editor`"; CAPABILITIES and plan statuses
- [x] Coverage for `src/sim/` and `tools/` stays at 80% or more

Files: `README.md`, `SPEC.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: all.

Built: lines covered 98% overall, `src/sim/mapFile.ts` 98%, `tools/` 80% (`tools/maps.ts` 85%; the rest is the dev server's file watcher, checked against a live server). Under `npm run coverage` the XL timing tests in `guards` and `units` fail on `main` too (coverage slows the code they time); they pass under `npm test`. The README's terrain table now shows the tree and berry glyphs from the Unifont change.
