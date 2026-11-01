# Spec: items-editor

Status: BUILT (2026-10-26)
Module: `items-editor`, alongside `map-editor` ([`SPEC-map-editor.md`](SPEC-map-editor.md)). It takes "what can be built" out of the planned `.loadout` file; a level will combine a `.map`, a `.wave`, an `.items` and a `.loadout` file.

## Objective

Designers choose which structures players may build, and how many of each a player can have standing at once. The default is everything, with no limits, and the game shows nothing extra unless a limit is set.

## Scope

- **Route:** `?items-editor` for a new file, `?items-editor=<name>` to open `items/<name>.items`. Works in dev and in a production build (Save is hidden there).
- **Page:** a window with the title and a row per buildable structure (every structure except ruins), grouped by the build picker's tabs. Each row has **Allowed** (a checkbox, on by default) and **Max at once** (a number from 1 to 999; blank means no limit, the default).
- **Files:** New, Open (from `items/` or from disk), Save (`POST /__items/<name>`, dev server only), Download. Unsaved changes are marked with a dot, and leaving or New / Open asks first.
- **Play:** a solo Endless game with these limits, on a generated map or an error-free Endless map from `maps/`. **Back to editor** returns, with the file as it was.
- **In game:**
  - `canBuild` refuses a kind whose limit is 0 ("Archer: not allowed in this game"), and a kind the player already has the limit of ("Archer limit reached (3 at a time)").
  - The count is per player, of their own structures of that kind, built or still being built. Selling or losing one frees a place. Neutral structures (Endless starter walls, ruins) and structures placed by a `.map` file for a keep that has no owner don't count.
  - The build picker hides kinds that aren't allowed and shows `n/max` beside limited ones; the HUD's tool box shows it too. Unlimited kinds show nothing.
- **Choosing:** solo, Endless's settings screen (after the mode screen) has a **Build Setup** dropdown ("Everything, no limits" or any file in `items/`), and `?solo&items=<name>` does the same. Online rooms don't use items files yet (that comes with levels), though the limits are in the game state and the server's `canBuild` would enforce them.

## `.items` files

`items/<name>.items` at the repo root; names follow the map name rules (`a-z`, `0-9`, dashes). JSON:

```json
{
  "format": "keep-defence-items",
  "version": 1,
  "title": "Example",
  "limits": { "archer": 6, "cannon": 3, "paladinHall": 0 }
}
```

- **`limits`:** structure kind to the most a player can have at once, a whole number from 0 to 999. A kind that isn't listed has no limit; 0 means it can't be built.
- Written with limits in the config's order. Unknown top-level fields are kept; a newer `version`, an unknown kind or a bad number is refused with a message.
- Listed by a Vite plugin (`tools/items.ts`, sharing `tools/dataFiles.ts` with `tools/maps.ts`) as `virtual:items`, in the client and server builds.

## Code

- `src/sim/itemsFile.ts`: the format (`parseItems`, `serializeItems`, `withLimit`, `BUILDABLE_KINDS`).
- `src/sim/types.ts`, `src/sim/game.ts`, `src/sim/grid.ts`: `GameState.limits`, `GameOptions.items`, `ownedCount` and the check in `canBuild`.
- `src/editor/itemsEditor.ts`: the page. `src/ui/hud.ts`: `limitLabel` and hiding disallowed kinds. `src/ui/startScreen.ts`, `src/net/join.ts`, `src/main.ts`: choosing a file and playing with it.
- Tests: `tests/sim/itemsFile.test.ts`, `tests/sim/buildLimits.test.ts`, `tests/tools/items.test.ts`, `tests/editor/itemsEditor.test.ts`, and additions to `tests/ui/hud.test.ts` and `tests/net/join.test.ts`.

## Out of scope

Items files online, in the map editor's Play, or as part of a level; limits per player or per keep; limits on units.
