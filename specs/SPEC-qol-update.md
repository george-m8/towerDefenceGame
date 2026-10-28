# Spec: qol-update

Status: APPROVED (2026-10-28)
Module: `qol-update`, next on the roadmap ([`tasks/roadmap.md`](../tasks/roadmap.md)). Small quality-of-life changes to building and the minimap. Builds on the build picker ([`src/ui/hud.ts`](../src/ui/hud.ts), [`src/ui/state.ts`](../src/ui/state.ts)), the keyboard ([`src/ui/input.ts`](../src/ui/input.ts)), the minimap ([`src/ui/minimap.ts`](../src/ui/minimap.ts)) and building rules ([`src/sim/grid.ts`](../src/sim/grid.ts), [`src/sim/game.ts`](../src/sim/game.ts)).
Last updated: 2026-10-28

## Assumptions (correct these before approval)

1. **Gate on a wall = sell the wall + build a gate, in one click.** The player gets the wall's usual refund (`refundFor`) and pays the gate's usual price for that tile. No new discount.
2. **Only your own walls.** Not a rival's wall, not a ruin, not the keep. A wall with a tower on it is refused ("Sell the tower first"): gates can't carry towers, and silently destroying a tower is worse than one more click.
3. **The gate builds like any other gate.** The wall goes at once and the new gate takes its normal build time. Until it's built it doesn't close the ring (today's rule for an unbuilt gate), so the enclosure discount pauses for that short time (George, 2026-10-28: fine, keep it simple).
4. **Walls, gates, bridges and the watchtower go in the Towers tab**, under their own "Walls" subtitle, listed first so `1 1` is still a wall. They don't hurt enemies, so they don't strictly fit "Towers", but they're defences and every tab has room.
5. **Items past the 10th in a tab get no number** and are mouse-only (George, 2026-10-28). After the regroup no tab has more than 9, so this only matters later (`siege-towers` would take Towers to 12).
6. **Keyboard shortcuts are for the game only.** The map editor keeps its own keys (its `Digit4` Maps tab and so on), though its toolbar and the items editor show the new tabs, since they share `BUILD_TABS`.
7. **The full-screen map doesn't pause the game** (online games can't pause for one player anyway).

## Objective

Building and getting around should take fewer clicks, and the build menu should stay still under the mouse.

1. **Gates on walls:** turning a wall into a gate is one click with the Gate tool, not sell then build.
2. **Clearer tabs:** the picker's tabs become Towers, Units and Civic, with small subtitles inside, so it's obvious where things are.
3. **Tabs that stay put:** the tabs sit at the bottom of the picker, by the tool button, so they don't jump when a tab's list is longer or shorter.
4. **A full-screen map:** an enlarge button on the minimap opens the same simple pixel map filling the screen, until the player closes it or zooms in.
5. **Build from the keyboard:** `1` then `1` picks a wall; `Esc` backs out.

## Rules

### Gates on walls

- With the Gate tool, clicking (or painting over) one of **your own walls** with nothing mounted on it replaces it with a gate.
- The wall is refunded as if sold (half what was paid, scaled by its condition), then the gate is paid for and placed with its usual build time. The price label shows the net cost on a wall tile, e.g. "Gate 15g (wall refunds 2g)".
- Refused with a message, as other refusals are:
  - a tower on the wall: "Sell the tower first"
  - a rival's wall: "That wall belongs to <name>"
  - a ruin: "Can't put a gate on a ruin"
  - not enough gold after the refund: "Not enough gold"
- An unfinished wall can be replaced too, refunded on what was paid, as selling it would be.
- Works in Endless, Co-op and PvP, through the normal `build` command, so the server and replays need no new command.
- Out of scope: a wall over a gate (sell it first, as now), and any other base replacing another.

### Tabs and subtitles

The three tabs, in order, with their keys. Items keep today's order within each subtitle.

