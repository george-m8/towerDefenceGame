# Spec: balance-files

Status: DRAFT (awaiting review)
Module: `balance-files`, second on the roadmap (after `beginner-help`) ([`tasks/roadmap.md`](tasks/roadmap.md)) and in "Next up" in [`CAPABILITIES.md`](CAPABILITIES.md). It follows the pattern of Chris's `.map` and `.items` editors ([`SPEC-map-editor.md`](SPEC-map-editor.md), [`SPEC-items-editor.md`](SPEC-items-editor.md)).
Last updated: 2026-10-27

## Assumptions (correct these before approval)

1. "Balance" means numbers only: costs, HP, damage, fire rates, ranges, sight, speeds, intervals, payouts, wave sizes. Names, glyphs, behaviours, movement profiles and which structures exist stay in code (`.items` already decides what can be built).
2. Starting gold and keep HP are in the balance file (decided 2026-10-27). The planned `.loadout` file can override them for a level, alongside the setup options.
3. Live tweaking works offline only (solo, and the editors' Play), like the other Debug menu options. Online rooms play a chosen file, fixed for the game.
4. Global multipliers are applied once, when the game's numbers are resolved, not on every tick.
5. A tweak changes what is built, spawned or fired from then on. Enemies and units already on the map keep the stats they spawned with (they're copied at spawn today), and built structures keep their max HP.

## Objective

George is about to rebalance the whole game from his play-testing notes, and later features (new towers, spawn groups) will need tuning too. Today every number is a constant in `src/sim/config.ts`, so each change means editing code, reloading and starting a new game. Once this module is in, a designer can:

1. Open **Debug > Balance** in a solo game, change a tower's damage or a global "tower damage x1.2", and see the change in play straight away.
2. Save the result as a `.balance` file (dev) or download it, and open it again later.
3. Pick a balance file when setting up a game (solo or online), for example `easy`, `default` or `hard`.
4. Make the game easier or harder overall with a handful of global multipliers, without touching every row.

Success: no game number used in play is read straight from a config constant any more. All of them come from the game's own resolved numbers, so every new number from now on is tunable from the day it's added.

## Rules

### What's in a balance file

Sparse overrides of the config's numbers, grouped as the config groups them, plus multipliers:

```json
{
  "format": "keep-defence-balance",
  "version": 1,
  "title": "Hard",
  "multipliers": { "enemyHp": 1.3, "bounty": 0.8 },
  "structures": { "archer": { "cost": 30, "tower": { "damage": 8 } } },
  "enemies": { "goblin": { "hp": 24 } },
  "units": { "scout": { "sight": { "outer": 6 } } },
  "waves": { "countPerWave": 4 },
  "economy": { "startingGold": 200, "buildTime": { "maxSeconds": 30 } },
  "keep": { "hp": 400 }
}
```

- **Groups and what they can tune:**
  - `structures`: per kind, `cost`, `maxHp`, `sight`, and the numbers in `tower`, `trap`, `income`, `farm` and `spawner` (`quota`, `intervalSeconds`).
  - `enemies`: per kind, `hp`, `speed`, `damage`, `attackInterval`, `bounty`, `threat`, `firstWave`, `mixWeight`, `weight`, `ability` numbers and `band` sizes. Variant multipliers per variant.
  - `units`: per kind, `hp`, `armour`, `damage`, `attackInterval`, `range`, `speed`, `sight`, `chase`.
  - `waves`: everything in `WAVES`, plus `NIGHT_SPAWNS.from`.
  - `economy`: `startingGold`, `sellRefund`, `enclosureDiscount` (keep and outer), `buildTime` (`maxSeconds`, `fullDistance`), resource worth and work seconds per resource terrain, `earlySendGoldPerSecond`.
  - `keep`: `hp`, `sight`; `pvp`: `keepHp`, `destroyBounty`.
  - `fog`: `sightCloseRadius`, `keepSight`.
- **Multipliers** (all default 1, each from 0.1 to 10):

  | Multiplier | Applies to |
  |---|---|
  | `towerDamage` | `tower.damage` and `trap.damage` |
  | `towerFireRate` | Divides `tower.fireIntervalSeconds` and `trap.fireIntervalSeconds` |
  | `towerRange` | `tower.range` |
  | `structureCost` | Every structure's `cost` |
  | `structureHp` | Every structure's `maxHp` |
  | `enemyHp`, `enemySpeed`, `enemyDamage` | Every enemy kind's `hp`, `speed`, `damage` |
  | `enemyCount` | The wave threat budget (`baseCount` and `countPerWave`) |
  | `bounty` | Enemy `bounty` |
  | `income` | House and shop `income.gold`, farm `goldPerField`, resource worth |
  | `buildTime` | `buildTime.maxSeconds` |
  | `unitHp`, `unitDamage` | Every unit kind's `hp` and `damage` |
  | `spawnInterval` | Every spawner's `intervalSeconds` |
  | `sight` | Every `sight.inner` and `sight.outer` (structures, units, keep) |

- An override and a multiplier on the same number combine: the override replaces the default, then the multiplier scales it.
- Numbers the game needs whole (costs, HP, quotas, band sizes, `firstWave`, gold) are rounded after multiplying, as enemy damage already is at spawn. Everything else stays as it is.
- **Validation** (`parseBalance`), each refusal with a message naming the problem, like `parseItems`: wrong format, newer version, an unknown group, kind or field ("`structures.archer.tower.dammage` isn't a balance number"), a value that isn't a finite number of 0 or more, a whole-number field given a fraction, a multiplier outside 0.1-10, `minRange` above `range`, or a band `min` above `max`. Unknown top-level fields are kept, as in `.items`.
- A file can't add kinds, rename things, or change behaviours.

### Resolving a game's numbers

- `createGame(seed, { balance })` resolves `state.balance` once: config defaults, then the file's overrides, then the multipliers. No file means the defaults, and the game is exactly today's (the determinism test is unchanged).
- Every system reads numbers from `state.balance`, never from `STRUCTURES`, `ENEMY_KINDS`, `UNIT_KINDS`, `WAVES`, `BUILD_TIME`, `STARTING_GOLD`, `KEEP_HP`, `SELL_REFUND`, `ENCLOSURE_DISCOUNT` or the other tuned constants directly. That includes the sim, the HUD and picker costs, hover info, the journal and the renderer's range overlay. The config tables stay as the defaults and as the home of names, glyphs and behaviours.
- Per-tick code doesn't recompute anything. Derived values (ticks per shot, the wave countdown in ticks) are computed when resolving, or read from `state.balance` where they're used today as module-level constants.

### Tweak panel (Debug > Balance)

- A Debug menu row, **Balance**, available in a game and in the editors' Play. Offline only: online it shows the room's file read-only, with "Balance can only be changed offline".
- It opens a window over the game (the game keeps running unless paused):
  - **Top:** the file's title, a dot when there are unsaved changes, and **New** (defaults), **Open** (from `balance/` or from disk), **Save** (dev server only, `POST /__balance/<name>`), **Download**, **Reset all**.
  - **Multipliers** first, one number field per multiplier with a reset button.
  - Then sections: **Towers and traps**, **Buildings**, **Enemies**, **Units**, **Waves**, **Economy**, **Keep and fog**. Each section lists its kinds, and each kind lists its numbers as number fields with the default shown faintly beside it. A changed field is highlighted and has its own reset.
  - A **search box** filters rows by kind or field name ("archer", "damage").
- A change is applied as a `debugBalance` command (offline only, refused online like the other debug commands), which re-resolves `state.balance`. Hover info, costs in the picker and the range overlay update at once.
- Bad input (a negative number, text) is refused in the field, which turns red, and the game keeps the last good value.

### Choosing a file

- **Solo:** the Endless settings step gets a **Balance** dropdown beside Build Setup: "Default" plus every file in `balance/`. `?solo&balance=<name>` does the same.
- **PvP and online:** the room creator's choice goes in `create` (`balance?: string`), the same way `size` and `enemiesCome` do. The server looks the name up in its own bundled `virtual:balance` and refuses an unknown name ("Unknown balance file"). Every client gets the resolved numbers as part of the welcome state. They never change during a game, so updates don't carry them. A restart keeps them.
- **Map editor Play and items editor Play** use the balance currently open in the panel, if any, otherwise the defaults.

### Files on disk

- `balance/<name>.balance` at the repo root. Names follow the map name rules. Listed by a Vite plugin `tools/balance.ts` (sharing `tools/dataFiles.ts`) as `virtual:balance` in the client and server builds. Saving only works under the dev server.
- The repo ships `balance/default.balance` (an empty override, title "Default") so the dropdown and tests have a real file. The rebalance task adds `easy` and `hard`.

## Out of scope

- The rebalance itself (George's write-up): the next task list, done with this tool.
- `.wave` files and wave templates (`wave-director` puts its numbers in the balance file; the `.wave` editor comes later).
- Live tweaking online, votes on balance, per-player balance (handicaps).
- Balance as part of a level (`levels`).
- Changing behaviours, names, glyphs or adding kinds from a file.
- Charts, a simulation runner or auto-tuning.

## Data model

```ts
// src/sim/balance.ts (new): the format, no DOM
export const BALANCE_FORMAT = "keep-defence-balance";
export const BALANCE_VERSION = 1;
export type Multiplier =
  | "towerDamage" | "towerFireRate" | "towerRange" | "structureCost" | "structureHp"
  | "enemyHp" | "enemySpeed" | "enemyDamage" | "enemyCount" | "bounty" | "income"
  | "buildTime" | "unitHp" | "unitDamage" | "spawnInterval" | "sight";
export interface BalanceFile {
  format: typeof BALANCE_FORMAT;
  version: number;
  title: string;
  multipliers: Partial<Record<Multiplier, number>>;
  structures?: Partial<Record<StructureKind, DeepPartial<StructureNumbers>>>;
  enemies?: Partial<Record<EnemyKindId, DeepPartial<EnemyNumbers>>>;
  units?: Partial<Record<UnitKindId, DeepPartial<UnitNumbers>>>;
  waves?: Partial<WaveNumbers>;
  economy?: DeepPartial<EconomyNumbers>;
  keep?: Partial<KeepNumbers>;
  pvp?: Partial<PvpNumbers>;
  fog?: DeepPartial<FogNumbers>;
  [extra: string]: unknown;
}
export function parseBalance(json: unknown): { balance: BalanceFile } | { error: string };
export function serializeBalance(file: BalanceFile): string;
export function withValue(file: BalanceFile, path: string, value: number | undefined): BalanceFile;

/** The game's numbers: full tables, overrides and multipliers applied. */
export interface Balance {
  structures: Record<StructureKind, StructureStats>;
  enemies: Record<EnemyKindId, EnemyKind>;
  units: Record<UnitKindId, UnitKind>;
  waves: typeof WAVES & { nightFrom: number };
  economy: EconomyNumbers;
  keep: KeepNumbers;
  pvp: PvpNumbers;
  fog: FogNumbers;
}
export function resolveBalance(file?: BalanceFile): Balance; // pure, cached for "no file"
/** Every tunable field: its path, default, and whether it must be whole. Drives validation and the panel. */
export const BALANCE_FIELDS: BalanceField[];

// src/sim/types.ts
interface GameState { ...existing; balance: Balance; balanceTitle: string }
type Command = ... | { type: "debugBalance"; file: BalanceFile }

// src/sim/game.ts
interface GameOptions { ...existing; balance?: BalanceFile }

// src/net/protocol.ts
| { type: "create"; ...existing; balance?: string }
```

`BALANCE_FIELDS` is derived from the config tables (every number field of every kind), so a number added to config later appears in the panel and in validation without extra code. A test checks that every numeric config field is in it.

## Commands

```
npm run dev          # game, editors and the save endpoint
npm run server       # online rooms (reads balance/ through virtual:balance)
npm test             # vitest
npm run coverage     # src/sim/ and tools/ at 80% lines or more
npm run typecheck
npm run build
```

No new dependencies.

## Project structure

- `src/sim/balance.ts` (new): format, validation, `resolveBalance`, `BALANCE_FIELDS`.
- `src/sim/config.ts`: unchanged numbers. The tables become the defaults. Constants that were read as module-level values (`COUNTDOWN_TICKS` in `waves.ts` and similar) move to reads of `state.balance`.
- Readers moved to `state.balance` (from the current grep): `src/sim/` `building.ts`, `behaviours.ts`, `economy.ts`, `enclosures.ts`, `enemies.ts`, `farms.ts`, `fieldUnits.ts`, `fog.ts`, `grid.ts`, `pathfinding.ts`, `towers.ts`, `traps.ts`, `units.ts`, `waves.ts`, `resources.ts`, `game.ts`, `players.ts`; `src/ui/` `hud.ts`, `tileInfo.ts`, `journal.ts`, `journalView.ts`; `src/render/canvas.ts`. Names and glyphs (`picture.ts`, `palette.ts`, `mapFile.ts`, `itemsFile.ts`) keep reading config.
- `tools/balance.ts` (new): the plugin, like `tools/items.ts`. `vite.config.ts` and `src/virtual-modules.d.ts` register it.
- `src/ui/balancePanel.ts` (new): the panel. `src/main.ts`: the Debug row and wiring. `src/ui/startScreen.ts`: the dropdown. `src/net/join.ts`: `?balance=`.
- `server/room.ts`, `src/net/protocol.ts`: the file name on `create`, checked, kept for restarts.
- `balance/default.balance` (new).
- Tests: `tests/sim/balance.test.ts`, `tests/sim/balanceInPlay.test.ts`, `tests/tools/balance.test.ts`, `tests/ui/balancePanel.test.ts` (the pure parts), additions to `tests/server/protocol.test.ts` and the server room tests.

## Code style

Follows the existing files: plain data and pure functions in `src/sim/`, comments saying what a number means in play, refusals as `{ error }` with a sentence a designer can act on.

```ts
/** A tower's numbers in this game: the file's overrides, then the multipliers. */
const tower = state.balance.structures[structure.kind].tower;
if (tower && isBuilt(structure)) updateTower(state, structure, tower);
```

## Testing strategy

Vitest, written before each change:

- **Refactor first:** the whole move to `state.balance` lands with no file loaded and no behaviour change. The existing suite and the determinism test pass untouched before any file is read.
- **Format:** parse then serialize gives back the same file, extra fields included; one test per refusal listed above; `BALANCE_FIELDS` covers every numeric config field (a guard against new hard-coded numbers).
- **Resolving:** an override replaces a default; a multiplier scales it; both combine in the stated order; whole fields are rounded; no file equals the defaults.
- **In play:** an archer override changes damage dealt and the cost charged; `towerFireRate 2` halves the time between shots; `enemyCount` changes the wave's threat budget; `startingGold` is what players start with; `buildTime` changes how long a far build takes; a `debugBalance` command offline changes the next shot and the next spawn but not enemies already on the map; online it's refused.
- **Files:** the plugin lists `balance/`, saving refuses bad names and invalid files, `default.balance` parses.
- **Online:** `create` with an unknown balance name is refused; a known one reaches both clients in the welcome state; a restart keeps it.
- Browser, by hand: tweak archer damage mid-game and see the change; save, reload, open; start a solo game with `?balance=default`; an online room with a file.

Coverage for `src/sim/` and `tools/` stays at 80% lines or more.

## Boundaries

- **Always:** read game numbers through `state.balance`; derive the field list from config so new numbers are tunable automatically; keep `src/sim/` deterministic and DOM-free; wrap device storage in try/catch if the panel remembers anything.
- **Ask first:** adding behaviours or kinds to the file format; making live tweaks work online; changing any default number (that's the rebalance's job).
- **Never:** mutate the config tables at runtime (the server runs several rooms in one process, each with its own file); let a file change a name, glyph or behaviour; change the default numbers in this module.

## Success criteria

1. With no file loaded, every existing test, including determinism, passes unchanged.
2. A grep for the tuned constants outside `config.ts`, `balance.ts` and the name/glyph readers finds nothing.
3. In a solo game, Debug > Balance changes a tower's damage, a multiplier and starting gold, and each change shows in play and in the HUD at once.
4. A `.balance` file saved from the panel opens again with the same values, and a game started with it plays with those numbers, solo and online.
5. Bad files and bad fields are refused with messages naming the problem.
6. `npm run typecheck`, `npm test`, `npm run coverage` (80%+ for `src/sim/` and `tools/`) and `npm run build` pass.

## Resolved decisions

1. **Starting gold and keep HP** are in the balance file; `.loadout` can override them later (2026-10-27).
2. **The panel lives in the Debug menu only.** No separate editor page and nothing for normal players yet, since everyone playing is a tester (2026-10-27).

## Open questions

1. Is the multiplier list right? Proposed additions if wanted: `goldIncome` separate from resource worth, `keepHp`.
2. Should enemy variants' multipliers be tunable in v1, or only the kind rows? Proposed: both, since variants are already numbers in config.
