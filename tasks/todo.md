# Tasks: beginner-help

Spec: [`SPEC-beginner-help.md`](../SPEC-beginner-help.md) · Plan: [`plan.md`](plan.md) ("Beginner help: beginner-help") · Roadmap: [`roadmap.md`](roadmap.md)

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests read their numbers from config and never repeat them. Text is built by pure functions and tested without a DOM; the DOM code only places it.

## Task 1: Descriptions and `describeKind`

Every structure and unit kind gets a one-line `description` in config (required by the type, as enemy kinds already have). `src/ui/describe.ts` (new, no DOM) gives a kind's title, description and number lines, its trait words, and its build hints, for structures, units and enemies.

- [x] Every structure and unit kind has a non-empty description, and none of them contain digits (numbers come from config)
- [x] `describeKind` number lines: an archer's mention damage, interval, range and "fixed"; a cannon's splash and turning; a guardhouse's its unit, quota and interval, with the unit's HP, damage and range; an enemy's damage and speed
- [x] `traits`: the catapult gets "Splash damage", its minimum range and "Won't fire where its blast would hit your own walls"; the archer "Fixed: fires through a slit"; floor spikes "Enemies walk over it"; walls "Blocks enemies"; houses "Makes gold over time"
- [x] `canRotate` is true for exactly the kinds with a facing (fixed-arc towers, directional traps, spawner doors); `buildHints` gives "R to rotate" for those, the enclosure discount line for every kind the discount applies to, and the placement rule for bridges

Files: `src/sim/config.ts`, `src/ui/describe.ts`, `tests/ui/describe.test.ts`, `tests/sim/config.test.ts`. Size: M. Depends on: none.

Built: the description test lives in `tests/ui/describe.test.ts` with the rest. `buildHints` takes only the kind: the discount and build-time hints are the same everywhere (the price line says what this tile costs). Gates have no facing, so they don't rotate.

## Task 2: Hover info on the map

The Info box uses `describeKind`: structures add their description and traits; the first enemy and unit on a tile get their description and numbers (others keep one line each). The journal's numbers come from `describeKind` too. The empty Info box says "Hover anything for details".

- [x] Hovering a tower lists today's lines plus its description and traits; "Sells for" stays
- [x] The first enemy on a tile shows name and variant, HP, description, damage, speed and its leader; a second and third are one line each; "...and N more" is unchanged
- [x] The first unit shows owner, HP, activity (as today), description, damage, range and armour
- [x] Journal entries show the same numbers as the Info box for the same kind

Files: `src/ui/tileInfo.ts`, `src/ui/journalView.ts`, `src/main.ts` (empty text), `tests/ui/tileInfo.test.ts`. Size: M. Depends on: 1.

Built: an enemy's numbers in the Info box are its own (damage, speed and bounty after its variant and wave), not the kind's. The journal's numbers line is `describeKind`'s, joined with ` · `.

## Task 3: Price line and pointer label

The price line names where the discount comes from, or what the price would be inside the keep's walls; with a turnable tool it adds the facing. The pointer label shows a discounted price beside the full one struck through, and a small faint `R ⟳` whenever the tool can be turned.

- [x] No discount on the tile: `Wall here: 5g · 3g inside your keep's walls` (for kinds the discount applies to)
- [x] With a discount: `Wall here: 3g (50% off inside the keep's walls)`, or "inside walls" for an outer enclosure
- [x] Turnable tool: `· facing north (R to rotate)` added
- [x] `pointerTags` carries the full price when discounted and a rotate flag; the label draws them (struck-through full price, faint `R ⟳`)

Files: `src/ui/tileInfo.ts`, `src/ui/pointerLabel.ts`, `src/render/canvas.ts` (if the label is drawn there), `tests/ui/tileInfo.test.ts`, `tests/ui/pointerLabel.test.ts`. Size: M. Depends on: 1.

Built: the label is HTML (`pointerLabel.ts`), so `canvas.ts` wasn't touched. Browser-checked (Checkpoint A): wall, archer and keep-enclosure hover lines, the struck-through price and the faint `R ⟳`.

## Checkpoint A: after Tasks 1-3

- [x] All tests pass; typecheck and build clean
- [x] Browser: hover a tower, an enemy and a unit; place a wall inside and outside the keep's walls; select an archer and see the faint `R ⟳`

