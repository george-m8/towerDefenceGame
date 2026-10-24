# Tasks: game-server

Spec: [`SPEC-game-server.md`](../SPEC-game-server.md) | Plan: [`plan.md`](plan.md) | Map: [`CAPABILITIES.md`](../CAPABILITIES.md)

Standard verification for every task (in addition to task-specific checks):
`npm run typecheck && npm test && npm run build`

---

## Phase G: Shared pieces

## Task 1: Tooling and a bare server

**Description:** Add `ws` (runtime) and `tsx`, `@types/ws`, `@types/node` (dev). Add `server/tsconfig.json` (Node types, no DOM) covering `server/`, `src/sim/` and `src/net/`, and make `npm run typecheck` check both configs. Add `server/config.ts` (host/port defaults and the other tunables from the spec) and a bare `server/main.ts`: it reads `HOST`/`PORT`, starts an HTTP server with a WebSocket endpoint at `/ws`, creates and ticks one throwaway game to prove the sim runs under Node, and logs the LAN address. Scripts: `server` (`tsx watch server/main.ts`). Vite proxies `/ws` to the server in dev. Vitest also picks up `tests/server/`.

**Acceptance criteria:**
- [x] `npm run server` starts, logs `http://<lan-ip>:5173` and the WebSocket port, and runs the sim under Node without errors
- [x] `npm run typecheck` checks `server/` with Node types and no DOM, and still checks the client with DOM
- [x] With `PORT=9000 npm run server`, the server listens on 9000

**Verification:**
- [x] Manual: start the server, see the log, stop it
- [x] A smoke test in `tests/server/server.test.ts` starts the HTTP/WS server on port 0 and connects a `ws` client

**Dependencies:** None

**Files likely touched:** `package.json`, `server/tsconfig.json`, `server/config.ts`, `server/main.ts`, `vite.config.ts`, `tests/server/server.test.ts`

**Estimated scope:** M

---

## Task 2: Message types and validation

**Description:** `src/net/protocol.ts` with `ClientMessage`, `ServerMessage`, `ClientState` and `StateUpdate` types, plus `parseClientMessage(raw: string): ClientMessage | { error: string }`. It checks the JSON shape, field types, known message and command types, known structure kinds and facings, integer coordinates in range, `seq` as a non-negative integer, 4-letter room codes from the allowed alphabet, and names (trimmed, 1-16 characters). `debugSpawn` is not a valid online command. Also `uniqueName(existing, name)` (adds " 2", " 3"...). No Node or DOM imports.

**Acceptance criteria:**
- [x] Every valid message form parses to the right type
- [x] Malformed input (bad JSON, missing or wrong-typed fields, unknown types, out-of-range or fractional coordinates, bad codes, long or empty names, `debugSpawn`) returns an error and never throws
- [x] `uniqueName` makes duplicates unique

**Verification:**
- [x] `tests/server/protocol.test.ts`

**Dependencies:** Task 1

**Files likely touched:** `src/net/protocol.ts`, `tests/server/protocol.test.ts`

**Estimated scope:** S

---

## Task 3: Snapshots and updates

**Description:** `src/net/snapshot.ts` with `toClientState(state)` (everything except `flow` and `rngState`) and `toUpdate(state, lastGridVersion)` (the dynamic fields every time; `terrain`, `base`, `mount` and `features` only when `gridVersion` differs). Neither carries tokens, since tokens live only in the server's room data, never in `GameState`.

**Acceptance criteria:**
- [x] `toClientState` drops `flow` and `rngState`, and the client can rebuild `flow` lazily (`getFlowField` works on a received state)
- [x] `toUpdate` includes grid fields only after a grid change
- [x] An update with 200 enemies and 150 structures is under 30 KB of JSON

**Verification:**
- [x] `tests/server/snapshot.test.ts`, including the size check

**Dependencies:** Task 1

**Files likely touched:** `src/net/snapshot.ts`, `tests/server/snapshot.test.ts`

**Estimated scope:** S

---

### Checkpoint G: shared pieces
- [x] All tests pass; the update size test is under 30 KB
- [x] `npm run server` starts and logs its LAN address

---

## Phase H: Rooms over sockets

## Task 4: A room: players, commands, ticks and restart

**Description:** `server/room.ts`. `createRoom(code, seed, now)` and functions to add a player (name made unique, random token, max 4), rejoin by token, and mark a player disconnected. `applyRoomCommand` runs a command as the given player, rejects `debugSpawn`, and returns the result. `advanceRoom(room, elapsedMs)` runs whole ticks for elapsed time times `speed` (with the `main.ts` catch-up cap) and reports when an update is due (every 2 ticks), or immediately after a state-changing command. `restartRoom` (only after game over) makes a new game with a new seed and re-adds the same players with the same ids, names and tokens and fresh gold. Sending is done by an injected `send(playerId, message)`, so tests use a fake.

