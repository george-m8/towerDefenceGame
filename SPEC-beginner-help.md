# Spec: beginner-help

Status: BUILT (2026-10-27)
Module: `beginner-help`, first on the roadmap ([`tasks/roadmap.md`](tasks/roadmap.md)) and in "Next up" in [`CAPABILITIES.md`](CAPABILITIES.md). Quality-of-life changes that make the game easier to pick up. Builds on the HUD and picker ([`src/ui/hud.ts`](src/ui/hud.ts)), hover info ([`src/ui/tileInfo.ts`](src/ui/tileInfo.ts)), `enclosures` ([`SPEC-enclosures.md`](SPEC-enclosures.md)) and `items-editor` ([`SPEC-items-editor.md`](SPEC-items-editor.md)).
Last updated: 2026-10-27

## Assumptions (correct these before approval)

1. Built before `balance-files`. All new text reads numbers through one place (`describeKind` below), so moving to `state.balance` later is a one-file change.
2. Mouse and keyboard first. Touch gets the clickable rotate button (below) but no long-press hover cards.
3. Changing a View toggle or a HUD stat is remembered per device (as sound settings are), so turning Info off once keeps it off. Device storage is wrapped in try/catch, and the game works without it.
4. No tutorial or guided first game in this module.

## Objective

New players (and testers starting games with only a few things to build) should be able to work out what everything does without asking. Today the Info box is hidden, the HUD shows only gold, the build picker shows a name and a cost, "R rotate" is only in the Keys panel, and the enclosure discount is only mentioned once you hover a shaded tile.

1. **On by default:** a new player sees the Info box and their income (gold per minute) without opening any menu.
2. **Hover to learn:** hovering anything in the build picker shows what it is, what it does and its numbers, before buying. Hovering a tower, building, unit or enemy on the map shows the same kind of information.
3. **One row when there's little to build:** with only a few things allowed (an `.items` file), the picker shows everything at once, grouped by section, instead of hiding most of it behind tabs.
4. **Rotating is obvious:** when the selected thing can be turned, the screen says so, and there's a button for it.
5. **Walls make things cheaper, and the game says so:** the picker, the hover info and the price label all mention the enclosure discount.
6. **One sidebar:** the Keys panel sits with the minimap and Info box in the side column, instead of on its own on the other side of the screen.

## Rules

### On by default

- The **Info** box (View menu) starts shown. Its empty text becomes "Hover anything for details".
- The HUD's stats start as **Gold**, **Income** (`+N/min`) and **Wave** (George, 2026-10-27), not Gold alone. PvP has no waves, so it shows Gold and Income.
- The **Keys** panel (`#panel`) moves from the left (under the View and Debug buttons) into the side column (`.map-side`), below the minimap and the Info box, so Map, Info and Keys are one sidebar, each shown or hidden from the View menu as now. The editor's own use of the panel moves with it.
- If the player changes either, the choice is remembered on this device and used next time (`localStorage`, wrapped in try/catch; with storage blocked, the defaults apply each visit).

### Descriptions

- Every structure and unit kind gets a one-line `description` in config, as enemy kinds already have. It's required by the type, so the compiler insists on one for every new kind. Examples:
  - Wall: "Blocks enemies. Close a ring for cheaper building inside."
  - Archer: "Fires arrows through a slit: a narrow, fixed arc. Turn it with R before placing."
  - Cannon: "Turns to fire all round. Its shot splashes nearby enemies."
  - Guardhouse: "Sends out swordsmen who hold the tiles in front of it."
  - Timber yard: "Lumberjacks chop nearby trees for gold."
- `describeKind(kind)` in a new pure module (`src/ui/describe.ts`) returns the lines for a structure, unit or enemy kind: name, description, then its numbers. The picker card, the Info box and the journal all use it, so they never disagree.

### Hover cards in the build picker

- Hovering (or focusing) a picker button shows a tooltip card next to that button, pointing at it, like a tooltip:
  - **Title:** glyph, name, full cost (and the limit, "2/5", if an `.items` file sets one).
  - **Description** line.
  - **Numbers**, by what it is:
    - Towers: damage, shots per second, range (and minimum range), splash, arc, turning speed or "fixed", e.g. `6 dmg every 1s · range 5 · 90° arc, fixed`.
    - Traps: damage and interval.
    - Income buildings and farms: gold per minute.
    - Spawners: the unit's name, how many at once, one every N seconds, and the unit's own line (HP, damage, range).
    - Every structure: HP and sight.
  - **Traits**, a few words each, worked out from its numbers and flags (never written by hand per kind), e.g. for a catapult: "Splash damage · Can't hit enemies closer than 3 tiles · Won't fire where its blast would hit your own walls". Others: "Fixed: fires through a slit", "Turns slowly", "Blocks enemies", "Enemies walk over it", "Makes gold over time".
  - **Hints**, only when they apply:
    - "R to rotate" for anything with a facing (fixed towers, traps, spawner doors).
    - "50% off inside your keep's walls, 25% inside other walls" on everything the discount applies to.
    - "Builds slower further from your keep" once build time is in play.
    - "Only on a river" for bridges, and the other placement rules already in `canBuild`'s messages.