## Task 4: Tooltip cards in the build picker

Hovering or focusing a picker button shows a card next to it, pointing at it: glyph, name, full cost and limit, description, numbers, traits and hints. It goes when the pointer leaves the picker and never covers the picker's buttons.

- [ ] `pickerCard(state, kind, viewer)` (pure) returns the card's sections in order; tested for a tower, a spawner, a trap and a limited kind (`2/5`)
- [ ] Browser: every picker item shows its card; the card stays clear of the buttons at the picker's edges; keyboard focus shows it too

Files: `src/ui/describe.ts`, `src/ui/hud.ts`, `src/styles.css`, `tests/ui/hud.test.ts`. Size: M. Depends on: 1.

## Task 5: One list or three tabs

With `PICKER.oneRowMax` (9) or fewer buildable kinds offered (sell not counted), the picker has no tabs: one list with a section label before each section that has something in it, sell last. With more, the three tabs as today, with empty tabs hidden (the "Barracks coming" title goes). `1`, `2`, `3` open the picker on that tab, or scrolled to that section.

- [ ] `pickerLayout(offered)`: 9 gives `"row"`, 10 gives `"tabs"`; offered counts follow the items file
- [ ] A tab with nothing offered is hidden
- [ ] Browser: `?solo&items=arrows-only` shows one list; a game with no items file shows tabs

Files: `src/sim/config.ts` (`PICKER`), `src/ui/state.ts`, `src/ui/hud.ts`, `src/styles.css`, `tests/ui/hud.test.ts`. Size: M. Depends on: none.

## Task 6: Rotate button

With a turnable tool selected, the HUD shows a Rotate (R) button beside the tool box, with the current facing's arrow. Clicking it turns the facing exactly as R does.

- [ ] The button shows only for tools where `canRotate` is true
- [ ] Clicking it and pressing R give the same facing (tested on the shared rotate function)
- [ ] Browser: click to turn an archer before placing; touch-sized

Files: `src/ui/hud.ts`, `src/ui/state.ts`, `src/styles.css`, `tests/ui/hud.test.ts`. Size: S. Depends on: 1.

## Checkpoint B: after Tasks 4-6

- [ ] All tests pass; typecheck and build clean
- [ ] Browser: picker cards for every tab, one-list layout with an items file, the Rotate button

## Task 7: Shown by default, and remembered

The Info box starts shown and the HUD stats start as Gold and Income. Changes to the View toggles and HUD stats are saved per device (`src/ui/viewPrefs.ts`, the same load and save pattern as `journal.ts`, every storage call in try/catch) and used next time.

- [ ] A new UI state shows gold and income; the Info box starts visible
- [ ] Saved choices are used when storage has them; storage that throws or holds junk gives the defaults
- [ ] Browser: turn Info off, reload, it stays off; clear site data, it's back on

Files: `src/ui/state.ts`, `src/ui/viewPrefs.ts`, `src/main.ts`, `index.html`, `tests/ui/viewPrefs.test.ts`. Size: M. Depends on: none.

## Task 8: Keys in the sidebar

The Keys panel moves into the side column (`.map-side`), below the minimap and Info, so Map, Info and Keys are one sidebar, each toggled from View as now. The editor's use of the panel moves with it. Keys gains the line "Shaded: cheaper building inside walls".

- [ ] The Keys panel is in `.map-side`; View still shows and hides it
- [ ] Browser: in a game and in the map editor, the sidebar holds Map, Info and Keys, nothing overlaps at 1280x720 and on a narrow window

Files: `index.html`, `src/styles.css`, `src/ui/panel.ts`, `src/editor/editor.ts` (if it places the panel). Size: S. Depends on: none.

## Task 9: Docs

- [ ] README: a short "Getting started" section matching what the game now shows (hover for details, R to rotate, cheaper inside walls)
- [ ] SPEC.md "Since `beginner-help`"; SPEC-beginner-help status; roadmap, CAPABILITIES and plan statuses
- [ ] Coverage for `src/sim/` stays at 80% or more

Files: `README.md`, `SPEC.md`, `SPEC-beginner-help.md`, `tasks/roadmap.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: all.

## Checkpoint C: done

- [ ] Every success criterion in the spec checked in the browser
- [ ] Review with George before merge