**Acceptance criteria:**
- [x] Commands apply as the given player. `debugSpawn` is rejected. A fifth player is refused.
- [x] Ticks follow elapsed time and speed, don't run while paused, and updates go out every 2 ticks and after commands
- [x] Restart is only allowed after game over and keeps players' ids, names and tokens, resetting gold

**Verification:**
- [x] `tests/server/room.test.ts` with a fake `send` and hand-driven time

**Dependencies:** Tasks 2, 3

**Files likely touched:** `server/room.ts`, `server/config.ts`, `tests/server/room.test.ts`

**Estimated scope:** M

---

## Task 5: Rooms, connections and sockets

**Description:** `server/rooms.ts`: a registry that creates rooms with unique codes and random seeds, and finds rooms by code. `server/connection.ts`: for each socket, parse messages with `parseClientMessage`. Then route `create`, `join` and `rejoin` to the registry and room (sending `welcome` with a snapshot), `command` to `applyRoomCommand` (sending `result`), and `restart`. A closed socket marks its player disconnected. `server/main.ts` wires this up and runs one timer that advances every room and broadcasts updates.

**Acceptance criteria:**
- [x] Two real `ws` clients: A creates, B joins with the code, both get `welcome` and then updates
- [x] B's build is owned by B, and A's next update shows it
- [x] Closing B's socket marks B disconnected in A's updates

**Verification:**
- [x] `tests/server/integration.test.ts` (port 0, awaits messages, no sleeps)

**Dependencies:** Task 4

**Files likely touched:** `server/rooms.ts`, `server/connection.ts`, `server/main.ts`, `tests/server/integration.test.ts`

**Estimated scope:** M

---

### Checkpoint H: two clients play over sockets
- [x] Integration test: two clients create and join, B's build is owned by B and both see it
- [x] Review with human

---

## Phase I: Hardening and docs

## Task 6: Hardening: limits, tokens and expiry

**Description:** Messages over 4 KB close the connection. More than 40 messages per second are dropped, with at most one `error` per second. Rejoin with a wrong token or unknown room is rejected. Rejoin while the old connection is still open closes the old one. Joining a full or unknown room is rejected. Rooms empty for 10 minutes are deleted. Every handler is wrapped so a thrown error is logged and answered with `error` rather than crashing the process.

**Acceptance criteria:**
- [x] Oversized, flooded and malformed messages never crash the server or change the game
- [x] Rejoin restores the same player, gold and structures. A wrong token is rejected. A second connection with the same token replaces the first.
- [x] Empty rooms expire after the configured time, and rooms with anyone connected never do

**Verification:**
- [x] Integration tests for each case; room expiry tested with hand-driven time

**Dependencies:** Task 5

**Files likely touched:** `server/connection.ts`, `server/rooms.ts`, `server/room.ts`, `tests/server/integration.test.ts`, `tests/server/rooms.test.ts`

**Estimated scope:** M

---

## Task 7: Probe script, production start and docs

**Description:** `server/probe.ts` (`npm run server:probe -- <host[:port]>`): connects, creates a room, and prints the welcome and a line per update (tick, enemies, players), so you can check LAN access from another machine. Production: `build:server` bundles the server with `vite build --ssr`, and `start` runs it, serving `dist/` over HTTP next to `/ws` on one port. The README gets a "Running the server" section: dev, LAN, environment variables and probe. `SPEC.md` notes the server. Coverage includes `src/net/` and `server/` (except `main.ts` and `probe.ts`).

**Acceptance criteria:**
- [ ] The probe works against a local server and prints updates
- [ ] `npm run build && npm run build:server && npm run start` serves the game page and `/ws` on one port
- [ ] The README explains how to run and reach the server

**Verification:**
- [ ] `npm run coverage` passes with the wider include
- [ ] Manual: probe from another machine on the same network

**Dependencies:** Task 6

**Files likely touched:** `server/probe.ts`, `server/main.ts`, `package.json`, `vite.config.ts`, `README.md`, `SPEC.md`

**Estimated scope:** M

---

### Checkpoint I: game-server complete
- [ ] All 7 success criteria in `SPEC-game-server.md` met
- [ ] `npm run coverage` passes
- [ ] Manual: probe from another machine on the network
- [ ] Review with human, then move this file to `tasks/game-server/` and write the `net-client` spec
