# Tasks: tower-aiming

Spec: [`SPEC-tower-aiming.md`](../SPEC-tower-aiming.md) | Plan: [`plan.md`](plan.md) | Map: [`CAPABILITIES.md`](../CAPABILITIES.md)

Standard verification for every task (in addition to task-specific checks):
`npm run typecheck && npm test && npm run build`

---

## Phase E: Aiming rules

## Task 1: Angle maths module

**Description:** Add a pure `src/sim/aiming.ts`. Angles are in degrees, measured clockwise from north (up the screen, negative y), from the tower's tile centre to a point:
- `facingAngle(facing)`: N 0, E 90, S 180, W 270
- `angleTo(from, to)`: the angle from a tower tile to a point
- `angleBetween(a, b)`: the smallest absolute difference, 0-180
- `inArc(aimAngle, arcDegrees, angle)`: inside or exactly on the edge; 360 always true
- `turnTowards(current, target, maxStep)`: shorter way round, never overshoots, result normalised to [0, 360)

No game changes yet.

**Acceptance criteria:**
- [x] `angleTo` is correct for all four compass directions and the four diagonals
- [x] `inArc` is true at the centre and exactly on the edge, false just outside, and always true for 360°
- [x] `turnTowards` takes the shorter way across 0°/360°, stops exactly on the target, and never overshoots

**Verification:**
- [x] `npm test` (new `tests/sim/aiming.test.ts`)

**Dependencies:** None

**Files likely touched:** `src/sim/aiming.ts`, `tests/sim/aiming.test.ts`

**Estimated scope:** S

---

## Task 2: Facing on every tower and arc-limited targeting

**Description:**
- Add `arcDegrees` and `turnDegreesPerSecond` to `TowerStats`, plus `AIM_TOLERANCE_DEGREES = 5`. Values: archer 90 / 0, cannon 360 / 90, catapult 360 / 30.
- `placeStructure` sets `facing` on every tower (and still on directional traps), and sets `aim` to the facing angle for turning towers.
- Fixed towers (turn speed 0) target only enemies inside their arc, via `inArc(angleTo(...))`.
- `glyphFor` draws arrows only for directional traps, so towers keep their letters.
- Update existing tests that rely on all-round archers to give the archer a facing towards its enemy (same intent).

**Acceptance criteria:**
- [x] Every placed tower records the facing it was built with. Turning towers start with `aim` on that facing.
- [x] An archer facing E fires at an enemy to its east and ignores an equally close enemy to its west, even when the western one is closer to the keep
- [x] Towers still draw as `A`, `C` and `P` (not arrows). All existing tests pass after the facing updates.

**Verification:**
- [x] `npm test` (`tests/sim/towers.test.ts`; touched tests in `economy`/`layers` tests listed in the commit message)
- [x] Glyphs covered by a unit test of `glyphFor`; browser check at Checkpoint E

**Dependencies:** Task 1

**Files likely touched:** `src/sim/config.ts`, `src/sim/types.ts`, `src/sim/grid.ts`, `src/sim/towers.ts`, `src/render/palette.ts` (+ tests)

**Estimated scope:** M

---

## Task 3: Turning towers

**Description:** In `towers.ts`, turning towers (360° arc, turn speed above 0) pick their target as today (in range, closest to the keep), then turn `aim` towards it by at most `turnDegreesPerSecond / TICK_RATE` per tick. They fire only when the target is within `AIM_TOLERANCE_DEGREES` of `aim`. The cooldown keeps counting down while they turn, and the target is re-picked every tick.

**Acceptance criteria:**
- [x] A cannon facing N with an enemy due S doesn't fire until it has turned (about 2 s at 90°/s, within a tick), then fires
- [x] A catapult in the same setup takes about 3x as long. Its minimum range is still respected.
- [x] A turning tower already aimed at its target fires immediately, exactly as before (no regression for targets in front)

**Verification:**
- [x] `npm test` (`tests/sim/towers.test.ts` turning cases)
- [x] Manual: watch a cannon swing round onto a wave (aim line swung from N to SE during a wave)

**Dependencies:** Task 2

**Files likely touched:** `src/sim/towers.ts`, `tests/sim/towers.test.ts`

**Estimated scope:** S

---

### Checkpoint E: aiming works
- [x] All tests pass, build clean
- [x] Browser: an archer ignores enemies behind it; a cannon visibly swings onto targets before firing (checked with Task 4)
- [x] Review with human (including whether the arc and turn numbers feel right)

---

## Phase F: Showing it

## Task 4: Arc overlay, facing notch and aim line

**Description:** The range overlay (while placing a tower, or hovering a placed one) tints only the tiles that are in range, outside the minimum range, and inside the arc for the tower's facing. It uses `aiming.ts` and the same range rules as targeting. Placed towers show a small notch on the tile edge they face. Hovering a turning tower also draws a short line along its current `aim`. The ghost while placing shows the facing notch for the current `R` facing.

**Acceptance criteria:**
- [x] The placement overlay covers exactly the tiles the tower could fire at for the current facing (range, minimum range and arc)
- [x] Every placed tower shows which way it faces at a glance
- [x] Hovering a cannon or catapult shows its current aim line, which moves as it turns

**Verification:**
- [x] `npm run build`
- [x] Manual: rotate an archer ghost with `R` and watch the quarter circle swing round; hover a turning cannon during a wave

**Dependencies:** Task 3

**Files likely touched:** `src/render/canvas.ts`, `src/render/palette.ts`

**Estimated scope:** M

---

## Task 5: Hover info and docs

**Description:** Tower hover info shows facing and arc (`Archer (on wall), facing east, 90° arc`), and turning towers add `turns 90°/s`. README: a "Facing and arcs" note, `R` rotates towers as well as wall spikes, and arcs and turn speeds in the structures table. `SPEC.md` gets a pointer to `SPEC-tower-aiming.md`.

**Acceptance criteria:**
- [x] Hover info shows facing, arc and (for turning towers) turn speed
- [x] README and `SPEC.md` describe facing, arcs and turning accurately

**Verification:**
- [x] `npm run build`
- [x] Manual: hover each tower type

**Dependencies:** Task 4

**Files likely touched:** `src/ui/tileInfo.ts`, `README.md`, `SPEC.md`

**Estimated scope:** S

---

## Task 6: Play-test fixes for turning towers

**Description:** From play-testing: turning towers kept swinging round after each kill and rarely fired. They now pick the in-range enemy needing the least turning (ties: closest to the keep, then id). Splash towers fire once the shell, landing where the barrel points at the target's distance, would land within splash radius of the target, and the blast is centred on that landing point. See the revised rules in the spec.

**Acceptance criteria:**
- [x] A cannon picks an enemy just off its barrel over a more urgent one behind it
- [x] A cannon fires at an off-axis target sooner than the old 5° rule allowed, and the target is still caught in the blast
- [x] Blasts are centred where the shell lands. Archers are unchanged.

**Verification:**
- [x] `npm test` (`tests/sim/towers.test.ts`)
- [x] Manual: a cannon fired at an off-axis enemy during a wave, the blast landing beside it and still catching it

**Dependencies:** Task 5

**Files likely touched:** `src/sim/towers.ts`, `tests/sim/towers.test.ts`, `SPEC-tower-aiming.md`

**Estimated scope:** S

---

### Checkpoint F: tower-aiming complete
- [x] All 6 success criteria in `SPEC-tower-aiming.md` met (re-checked after Task 6)
- [x] `npm run coverage` passes (99.0% lines for `src/sim/`)
- [x] Review with human, then move this file to `tasks/tower-aiming/` and start `line-of-sight`
