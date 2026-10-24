# Tasks: net-client

Spec: [`SPEC-net-client.md`](../SPEC-net-client.md) | Plan: [`plan.md`](plan.md) | Map: [`CAPABILITIES.md`](../CAPABILITIES.md)

Standard verification for every task (in addition to task-specific checks):
`npm run typecheck && npm test && npm run build`

---

## Phase J: Sessions

## Task 1: View state from server messages

**Description:** `src/net/view.ts`. `fromClientState(client)` builds a full `GameState`: enemies get default movement fields (`tx`/`ty`/`px`/`py` = position, `bounty` 0, `killedBy` null, `attackCooldown` 0), structures get `cooldown` 0, `flow` null, `rngState` 0. `applyUpdate(view, update)` copies the dynamic fields and the grid fields when present. `interpolateEnemies(previous, next, t)` returns enemies at fraction `t` between two updates, by id. New enemies appear at their position, and enemies missing from `next` are dropped.

**Acceptance criteria:**
- [x] Sim helpers (`topAt`, `canBuild`, `getFlowField`, `describeTile`) work on a view built from a welcome
- [x] `applyUpdate` changes the grid only when the update carries it
- [x] Interpolation gives the midpoint at `t = 0.5`, handles new and removed enemies, and clamps `t` to 0-1

**Verification:**
- [x] `tests/net/view.test.ts`

**Dependencies:** None

**Files likely touched:** `src/net/view.ts`, `tests/net/view.test.ts`, `server/tsconfig.json`, `tsconfig.json`

**Estimated scope:** S

---

## Task 2: Sessions, with offline unchanged

**Description:** `src/net/session.ts` with the `Session` interface (`state`, `playerId`, `send`, `restart`, `frame(now)`, `status`, `onResult`) and `createLocalSession(seed)`, holding today's fixed-step loop from `main.ts`. `main.ts`, the panel and input dispatch through the session. Results come back through `onResult`, which shows refusals with `showMessage`. The panel and input no longer read return values. Restart calls `session.restart()`.

**Acceptance criteria:**
- [ ] Offline play is unchanged: building, selling, refusals shown, pause, fast-forward, send wave, restart, debug keys
- [ ] `main.ts` no longer touches `tick` or `applyCommand` directly
- [ ] A `LocalSession` test checks ticking by elapsed time, speed, the catch-up cap and synchronous results

**Verification:**
- [ ] `tests/net/session.test.ts` (local part)
- [ ] Manual: browser smoke test offline

**Dependencies:** Task 1

**Files likely touched:** `src/net/session.ts`, `src/main.ts`, `src/ui/panel.ts`, `src/ui/input.ts`, `tests/net/session.test.ts`

**Estimated scope:** M

---

## Task 3: NetworkSession

**Description:** `src/net/networkSession.ts`: `createNetworkSession(url, intent, deps)`, where `deps` is `{ WebSocket, storage, now }`. It sends `create`, `join` or `rejoin` on open (rejoin when a token is stored for the room). It builds the view on `welcome` and stores the token, applies `update`s, sends commands with increasing `seq`, reports `result`s through `onResult`, and reports `error`s through `onError`. Malformed server messages are ignored. `status` reports "Connecting..." then "Room ABCD".

**Acceptance criteria:**
- [ ] Against a real server: create and join give both sessions the same game, and B's build appears in both as B's
- [ ] A refused build reports its reason through `onResult`
- [ ] The token is stored under the room code, and a new session with it rejoins as the same player

**Verification:**
- [ ] `tests/net/networkSession.test.ts` (real server on port 0, `ws` client)

**Dependencies:** Task 2

**Files likely touched:** `src/net/networkSession.ts`, `tests/net/networkSession.test.ts`

**Estimated scope:** M

---

### Checkpoint J: offline unchanged, network session tested
- [ ] All tests pass; offline smoke test in the browser

---

## Phase K: Playable

