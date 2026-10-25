# Tasks: fog-of-war

Spec: [`SPEC-fog-of-war.md`](../../SPEC-fog-of-war.md)

Standard verification for every task: `npm run typecheck && npm test && npm run build`

## Task 1: Sight and explored land in the simulation

`SightStats` on every buildable structure and `KEEP_SIGHT` in config; `src/sim/fog.ts` (`getSight` cached by `gridVersion`, `tierAt`, `isExplored`, `canSeeEnemiesAt`, `forEachSightTile` with archer arcs, `reveal`); `GameState.fog` and `GameState.explored`; `placeStructure` reveals; `canBuild` and `sellStructure` refuse unexplored land. Test helpers' blank maps turn fog off.

- [x] Keep, tower, wall and watchtower regions match the spec table; archers see along their arc plus the ring around them
- [x] Building and selling on unexplored land is refused and charges nothing; seen land is buildable
- [x] Selling drops land to seen, never unexplored; ruins reveal nothing; co-op sight is shared
- [x] Sight on a full map with 2,500+ structures is worked out in under 50 ms

## Task 2: Watchtower

Config row (mount, 20g, 30 HP, sight 5/9, no tower stats), glyph `T`, colours, tool `9`.

- [x] Never fires, stands on ground or a wall, sells before its wall

## Task 3: Network and the dev switch

`explored` sent with the grid, `fog` in every update; `?fog=off` for solo and (from the host) online; restarts keep the room's setting.

- [x] Round trip through the welcome snapshot and updates
- [x] `start` with `fog: false` parses; the room starts and restarts without fog

## Task 4: Showing it

Renderer fog wash and black, enemies and effects only in sight, watchtower sight overlay; minimap fog; hover info ("Unexplored", "Out of sight") and the price line on unexplored land. README and SPEC.md.

- [x] Hover info and price line tests; minimap fog colour tests
- [x] Checked in the browser: keep area lit, seen ring darker, rest black; a watchtower reveals its area; `?fog=off` shows everything
- [ ] Play-test: enemies vanish as they leave sight, and the numbers feel right
