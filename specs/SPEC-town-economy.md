# Spec: town-economy

Status: APPROVED (2026-10-26)
Module: `town-economy` (see "AoE update" in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `resources` ([`SPEC-resources.md`](SPEC-resources.md)) and today's houses.
Last updated: 2026-10-26

## Objective

Steady income that doesn't run out. Gatherers strip the map, and once the nearby trees and rocks are gone, a town and farms keep the gold coming. Two ways to earn:

- **Farms:** build a **farmhouse**, then paint **farmland** out from it. Each field joined to the farmhouse (touching it, or through other fields) adds to its income, up to a cap. Fields are cheap and walkable, but heavier enemies walking over them trample them.
- **A town:** houses (today's) and **shops**, each a flat income building. A shop costs more and earns more than a house.

The build picker splits into tabs, **Defence**, **Civic** and **Offence** (for barracks, once `field-units` exists), opened with buttons or `1` / `2` / `3`. Tools are picked by clicking, so the keyboard is left for tabs, selling, rotating and debugging.

**Gold only for now.** Farms make gold until `food` switches them to food.

**Player-facing outcome:** you press `2` for the **Civic** tab and click the farmhouse (50g). You drag farmland (3g a tile) out from it, and the hover box shows `Farmhouse - 6 of 8 fields, +6g every 10s`. Goblins run across the fields without harm, but a golem lumbering through wears a field down, and a battering ram flattens one. Later you add a shop (70g) beside your houses for +4g every 5s.

### Farms

- **Farmhouse:** base layer, blocks movement, like a house. Every `intervalSeconds` it pays its owner `goldPerField` gold for each of its fields. With no fields it earns nothing.
- **Farmland:** base layer, walkable, doesn't block or close a wall ring, can't hold a tower, and is built and painted like a wall. It can only go on open ground.
- **Which fields count:** a built field counts if it touches its owner's farmhouse (N, E, S or W) or is joined to it through a chain of the same owner's built fields (decided 2026-10-26). A field joined to two farmhouses counts for the one fewer fields away, then the older. A farmhouse counts at most `maxFields` (8): the nearest ones by that chain. Fields beyond the cap, or not joined to any farmhouse, earn nothing.
- **Trampling and weight:** enemies get a **`weight`** stat (also meant for knockback later). Each time an enemy steps onto a field, the field takes damage equal to its weight, and at 0 HP (10) it's gone. Light enemies (weight 0) do no harm. Units don't trample. A field can be sold like any structure.

  | Weight | Enemies |
  |---|---|
  | 0 (light) | goblin, zerg |
  | 1 | wolf rider, barbarian, dwarf, marine, shaman, digger, dwarf bomber |
  | 2 | barbarian chief, dwarf thane, marine captain, dwarf demolisher |
  | 4 | golem |
  | 6 | battering ram |
- Build time applies as it does to everything else: a field or farmhouse still under construction counts for nothing.

### Town

- **House:** unchanged (40g, +2g every 5s).
- **Shop:** new flat income building (proposed 70g, +4g every 5s), built like a house. No adjacency rules (decided 2026-10-26).

### Build picker

- Three tab buttons, **Defence**, **Civic** and **Offence**, opened by clicking or with `1`, `2`, `3` (which also opens the picker). Offence is shown greyed out ("Barracks coming") until `field-units` gives it tools.
- Each tool row in `TOOLS` gains a `tab`. Tools are picked by clicking.
- **Per-tool keys go** (decided 2026-10-26): the digits and `T` / `G` / `B` no longer pick tools. Kept: `X` (sell, on every tab), `R` (rotate), `Esc`, `F`, `Space`, `J`, WASD and arrows, and the dev/debug keys (`E`, `M`, `U`, backtick).
- Defence: wall, archer, cannon, catapult, floor spikes, wall spikes, bridge, watchtower, gate.
- Civic: house, shop, farmhouse, farmland, timber yard, mine, forager hut.

### Hover and stats

- Farmhouse: `Farmhouse - 6 of 8 fields, +6g every 10s`. Farmland: `Farmland - counts for the farmhouse at 12, 30` or `Farmland - not joined to a farmhouse`.
- The HUD's income-per-minute stat includes farms (worked out from their current fields) and shops.

## Out of scope

- Food, and farms making food: `food`
- Price modifiers (cheaper towers, better sell prices): later, with the price-balancing pass (decided 2026-10-26)
- Knockback (the `weight` stat is added now so it can use it later)
- Adjacency bonuses between houses and shops (decided 2026-10-26: flat incomes)
- Farmers as units, crops that grow, seasons
- Enemies choosing to raid farms (`enemy-targeting` may weigh them later)

## Data model

```ts
// src/sim/config.ts
export interface FarmStats {
  /** Gold per counted field, paid every intervalSeconds. */
  goldPerField: number;
  intervalSeconds: number;
  /** Most fields one farmhouse counts. */
  maxFields: number;
}
export interface EnemyKind { ...existing; /** Trampling now, knockback later. 0 = light. */ weight: number }
export interface StructureStats {
  ...existing;
  /** Farmhouses. Its timer is the structure's `cooldown`, like income. */
  farm?: FarmStats;
  /** Farmland: counts for a farmhouse it's joined to; enemies trample it by their weight. */
  field?: true;
}
STRUCTURES gains:
  shop:      { name: "Shop", layer: "base", cost: 70, maxHp: 30, blocksMovement: true,
               income: { gold: 4, intervalSeconds: 5 }, sight: ... },
  farmhouse: { name: "Farmhouse", layer: "base", cost: 50, maxHp: 30, blocksMovement: true,
               farm: { goldPerField: 1, intervalSeconds: 10, maxFields: 8 }, sight: ... },
  farmland:  { name: "Farmland", layer: "base", cost: 3, maxHp: 10, blocksMovement: false,
               field: true },

// src/ui/state.ts
export interface ToolDef { tool; tab: "defence" | "civic" | "offence" | "all"; key?: string /* sell only */; paintable }

// src/sim/farms.ts (new)
export function fieldsOf(state: GameState, farmhouse: Structure): Structure[];
export function farmhouseFor(state: GameState, field: Structure): Structure | undefined;
export function collectFarmIncome(state: GameState): void; // called from tick beside collectIncome
export function trample(state: GameState, x: number, y: number): void; // enemies stepping onto a tile
```

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/config.ts`: shop, farmhouse and farmland rows, `FarmStats`
- `src/sim/farms.ts` (new): which fields count, farm income, trampling
- `src/sim/economy.ts`: `incomePerMinute` includes farms
- `src/sim/enemies.ts`: stepping onto a tile tramples a field there
- `src/sim/game.ts`: farm income in `tick`
- `src/ui/state.ts`, `src/ui/hud.ts`, `src/styles.css`: tabs
- `src/ui/tileInfo.ts`: farmhouse and farmland hover
- `src/render/palette.ts`: glyphs and colours (shop `S`, farmhouse `H`, farmland `"`)
- Tests: `tests/sim/farms.test.ts` (new), additions to `economy`, `enemies`, `hud` and `tileInfo` tests

## Code style

Farms follow the income pattern in `economy.ts`:

```ts
export function collectFarmIncome(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const { farm }: StructureStats = STRUCTURES[structure.kind];
    if (!farm || !isBuilt(structure)) continue;
    structure.cooldown--;
    if (structure.cooldown > 0) continue;
    addGold(state, structure.owner, farm.goldPerField * fieldsOf(state, structure).length);
    structure.cooldown = farm.intervalSeconds * TICK_RATE;
  }
}
```

## Testing strategy

Vitest, written before each change. Tests take every number from config (`STRUCTURES.farmhouse.farm` and so on), so tuning never breaks them:

- **Fields:** a farmhouse with no fields pays nothing; with N joined fields it pays `N x goldPerField` per interval; a field joined through a chain counts, a loose one doesn't; past `maxFields` extra fields don't count; another player's fields don't join; a field joined to two farmhouses counts once, for the one fewer fields away; unfinished fields don't count and don't join.
- **Farmland:** walkable, doesn't block enemies or close an enclosure, only on open ground, can't hold a tower, paintable.
- **Trampling:** an enemy stepping onto a field takes its `weight` off it; a weight-0 enemy does nothing; enough steps remove it; a unit walking over doesn't; a field removed this way stops counting (and fields beyond it come loose). Every kind has a weight.
- **Shop:** pays `income.gold` every `income.intervalSeconds` like a house.
- **Income stat:** includes farms at their current field count, and shops.
- **Tabs:** each tool is in the right tab; `1` / `2` / `3` open the tabs; the old tool keys do nothing; `X` still sells; Offence is greyed out with no tools.
- **Hover:** farmhouse and farmland lines.

Browser checks: build a farm and fill its fields; watch gold arrive; let goblins trample a field; switch tabs and use keys from either tab. Coverage for `src/sim/` stays at 80% or more.

## Boundaries

- **Always:** every number in config, and tests that read their numbers from config; farm income through one function; update README (farms, shops, tabs, keys, tuning table) and SPEC.md.
- **Ask first:** making units trample, letting farmland close a wall ring, adjacency bonuses, any price modifier, bringing back per-tool keys.
- **Never:** count a field for two farmhouses; let farmland block movement.

## Success criteria

1. A farmhouse earns `goldPerField` for each of its fields (joined to it, up to `maxFields`) every interval, gold only.
2. Farmland is cheap, walkable and paintable; fields count when joined to a farmhouse; heavier enemies trample it away and light ones don't.
3. Shops earn a flat income like houses.
4. The build picker has Defence, Civic and Offence tabs on buttons and `1` / `2` / `3`; tools are picked by clicking.
5. Hover and the income stat show farm and shop income.
6. `npm run typecheck`, `npm test` and `npm run build` pass, and coverage stays at 80% or more for `src/sim/`.

## Open questions

None.

## Resolved decisions (2026-10-26)

1. Numbers stand as first guesses: farmhouse 50g, farmland 3g (10 HP), 1g per field every 10 s, up to 8 fields; shop 70g at +4g every 5 s.
2. Build keys: tabs Defence / Civic / Offence on buttons and `1` / `2` / `3`; tools by click; per-tool keys removed (X, R, Esc and debug keys stay). Glyphs: farmhouse `H`, farmland `"`, shop `S`.
3. Fields count when touching the farmhouse or joined to it through other fields (no radius).
4. Enemies get a `weight` (for knockback later too); trampling damage is the enemy's weight, light enemies do none.