| Key | Tab | Subtitle | Items |
|---|---|---|---|
| `1` | Towers | Walls | wall, gate, bridge, watchtower |
| | | Towers | archer, cannon, catapult, floor spikes, wall spikes |
| `2` | Units | Static | guardhouse, archery post, paladin hall |
| | | Exploring | scout camp, barracks, archery range |
| `3` | Civic | (none) | house, shop, farmhouse, farmland, forager hut, timber yard, mine |

Order within a group: Walls and Towers as today (gate sits next to wall; towers before traps). Units by cost. Civic: town buildings, then farming, then the gatherers by cost (forager hut moves up from last). George, 2026-10-28: moving items within a section is fine where it's logical.

- **Towers:** anything static that hurts enemies (and, by assumption 4, the walls they stand on).
- **Units:** anything that sends out units. "Static" ones guard the tiles in front of them; "Exploring" ones go out into the map.
- A subtitle is a small, quiet label above its group, like the one-list section labels from `beginner-help`. A subtitle whose items are all ruled out by an `.items` file is hidden.
- The one-list layout (9 or fewer kinds offered) keeps its tab-name headings and shows the subtitles under them too.
- Internal ids change from `defence` / `civic` / `offence` to `towers` / `units` / `civic`. No saved files store tab ids, so nothing old needs reading.

### Tabs at the bottom

- In the tabs layout the tab bar sits at the **bottom** of the picker, just above the HUD's tool button, and stays there when the list scrolls (sticky bottom).
- The picker grows upwards from a fixed bottom edge, so the tabs are in the same place on screen whichever tab is open.

### Full-screen map