## Task 4: Joining by URL, room code and invite link

**Description:** `src/net/join.ts`: `readJoinIntent(search)` gives `offline`, `create {name}` or `join {room, name}` (asking for a missing name with `prompt`). Also `inviteLink(origin, room)` and the token storage key. `main.ts` picks the session from the intent, connects to `ws(s)://<host>/ws`, and after the welcome replaces the URL with `?room=CODE`. `src/ui/players.ts` is an online panel section with the room code, a "Copy invite link" button and the connection status. An unknown room shows a message with "Play offline" and "Create a new room" links. Debug keys don't send online.

**Acceptance criteria:**
- [ ] `/?create&name=Ann` creates a room and shows the code and invite link. `/?room=CODE&name=Bo` in another tab joins it.
- [ ] Both tabs see each other's builds. Reloading a tab rejoins as the same player.
- [ ] No parameters means offline, as before

**Verification:**
- [ ] `tests/net/join.test.ts`
- [ ] Manual: two tabs with `npm run server` and `npm run dev`

**Dependencies:** Task 3

**Files likely touched:** `src/net/join.ts`, `src/ui/players.ts`, `src/main.ts`, `src/styles.css`, `tests/net/join.test.ts`

**Estimated scope:** M

---

### Checkpoint K: playable online
- [ ] Manual: two tabs create and join, and build in the same game

---

## Phase L: Feel and polish

## Task 5: Smoothing, ghosts and reconnect

**Description:** `NetworkSession` keeps the previous and newest updates with arrival times. `frame(now)` writes enemies interpolated 100 ms behind into the view. Builds waiting for their result are kept as pending, and the renderer draws them as faint ghosts. On close, it rejoins with backoff (0.5, 1, 2, 4, then 5 s), showing "Reconnecting...". On close code 4000 it shows "Opened in another tab" and stops.

**Acceptance criteria:**
- [ ] Enemies move smoothly between updates (manual), and interpolation uses the buffered updates (test)
- [ ] Pending builds show as ghosts until their result, and refused ones disappear with the reason shown
- [ ] A dropped socket reconnects as the same player, and close code 4000 doesn't retry (tests)

**Verification:**
- [ ] Session tests for reconnect, code 4000 and pending builds; view tests for frame interpolation
- [ ] Manual: smooth enemies at normal and 2x speed

**Dependencies:** Task 4

**Files likely touched:** `src/net/networkSession.ts`, `src/net/session.ts`, `src/render/canvas.ts`, `tests/net/networkSession.test.ts`

**Estimated scope:** M

---

## Task 6: Players, votes, owner colours, restart and docs

**Description:** The players list in the online panel: swatch, name, "(you)", dimmed when disconnected, and vote marks. The pause and fast-forward buttons show your own vote as selected and the count ("Pause 1/2") when there's more than one connected player. Four player colours in `palette.ts`. With more than one player, owned structures get a corner mark in their owner's colour, and hover info adds "Built by <name>". The game-over Restart button works online. README: a "Playing together" section. `SPEC.md` note.

**Acceptance criteria:**
- [ ] The players list and vote counts match the server's state in two tabs
- [ ] Structures show owner marks with two or more players, and none in single-player
- [ ] Restart after game over starts a new game for both tabs

**Verification:**
- [ ] `npm run coverage`
- [ ] Manual: two tabs, then two machines on the network

**Dependencies:** Task 5

**Files likely touched:** `src/ui/players.ts`, `src/ui/panel.ts`, `src/ui/tileInfo.ts`, `src/render/canvas.ts`, `src/render/palette.ts`, `README.md`, `SPEC.md`

**Estimated scope:** M

---

### Checkpoint L: net-client complete
- [ ] All 6 success criteria in `SPEC-net-client.md` met
- [ ] `npm run coverage` passes
- [ ] Review with human (including the *(Claude)* decisions), then move this file to `tasks/net-client/` and write the `lobby` spec
