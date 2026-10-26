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

`tools/maps.ts`: lists `maps/*.map` as `virtual:maps` (client and server builds); under the dev server, `POST /__maps/<name>` saves one. An example map in `maps/`; `.vscode/settings.json` opens `.map` as JSON.

- [ ] Scanning a folder lists its maps by name, parsed
- [ ] Saving writes a pretty file; bad names, oversize bodies and invalid maps are refused; nothing is written outside the folder
- [ ] The example map parses and validates with no errors

Files: `tools/maps.ts`, `vite.config.ts`, `src/virtual-modules.d.ts`, `maps/`, `.vscode/settings.json`, `tests/tools/maps.test.ts`. Size: M. Depends on: 1.

## Task 4: Editor model

`src/editor/model.ts`: the editing operations on a `MapFile` and an undo history. No DOM.

- [ ] Terrain brush (1, 3, 5) and rectangle fill; painting under something that can't stand there removes it
- [ ] Keep: place and move (Endless one, PvP two in order), keep walls rebuilt on request
- [ ] Spawn zones added and erased; ruins and chests placed with their amounts
- [ ] Structures placed by the game's terrain and layer rules, with facing and nearest keep
- [ ] Eraser: structure, then ruin or chest, then spawn tile, else ground
- [ ] Undo and redo step through strokes, 100 deep

Files: `src/editor/model.ts`, `tests/editor/model.test.ts`. Size: L. Depends on: 1, 2.

## Task 5: Editor page

`?editor` route; the map drawn by the game's renderer with the game's camera; picker tabs `1`–`3` (structures) and `4` (Map); `R`, `X`, `Esc`, right-click as in game; `[` / `]`, `Shift`+drag, undo keys; a status line with the hovered tile, the tool and validation.

- [ ] Key handling matches the spec's table (tested on the key-to-action function)
- [ ] Browser: paint, place and erase everything with mouse and keys

Files: `src/editor/editor.ts`, `src/editor/toolbar.ts`, `src/main.ts`, `src/styles.css`, `tests/editor/keys.test.ts`. Size: L. Depends on: 4.

## Task 6: File dialogs

New (title, size, mode, blank or generated with a seed), Open (folder list or a file from disk), Save (dev only), Download; the unsaved dot and the leave prompt.

- [ ] Titles become names (`River Crossing!` → `river-crossing`)
- [ ] Browser: new, save, reload, open; download and open from disk; Save hidden in a production build

Files: `src/editor/files.ts`, `src/editor/toolbar.ts`, `tests/editor/files.test.ts`. Size: M. Depends on: 3, 5.

## Task 7: Play and back

`P` or Play starts a local single-player game on the map with today's settings; Back to editor returns with the design and undo history intact. Play is blocked while there are errors.

- [ ] Browser: play a map, lose, go back; the design is unchanged and undo still works

Files: `src/main.ts`, `src/editor/editor.ts`. Size: M. Depends on: 2, 5.

## Task 8: Docs and coverage

- [ ] README: the editor, its keys, where `.map` files go; SPEC.md "Since `map-editor`"; CAPABILITIES and plan statuses
- [ ] Coverage for `src/sim/` and `tools/` stays at 80% or more

Files: `README.md`, `SPEC.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: all.