- The card goes when the pointer leaves the picker. It never covers the picker's own buttons.

### Hover info on the map (Info box)

- **Structures:** today's lines (name, HP, range, damage, arc), plus the description line and the hints that still apply ("Sells for 12g" stays).
- **Enemies:** name and variant, HP, then the kind's description and its numbers: damage per hit, speed, what it does ("breaks through walls", "heals nearby enemies"), and its leader if it has one. Armour once enemies have it (rebalance).
- **Units:** name, owner, HP, what it's doing (today), plus the description, damage, range and armour.
- **With a tool selected** the box stays short (George, 2026-10-27): the price line, then what's on the tile by name and HP only, no descriptions, numbers or traits. Building also drops the enclosure line (the price line covers it) and the sell price; the sell tool keeps the sell price.
- The Info box never runs down over the HUD: its height is capped and a crowded tile's last lines are cut off.
- Up to 3 enemies and units are listed per tile as today. Only the first gets its full description; the rest keep one line each, so the box stays short.

### The picker: one row or three tabs

- Count the build tools this game offers (allowed by its `.items` file, sell not counted).
- **At most `PICKER.oneRowMax` (default 9):** no tabs. Every offered tool shows in one list, with a small section label (Defence, Civic, Offence) before each section that has something in it. Sell is last.
- **More than that:** three tabs as today, but a tab with nothing offered is hidden rather than disabled, and the stale "Barracks coming" title goes.
- Keys `1`, `2`, `3` still open the picker. In one-row mode they open it scrolled to that section.
- `PICKER.oneRowMax` lives in config so it can be tuned.

### Rotating

- When the selected tool can be turned (it has a facing: directional traps, fixed-arc towers, spawner doors), the HUD shows a **Rotate (R)** button beside the tool box with the current facing's arrow. Clicking it turns the facing, the same as pressing R. It also works on touch.
- The price line in the Info box adds the facing: `Archer here: 25g · facing north (R to rotate)`.
- The pointer label shows a small, dim `R ⟳` beside the price whenever a turnable tool is selected. It's always there for now, kept quiet so it doesn't get in the way (smaller and fainter than the price).

### Saying where building is cheaper

- **Picker card:** the discount hint (above).
- **Price line**, when the hovered tile has no discount and the tool could get one: `Wall here: 5g · 3g inside your keep's walls`.
- **Price line** with a discount (today): `Wall here: 3g (50% off inside the keep's walls)`, naming where the discount comes from.
- **Pointer label:** a discounted cost shows the full price struck through beside it (`5g 3g`), in green.
- The yellow and cooler shades' meaning is in the Keys panel ("Shaded: cheaper building inside walls").

## Out of scope