- An **enlarge** button on the minimap box opens it. It fills the window over the game, with a **×** button in a corner.
- It's the **same simple pixel map as the minimap**, just bigger: one flat colour per tile (no glyphs, shadows, lights or textures), through the fog, with enclosure tints; each visible enemy and chest is one tile-sized pixel; the view outline shows. Scaled by the largest **whole number** of screen pixels per tile that fits, centred, `image-rendering: pixelated`.
- It updates live while open, and follows the view's turn (Q), as the minimap does.
- Click or drag on it moves the view there, as on the minimap, and it **stays open**.
- It closes on: **×**, **`Esc`**, or **zooming in** (mouse wheel up over it, `+`, or a pinch). Zooming with the wheel centres the view on the tile under the pointer first, so you land where you were looking. Zooming out does nothing (it's already the whole map).
- Opening another window closes it first.

### Build menu shortcuts

Numbering:

- Each tab's offered items are numbered `1` to `9`, then `0`, straight through its subtitles in the order shown, skipping any the game doesn't offer. The number shows on the item as a `<kbd>`, where the limit or key goes today.
- Items past the 10th have no number. Sell keeps `X` and isn't numbered.
- In the one-list layout each tab's section is numbered from 1 on its own.

Keys (game only, not while typing in a text field, not with Cmd or Ctrl held):

| Picker | Key | Does |
|---|---|---|
| Closed | `1` `2` `3` | Opens the picker on Towers, Units or Civic. In the one-list layout it opens the list and highlights that section. A tab with nothing offered: nothing happens (as today). |
| Closed | `4`-`9`, `0` | Nothing. |
| Open | `1`-`9`, `0` | Picks that item in the open tab (or highlighted section), puts it in hand and closes the picker. A number with no item: nothing. |
| Open | `Esc` | Closes the picker. The tool in hand stays. |
| Closed | `Esc` | Drops the tool in hand (as today, after closing any window). |

- So `1 1` is a wall, `1 2` a gate, `1 5` an archer, `2 1` a guardhouse, `3 1` a house. A wrong key is fixed by picking something else or pressing `Esc`.
- A tab opened with the mouse takes numbers the same way.
- With the picker open, `1`-`3` pick items and never switch tabs. To change tab, click it, or `Esc` then the new tab's number.
- The picker's open state moves into `UiState` (today it's only the DOM's `hidden`), so `input.ts` knows which row of the table applies.

### Keys panel and docs

- The Keys panel lists "1-3 then 1-0: build", "Esc: close menu / drop tool", and mentions the enlarge button.
- `README.md` controls and `docs/CAPABILITIES.md` are updated to match.

## Tech stack

TypeScript, Vite, Vitest, canvas 2D, plain DOM (no framework). No new dependencies.

## Commands

```
Dev:        npm run dev
Test:       npm test
Typecheck:  npm run typecheck
Build:      npm run build
```

## Project structure

```
src/sim/grid.ts       canBuild: gate on own wall allowed
src/sim/game.ts       build command: refund and remove the wall, then place the gate
src/ui/state.ts       new tabs, subtitles, pickerOpen in UiState; numbering and key helpers (pure)
src/ui/input.ts       digit, Escape and zoom-closes-big-map handling
src/ui/hud.ts         tab bar at the bottom, subtitles, item numbers, section highlight
src/ui/minimap.ts     drawing shared with the full-screen map
src/main.ts, index.html, src/styles.css   enlarge button, full-screen window
src/editor/toolbar.ts, src/editor/itemsEditor.ts   follow the renamed tabs
tests/sim/, tests/ui/, tests/editor/ matching tests
```

## Code style

Match the surrounding code: short doc comments saying why, pure functions for anything testable, DOM code only placing what they return. For example, numbering is a pure helper:

```ts
/** The number key for each offered tool in a tab: "1"-"9", then "0"; none past the 10th. */
export function toolNumbers(tools: StructureKind[]): Map<StructureKind, string> {
  return new Map(tools.slice(0, 10).map((t, i) => [t, String((i + 1) % 10)]));
}
```

## Testing strategy

Vitest, written first:

- **Gate on wall (sim):** gate on own wall succeeds, gold changes by exactly `refundFor(wall) - priceAt(gate)`, the base is a gate with `buildLeft` set; refused with a tower on the wall, on a rival's wall, on a ruin, without the gold; painting a row of walls with the gate tool turns them all; an unfinished wall is replaced with its refund; the determinism test still passes.
- **Tabs:** `toolsInTab` gives the table above for each tab; every buildable kind is in exactly one tab and one subtitle; `Digit1`-`Digit3` map to towers, units, civic; a subtitle with nothing offered is hidden.
- **Numbering:** offered tools number 1-9, 0, then blanks past ten; tools not offered are skipped; sell never numbered; one-list sections number from 1 each.
- **Keys:** a pure helper (e.g. `pickerKey(ui, code, offered)`) returns what to do: closed + `Digit1` opens Towers; open + `Digit1` picks the tab's first item and closes; open + a number with no item does nothing; `Escape` open closes and keeps the tool; `Escape` closed drops the tool.
- **Full-screen scale:** the whole-number scale for a map and window size (e.g. 42x28 in 1280x800 gives 30), never below 1.
- Browser, by hand: switch tabs and see the tab bar stay still; `1 1` then click places a wall; `1 2` on a wall makes a gate; open the big map, click to move the view, then close it with ×, `Esc`, and a wheel zoom (landing where the pointer was); online Co-op, gate on wall works for both players.

## Boundaries

- **Always:** gate-on-wall through the existing `build` command and `canBuild`, so online and offline agree; numbers computed from what's shown, never hard-coded per kind.
- **Ask first:** changing other key bindings; pausing for the full-screen map.
- **Never:** destroy a tower without the player selling it; let a gate replace a wall the player doesn't own.

## Success criteria

1. With the Gate tool, clicking your own wall makes a gate in one click, with the wall refunded; the refusals above show their messages.
2. The picker shows Towers, Units and Civic with the subtitles above, and its tabs are in the same place on screen for every tab.
3. The enlarge button opens the full-window pixel map, which updates live and moves the view on click; ×, `Esc` and zooming in close it.
4. `1 1` puts a wall in hand, `2 1` a guardhouse, `3 1` a house; numbers show on each tab's first 10 items; `Esc` closes the picker, then drops the tool.
5. `npm run typecheck && npm test && npm run build` pass; Keys panel, README and CAPABILITIES updated.

## Open questions

None outstanding.
