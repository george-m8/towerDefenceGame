# Tasks: lobby

Spec: [`SPEC-lobby.md`](../../SPEC-lobby.md) | Plan: [`plan.md`](../plan.md) | Map: [`CAPABILITIES.md`](../../CAPABILITIES.md)

(Kept here rather than in `tasks/todo.md`, which still holds `tower-aiming`'s list with its review items open.)

Standard verification for every task: `npm run typecheck && npm test && npm run build`

## Task 1: Waiting rooms on the server

**Description:** `start` message and `LobbyInfo` in the protocol. Rooms start waiting: no ticks, commands refused. The host is the lowest-id connected player. `start` from the host begins the game. Welcome and updates carry `lobby`. Restart starts straight away.

**Acceptance criteria:**
- [x] A waiting room doesn't tick and refuses commands with "The game hasn't started"
- [x] Only the host can start; a non-host gets "Only the host can start"; the host passes on when the host leaves
- [x] `lobby: { started, host }` is in every welcome and update

**Verification:** `tests/server/room.test.ts`, `tests/server/protocol.test.ts`, `tests/server/integration.test.ts`

**Files:** `src/net/protocol.ts`, `server/room.ts`, `server/connection.ts`, tests

## Task 2: Client session and URL intent

**Description:** `NetworkSession` keeps the latest `lobby` and has `start()`. `readJoinIntent` returns `menu` (with an optional room) when there's no room or create, or no name, instead of prompting.

**Acceptance criteria:**
- [x] `readJoinIntent("")` is `menu`; `?room=abcd` without a name is `menu` with room `ABCD`; named links still go straight in
- [x] Against a real server, both sessions see `lobby.started` turn true after the host's `start()`

**Verification:** `tests/net/join.test.ts`, `tests/net/networkSession.test.ts`

**Files:** `src/net/join.ts`, `src/net/networkSession.ts`, tests

## Task 3: Start screen and waiting room pages

**Description:** `src/ui/startScreen.ts` (name remembered, Play solo, Create room, Join by code) and `src/ui/waitingRoom.ts` (code, invite link, players, host, Start game or waiting text). `main.ts` starts the chosen session in the page. README "Playing together" and the online panel updated. Old links keep working.

**Acceptance criteria:**
- [ ] The page opens on the start screen; Play solo plays offline as before
- [ ] Create and Join lead to the waiting room listing everyone; the host's Start game starts it for all
- [ ] An invite link opens the start screen with the code filled in

**Verification:** manual, two tabs (pending); typecheck, tests and build pass

**Files:** `src/ui/startScreen.ts`, `src/ui/waitingRoom.ts`, `src/main.ts`, `src/styles.css`, `index.html`, `README.md`

## Checkpoint: lobby complete
- [ ] All 4 success criteria in `SPEC-lobby.md` met (3 and 4 tested; 1 and 2 need the browser)
- [x] `npm run coverage` passes
- [ ] Manual: two tabs through the start screen and waiting room
- [ ] Review with human (including the *(Claude)* decisions)
