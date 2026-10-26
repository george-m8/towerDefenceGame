# Tasks: town-economy

Spec: [`SPEC-town-economy.md`](../../SPEC-town-economy.md) · Plan: [`plan.md`](../plan.md) ("AoE update: town-economy")

Standard verification for every task: `npm run typecheck && npm test && npm run build`, checked by exit code. Tests take their numbers from config (`STRUCTURES`, `ENEMY_KINDS`), never repeat them.

## Task 1: Enemy weight

`weight` on every enemy kind (0 goblin, zerg; 1 wolf rider, barbarian, dwarf, marine, shaman, digger, dwarf bomber; 2 chief, thane, marine captain, demolisher; 4 golem; 6 ram), documented as trampling now, knockback later.

- [x] Every kind has a whole-number weight of 0 or more, matching the spec's table
- [x] The existing suite passes untouched

Files: `src/sim/config.ts`, `tests/sim/enemies.test.ts`. Size: XS. Depends on: none.

## Task 2: Farmhouse, farmland and farm income

`STRUCTURES` rows `farmhouse` (`farm`) and `farmland` (`field`); `src/sim/farms.ts` with `farmFields` (fields per farmhouse: joined through built same-owner farmland, nearest farmhouse first, older on ties, capped at `maxFields`) and `collectFarmIncome`; `incomePerMinute` counts farms.

- [x] No fields, no pay; N joined fields pay `N x goldPerField` per interval; a loose field doesn't count; a chain of fields does
- [x] At most `maxFields` count; another player's fields don't join; a field joined to two farmhouses counts once, for the nearer; unfinished fields neither count nor join
- [x] Farmland is walkable, doesn't close an enclosure, only goes on open ground, can't hold a tower (paintable comes with its tool row in Task 5)
- [x] The income stat includes farms at their current field count

Files: `src/sim/config.ts`, `src/sim/farms.ts` (new), `src/sim/economy.ts`, `src/sim/game.ts`, `tests/sim/farms.test.ts` (new). Size: M. Depends on: none.

## Task 3: Trampling

When an enemy moves onto a new tile, farmland there takes damage equal to the enemy's weight (broken fields burst like other structures). Units don't trample.

- [x] A weight-0 enemy crossing a field leaves it whole; a heavier one takes its weight off per step and enough steps remove it
- [x] A unit walking over a field leaves it whole
- [x] A trampled-away field stops counting, and fields joined only through it come loose

Files: `src/sim/enemies.ts`, `src/sim/farms.ts`, `tests/sim/farms.test.ts`. Size: S. Depends on: 1, 2.

**Checkpoint A:** a full farm earns 8 fields' worth; a golem wears a field row away and the far fields come loose; goblins leave them alone. Done: covered by the cap, trampling and loose-field tests in `tests/sim/farms.test.ts`.

## Task 4: Shop

`STRUCTURES.shop`: a flat income building (70g, +4g every 5 s), built like a house.

- [x] Pays `income.gold` every `income.intervalSeconds`, and counts in the income stat

Files: `src/sim/config.ts`, `tests/sim/economy.test.ts`. Size: XS. Depends on: none.

## Task 5: Build tabs

`TOOLS` rows gain `tab` (`defence`, `civic`, `offence`, or `all` for sell); the picker shows tab buttons Defence / Civic / Offence (Offence greyed out while it has no tools); `1` / `2` / `3` open the picker on that tab; per-tool keys removed except `X` for sell.

- [x] Each tool is in its spec tab; sell is on every tab
- [x] `1` / `2` / `3` open their tab; digits no longer pick tools, nor do `T` / `G` / `B`; `X` still picks sell
- [x] Offence is greyed out with no tools

Files: `src/ui/state.ts`, `src/ui/hud.ts`, `src/ui/input.ts`, `src/styles.css`, `tests/ui/hud.test.ts`, `tests/sim/resources.test.ts` (its key test). Size: M. Depends on: none.

Built: the tab rules are pure functions in `state.ts` (`toolsInTab`, `hasBuildTools`, `tabForKey`). Keys ask the HUD to open the picker through `ui.openPicker`, which the HUD clears each frame. Farmland and shop got their tool rows here (farmland paints). The tab buttons and filtering are checked in the browser at checkpoint B.

## Task 6: Drawing and hover

Glyphs and colours: farmhouse `H`, farmland `"` (flat, walkable look), shop `S`. Hover: `Farmhouse - 6 of 8 fields, +6g every 10s`; `Farmland - counts for the farmhouse at x, y` or `Farmland - not joined to a farmhouse`.

- [x] Hover lines for a farmhouse, a joined field and a loose field
- [x] Browser: tabs, farms built and painted, gold arriving, a heavy enemy trampling a field (checked by George, 2026-10-26)

Files: `src/render/palette.ts`, `src/ui/tileInfo.ts`, `tests/ui/tileInfo.test.ts`. Size: S. Depends on: 2, 4, 5.

Built: glyphs and colours went in with Tasks 2 and 4. Farmland draws flat like other walkable structures. Also fixed a `resources` miss: gold-veined rock now draws raised like plain rock. The browser check is still to do.

**Checkpoint B:** browser check with George.

## Task 7: Docs, tuning table and determinism

- [x] The 2,000-tick determinism test gains a farm with fields that a heavy enemy can trample
- [x] README: farms, shops, tabs and the new keys (controls table), enemy weight, and the Tuning table (farm and shop rows, income per minute next to houses and gatherers); SPEC.md "Since `town-economy`"; plan and CAPABILITIES statuses
- [x] `src/sim/` coverage stays at 80% or more

Files: `tests/sim/game.test.ts`, `README.md`, `SPEC.md`, `CAPABILITIES.md`, `tasks/plan.md`. Size: S. Depends on: 6.

Built: the README's structures table now lists each structure's tab instead of its key. `src/sim/` coverage: 99% of lines, `farms.ts` 100%.
