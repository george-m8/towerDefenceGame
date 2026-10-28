# Spec: controllers

Status: BUILT (2026-10-28)
Module: `controllers`. Keyboard and mouse, plus Xbox, PlayStation and Switch pads, through one set of actions.

## Objective

The game can be played with a game pad, and the HUD shows the buttons of whatever the player is using: what is `1` on a keyboard is Y on an Xbox pad, △ on a PlayStation pad and X on a Switch pad. Each device has its own bindings, button faces and feel. For example, panning with a right stick has its own speed and curve, separate from held arrow keys.

## The pattern

- **Actions** (`src/ui/controls.ts`): the game acts only on `Action`s (`pause`, `rotate`, `buildDefence`, `place`, `nextTool`...), never on key codes or button numbers.
- **Schemes:** one per device (`keyboard`, `xbox`, `playstation`, `switch`). Each scheme has:
  - `bindings`: action → keys (`KeyboardEvent.code`) or pad buttons (standard-mapping indices, which go by position). The first binding is the one shown.
  - `faces`: how each pad button is shown (text, full name, colour).
  - `feel`: pan speed in px/s; for pads also the stick deadzone, response curve, pointer speed, trigger zoom rate, edge-push margin, and which stick points and which pans.
- **Families differ in data only.** All pads share one layout by position. Switch rebinds confirm and cancel (A is east, B is south) and has a wider deadzone with a gentler curve. PlayStation has a tighter deadzone.
- **Detection:** `padDevice(Gamepad.id)` uses USB vendor ids (`054c` Sony, `057e` Nintendo), then names. Unknown pads use the Xbox scheme. Pads without the `standard` mapping are ignored.
- **Device in use:** `ui.device` is whatever was touched last: a key, the mouse or a pad. Pads at rest don't count.
- **Labels:** markup names an action rather than a key: `<kbd data-action="rotate">`. `createKeyLabels(root).sync(ui)` fills these in for the device in use, and hides them when the device has nothing bound. Titles, the paused line and the Keys panel (`helpLine`) also follow the device.
- **Remaps:** `withRemaps(loadRemaps(storage))` lays the player's own bindings (`localStorage["keep-controls"]`, per device and action) over the defaults. There is no remapping screen yet. Building one only means writing `saveRemaps`.

## Default pad layout

Designed on a Switch pad. Switch pads report their face buttons by label (button 0 is A, 1 B, 2 X, 3 Y), not by position like other pads, so the Switch scheme binds them by label. The controller test still draws them where they physically sit.

| Action                                                                       | Switch      | Xbox        | PlayStation      |
| ---------------------------------------------------------------------------- | ----------- | ----------- | ---------------- |
| Place; pick in the build menu; nothing in hand: open the menu                | A           | A           | ✕                |
| Cancel: close the menu (keeping the item), else a window, else drop the item | B           | B           | ○                |
| Sell in hand; again, back to what was in hand                                | Y           | X           | □                |
| Open or close the build menu                                                 | X           | Y           | △                |
| Rotate clockwise / anticlockwise                                             | R / L       | RB / LB     | R1 / L1          |
| Point (an arrow over the map)                                                | left stick  | same        | same             |
| Step a tile (the arrow hides)                                                | D-pad       | same        | same             |
| Pan the view                                                                 | right stick | same        | same             |
| Zoom out / in (analog)                                                       | ZL / ZR     | LT / RT     | L2 / R2          |
| Pause / fast forward                                                         | − / +       | View / Menu | Create / Options |

The left stick moves a pointer, drawn as an arrow, at `cursorPixelsPerSecond`. The tile under it is picked just as the mouse picks, and near the edge the pointer pushes the view along. The d-pad steps one tile at a time: one step as soon as it's pressed, then after `stepDelaySeconds`, a step every `stepRepeatSeconds` while held. Diagonals step both ways, and the arrow hides. The d-pad keeps its tile as a map tile rather than a point on screen, so a raised block drawn over the next tile can't take the pick. While the build menu is open, the d-pad and the stick both move through it instead: up and down its items, left and right its tabs, and the chosen item's info card shows. Holding A while pointing or stepping paints walls.

The pointer and the pan stick have a little momentum (`momentumSeconds`, 0.1s): they take about that long to catch up with the stick, and glide that long after it's let go. The d-pad has none: it stops the pointer dead.

While the build menu is open, the item chosen in it isn't drawn on the map (no ghost or range) until it's picked.

The tile under the pointer, from the mouse or a pad, always has a white edge, drawn on the top of a raised block.

## Testing a pad

In the Debug menu, **Controller test** shows the first connected pad laid out like a pad. Each button shows its own face, lights up while held, and triggers fill as they're pulled. It also shows the stick positions and what the last button pressed does here. Browsers only expose a pad after one of its buttons has been pressed.

## Not yet

- A remapping screen.
- Pad navigation of menus and dialogs: the start screen, settings and the picker by focus.
- Pad-placed map editor items: the pad places game tools in the editor, but not terrain or spawns.