- A tutorial, first-game walkthrough or tips on a timer.
- Long-press hover cards on touch.
- Changing any numbers (that's `balance-files` and the rebalance).
- Translations.
- Hover cards for the stat picker or the Debug menu.

## Data model

```ts
// src/sim/config.ts
export interface StructureStats { ...existing; /** One line for hover info and the picker. */ description: string }
export interface UnitKind { ...existing; description: string }
export const PICKER = { oneRowMax: 9 };

// src/ui/describe.ts (new, pure: no DOM)
export type KindRef =
  | { type: "structure"; kind: StructureKind }
  | { type: "unit"; kind: UnitKindId }
  | { type: "enemy"; kind: EnemyKindId };
export function describeKind(ref: KindRef): { title: string; description: string; numbers: string[] };
export function buildHints(kind: StructureKind): string[]; // the same for every player and tile
/** Short words from a kind's numbers and flags: "Splash damage", "Can't hit enemies closer than 3 tiles". */
export function traits(kind: StructureKind): string[];
export function canRotate(kind: StructureKind): boolean;

// src/ui/state.ts
export function pickerLayout(offered: number): "row" | "tabs";
// createUiState(): hudStats: ["gold", "income", "wave"]; remembered choices loaded by main.ts

// src/ui/settings storage (existing per-device pattern): { infoShown, hudStats }
```

No sim or protocol changes.

## Commands

Unchanged: `npm run dev`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/config.ts`: `description` on every structure and unit kind; `PICKER`.
- `src/ui/describe.ts` (new): descriptions, numbers and hints.
- `src/ui/hud.ts`: the hover card, one-row layout, the Rotate button.
- `src/ui/state.ts`: `pickerLayout`, `canRotate`, default stats.
- `src/ui/tileInfo.ts`: description lines, enemy and unit numbers, price line with facing and discount hint.
- `src/ui/pointerLabel.ts`: struck-through price, `R ⟳` hint.
- `src/ui/journalView.ts`: uses `describeKind` for its numbers.
- `src/ui/panel.ts`: the shaded-area line in Keys.
- `src/main.ts`, `index.html`: Info shown by default; remembered View and stat choices; the Keys panel moved into `.map-side`.
- `src/styles.css`: the card, section labels, Rotate button.
- `README.md`: a short "Getting started" section matching what the game now says.
- Tests: `tests/ui/describe.test.ts` (new), additions to `tests/ui/hud.test.ts`, `tests/ui/tileInfo.test.ts`, `tests/sim/config.test.ts`.

## Code style

As `tileInfo.ts` and `hud.ts`: pure functions return lines of text, the DOM code only places them.

```ts
/** Lines for a tower's numbers, e.g. "6 dmg every 1s · range 5 · 90° arc, fixed". */
function towerNumbers(tower: TowerStats): string { ... }
```

## Testing strategy

Vitest, written first:

- **Config:** every structure and unit kind has a non-empty description (a test, as for enemy kinds).
- **describeKind:** an archer's numbers mention damage, interval, range and "fixed"; a cannon's mention splash and turning; a guardhouse's name its unit, quota and interval; an enemy's name its damage and speed.
- **Hints:** "R to rotate" for exactly the turnable kinds; the discount hint for every kind the discount applies to and none it doesn't.
- **Traits:** the catapult gets splash, minimum range and "won't fire where its blast would hit your own walls"; the archer gets "fixed"; floor spikes get "enemies walk over it"; a kind with none of those gets none.
- **Picker layout:** 9 offered gives one row, 10 gives tabs; a tab with nothing offered is hidden; sell is never counted.
- **Price line:** without a discount on the tile it names the price inside the keep's walls; with one it says where it comes from; with a turnable tool it adds the facing.
- **Defaults:** a new UI state shows gold, income and the wave; remembered choices are used when storage has them and ignored when it throws.
- Browser, by hand: a new device opens with Info and Income shown, and Map, Info and Keys in one sidebar; hover each picker item; play with `?solo&items=arrows-only` and see one row; Rotate button and R agree; discount wording in the picker, Info and the pointer label.

Coverage for `src/ui/` pure modules stays where it is (80%+ for `src/sim/` unchanged).

## Boundaries

- **Always:** one `describeKind` for the picker, Info box and journal; text short enough to read at a glance; device storage in try/catch.
- **Ask first:** a tutorial or tips that pop up by themselves; changing key bindings; hiding the Keys panel or other existing UI.
- **Never:** put numbers in description strings (they come from config, so they stay right after a rebalance); block the map with cards that can't be dismissed.

## Success criteria

1. A first visit shows the Info box and Gold, Income and Wave without touching a menu, and the player's later choices stick.
2. Hovering any picker item shows its description, numbers and the hints that apply, before buying.
3. Hovering any structure, unit or enemy on the map shows its description and numbers.
4. A game with 9 or fewer buildable kinds shows them all in one picker list; more shows tabs, with no empty tabs.
5. A turnable tool shows a Rotate button and the quiet R hint, and the button turns it.
6. Map, Info and Keys are in one sidebar.
7. The enclosure discount is mentioned in the picker card, the price line and the pointer label.
8. `npm run typecheck`, `npm test`, `npm run coverage` and `npm run build` pass.

## Resolved decisions (2026-10-27)

1. **One row for 9 or fewer** buildable kinds to start (`PICKER.oneRowMax`, tunable).
2. **The `R ⟳` hint always shows** with a turnable tool, kept small and faint.
3. **Short trait words** on picker cards ("Splash damage", "Can't hit enemies right next to it"), worked out from the numbers, rather than hand-written "good against" notes.
4. **Keys joins the sidebar** with Map and Info.
5. **Picker hover info is a tooltip** next to the hovered button.

## Open questions

None yet.
