# Tasks: enclosures

Spec: [`SPEC-enclosures.md`](../../SPEC-enclosures.md) | Plan: [`plan.md`](../plan.md)

Standard verification for every task: `npm run typecheck && npm test && npm run build`

## Task 1: Find enclosures and their discounts

**Description:** `src/sim/enclosures.ts`: flood fill from the spawn over open tiles; group the unreachable open tiles into areas; mark areas touching the keep (and the keep itself when it's unreachable) as keep enclosures; give boundary tiles the best neighbouring discount. Cached per state by `gridVersion`. `priceAt(state, kind, x, y)`.

**Acceptance criteria:**
- [x] Open map: no discounts. A ring away from the keep: 25% inside and on its walls. A ring around the keep, a pocket walled off from the keep's side, and a ring hugging the keep: 50%.
- [x] The map edge, rock and river can close an enclosure; floor spikes and bridges don't block
- [x] Prices round to the nearest gold, minimum 1

**Verification:** `tests/sim/enclosures.test.ts`

## Task 2: Charge the discount; refund what was paid

**Description:** `canBuild` checks the player can afford `priceAt`; `applyCommand` charges it and stores `paid` on the structure; `refundFor` uses `paid`.

**Acceptance criteria:**
- [x] Builds inside or on the boundary are charged the discounted price, by any player
- [x] Selling refunds half of what was paid; opening the ring brings full price back

**Verification:** `tests/sim/enclosures.test.ts`

## Task 3: Show it

**Description:** Shade enclosed tiles and their walls (keep: warm gold; outer: cooler tint) on the map and minimap. Hover info names the enclosure and discount; the info box shows the price for the selected tool on the hovered tile. README and SPEC notes.

**Acceptance criteria:**
- [x] Closing a ring shades it; the keep enclosure looks different from outer ones (checked in a rendered image; browser check pending)
- [x] Hover info and the info box show the discounted price

**Verification:** tests for the hover text; manual in the browser

## Checkpoint
- [ ] All 6 success criteria in `SPEC-enclosures.md` met
- [x] `npm run coverage` passes (98.6% lines; `enclosures.ts` 100%)
- [ ] Manual: build rings in the browser (keep, outer, against the coast)
