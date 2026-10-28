# Tasks: qol-update

Spec: [`SPEC-qol-update.md`](../../specs/SPEC-qol-update.md) · Plan: [`plan.md`](../plan.md) ("Quality of life: qol-update") · Roadmap: [`roadmap.md`](../roadmap.md)

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests read their numbers from config (`STRUCTURES`, `SELL_REFUND`), never repeat them. Pure helpers are tested without a DOM; the DOM code only places what they return.

## Task 1: Gate on your own wall

With the Gate tool, a click (or paint) on your own wall with no tower on it refunds the wall as if sold and places a gate with its normal build time. One helper finds the wall a build would replace; `canBuild`, the `build` command and the price line all use it.

- [ ] A gate on your own wall (built or unfinished) succeeds; gold changes by exactly `refundFor(wall) - priceAt(gate)`; the base is a gate with `buildLeft` set; painting a row of walls turns them all
- [ ] Refused with "Sell the tower first" (tower on it), "That wall belongs to <name>" (rival), "Can't put a gate on a ruin", and "Not enough gold" counting the refund; any other kind on a wall is still "Tile is occupied"
- [ ] The price line on a wall tile reads e.g. "Gate 15g (wall refunds 2g)"; the determinism test still passes

Files: `src/sim/grid.ts`, `src/sim/game.ts`, `src/sim/economy.ts` (if the helper lives there), `src/ui/tileInfo.ts`, `tests/sim/gateOnWall.test.ts` (new). Size: M. Depends on: none.

## Task 2: Towers, Units and Civic tabs, with subtitles

`BuildTab` becomes `towers | units | civic` (keys 1, 2, 3); `ToolDef` gains a `group` subtitle; `TOOLS` is reordered to the spec's table (Civic: forager hut before timber yard). The picker shows a small subtitle above each group, hidden when its items are all ruled out; the one-list layout shows subtitles under the tab headings. The items editor and editor toolbar follow.

- [ ] `toolsInTab` gives the spec's table for each tab, in order; every buildable kind is in exactly one tab and group; `Digit1`-`Digit3` map to towers, units, civic
- [ ] Subtitles show in the picker (tabs and one-list layouts); a group with nothing offered hides its subtitle (`?solo&items=arrows-only`)
- [ ] Items editor and map editor toolbar show the new tabs; `tests/editor/keys.test.ts` stays green

Files: `src/ui/state.ts`, `src/ui/hud.ts`, `src/styles.css`, `src/editor/toolbar.ts`, `tests/ui/hud.test.ts` (plus the `toolsInTab` lines in `tests/sim/guards.test.ts`, `tests/sim/resources.test.ts`). Size: M. Depends on: none.

## Task 3: Tabs at the bottom of the picker

The tab bar moves below the item list, sticky at the bottom, and the picker grows upwards from a fixed bottom edge.

- [ ] Switching between Towers, Units and Civic leaves the tab bar in the same place on screen
- [ ] With the picker scrolling (short window), the tabs stay visible at the bottom and don't cover the last item
- [ ] The one-list layout is unchanged

Files: `src/ui/hud.ts`, `src/styles.css`. Size: S. Depends on: 2.

## Checkpoint A: after Tasks 1-3
- [ ] Standard verification passes
- [ ] By hand: gate on a keep wall, and the refusals; the new tabs and subtitles; tab bar stays still
- [ ] Review with George before the keyboard work

## Task 4: Picker open state and item numbers

`ui.pickerOpen` becomes the source of truth for the build picker (the HUD reads and writes it; clicking the tool box, picking, or clicking away all set it). A pure `toolNumbers(offered)` numbers each tab's offered items 1-9, 0, none past the 10th; the numbers show as a `<kbd>` on each item. One-list sections number from 1 each. Sell keeps X.

- [ ] `toolNumbers`: 12 tools give 1-9, 0 and two blanks; tools not offered are skipped; sell is never numbered
- [ ] Every offered item in the picker shows its number; one-list sections each start at 1
- [ ] Opening and closing by mouse works as before, now through `ui.pickerOpen`

Files: `src/ui/state.ts`, `src/ui/hud.ts`, `tests/ui/hud.test.ts`. Size: S. Depends on: 3.

## Task 5: Number keys and Esc

A pure `pickerKey(ui, code, offered)` returns what a key does; `input.ts` applies it. Closed: `1`-`3` open that tab (or highlight that section in the one-list layout), other digits nothing. Open: `1`-`0` pick that item, put it in hand, and close; a number with no item does nothing. `Esc` closes the picker if open (tool stays), else drops the tool (after any window). Game only, not with Cmd/Ctrl, not while typing.

- [ ] `pickerKey` cases: closed + `Digit1` opens Towers; open + `Digit1` picks the tab's first item and closes; open + `Digit3` on a 2-item tab does nothing; open + `Escape` closes and keeps the tool; closed + `Escape` drops the tool
- [ ] In the browser `1 1` gives a wall, `1 2` a gate, `2 1` a guardhouse, `3 1` a house; a mouse-opened tab takes numbers too
- [ ] The one-list layout highlights the chosen section and numbers within it

Files: `src/ui/state.ts` (or a small `src/ui/pickerKeys.ts`), `src/ui/input.ts`, `src/ui/hud.ts`, `tests/ui/pickerKeys.test.ts` (new). Size: M. Depends on: 4.

## Checkpoint B: after Tasks 4-5
- [ ] Standard verification passes
- [ ] By hand: build a short wall, gate and tower line from the keyboard only; Esc twice backs right out
- [ ] Map editor keys still work

## Task 6: Full-screen map

An enlarge button on the minimap box opens a full-window overlay with its own canvas, drawn by a second `createMinimap` at the largest whole-number scale that fits (pure `fullMapScale(mapW, mapH, winW, winH)`, never below 1). It updates live, follows Q, and click or drag moves the view and keeps it open. × or `Esc` (through the main Escape hook, with the journal) closes it; opening the journal or settings closes it first.

- [ ] `fullMapScale`: 42x28 in 1280x800 gives 30; a map bigger than the window gives 1
- [ ] Opens from the button; shows the flat pixel map with fog, tints, enemies and chests as pixels, and the view outline; updates live
- [ ] Click moves the view and it stays open; × and `Esc` close it

Files: `index.html`, `src/styles.css`, `src/main.ts`, `src/ui/minimap.ts`, `tests/ui/minimap.test.ts` (new or existing). Size: M. Depends on: none.

## Task 7: Zooming in closes the full-screen map

Wheel up over the big map centres the view on the tile under the pointer, then closes it. `+` (and a pinch) closes it too. Wheel down does nothing.

- [ ] Wheel up over a spot lands the normal view centred there, zoomed one step
- [ ] `+` / `NumpadAdd` while open closes it; `-` and wheel down leave it open

Files: `src/ui/input.ts`, `src/main.ts`, `src/ui/minimap.ts`. Size: S. Depends on: 6.

## Task 8: Keys panel and docs

- [ ] The Keys panel lists "1-3 then 1-0 build", "Esc close menu / drop tool", and the enlarge button
- [ ] `README.md` controls and `docs/CAPABILITIES.md` describe gates on walls, the new tabs, the shortcuts and the full-screen map
- [ ] Roadmap row `1b` marked built

Files: `src/ui/panel.ts`, `README.md`, `docs/CAPABILITIES.md`, `tasks/roadmap.md`. Size: S. Depends on: 1-7.

## Checkpoint C: complete
- [ ] Standard verification passes
- [ ] Every success criterion in the spec checked by hand, including online Co-op gate-on-wall for both players
- [ ] Review with George before merge
