# Spec: net-client

Status: APPROVED (2026-10-24) - the user asked to continue until the client is built; decisions marked *(Claude)* are open to review
Module: `net-client` (see the Multiplayer map in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `game-server` ([`SPEC-game-server.md`](SPEC-game-server.md)).
Last updated: 2026-10-24

## Objective

Play co-op in the browser. The game page connects to the game server, draws the server's game smoothly and sends your actions as commands. Offline single-player keeps working exactly as today. A minimal way to create or join a room by link is included, so the game is playable before `lobby` adds a proper screen.

### User stories

1. As a host, I open `/?create&name=Ann`, get a room, and see its code and an invite link in the panel.
2. As a friend, I open the invite link (`/?room=ABCD`), give my name, and I'm in the same game.
3. As a player, I see everyone's structures (marked with their owner's colour) and the same enemies moving smoothly.
4. As a player, my builds show straight away as a faint ghost until the server confirms them. If the server refuses one, I see why.
5. As a player, I see who's in the room, who's connected and who voted to pause or fast-forward.
6. As a player whose connection drops, the game reconnects me as the same player. Reloading the tab does too.
7. As a single player with no link, I play offline as before.

## Rules

**Choosing a mode (from the URL)** *(Claude: URL-based until `lobby`)*
- No `room` or `create` parameter: offline, exactly as today.
- `?create&name=Ann`: create a room. `?room=ABCD&name=Bo`: join it. If `name` is missing, the page asks for it (`prompt`).
- After the welcome, the URL becomes `?room=ABCD`, so it can be shared and reloaded, and the token is kept in `sessionStorage` under the room code. Session storage is per tab, so two tabs in one browser are two players, which is handy for testing.
- Reloading `?room=ABCD` with a stored token rejoins as the same player. Without one, it joins as a new player.
- If the room no longer exists, the page says so and offers "Play offline" and "Create a new room".

**Sessions**
- `main.ts` talks to a `Session`: `state` (a `GameState` for the UI), `playerId`, `send(command)`, `restart()`, `frame(now)` and `status`. Results come back through one `onResult` callback that shows refusals in the panel.
- `LocalSession` is today's loop: it ticks the sim and answers commands synchronously.
- `NetworkSession` turns server messages into a `GameState`. It fills the fields the server leaves out with defaults (enemy movement fields, structure cooldowns, `flow: null`), so the renderer, panel and hover info work unchanged. Nothing in the UI changes the state.
- Debug keys (E, M) don't send anything online.

**Smoothing**
- Enemies are drawn one update interval (100 ms) behind the newest update, interpolated between the two updates around that time by enemy id. A new enemy appears at its first position, and one missing from the newest update disappears.
- Everything else (structures, gold, keep, waves) shows the newest update.

**Commands and ghosts**
- Each command gets the next `seq`. Builds waiting for their result are drawn as faint ghosts and cleared on the result. A refused command shows its reason, like offline.

**Connection**
- Status in the panel: "Connecting...", "Room ABCD", "Reconnecting...", or "Opened in another tab".
- If the socket closes, the client retries `rejoin` with a backoff of 0.5, 1, 2, 4, then every 5 seconds, until it's back. If the server closed it because the same player opened another tab (code 4000), it doesn't retry.

**Online panel**
- Room code and a "Copy invite link" button (link: `<origin>/?room=ABCD`).
- Players list: a colour swatch, the name, "(you)", a dimmed name when disconnected, and pause/fast-forward vote marks.
- The pause and fast-forward buttons show your vote as selected, and the count, e.g. "Pause 1/2".

**Owners**
- Four player colours in the palette (player id 1-4). When the game has more than one player, each owned structure gets a small corner mark in its owner's colour. Hover info adds "Built by Bo".

**Game over online**
- The dialog's Restart button sends `restart`. Everyone gets the new game.

## Out of scope

- The lobby screen (create/join form, waiting room): `lobby`.
- Client-side prediction of enemies or builds beyond ghosts. Sound. Mobile or touch.
- Hosting and HTTPS (the client uses `wss:` automatically when the page is `https:`).

## Tech stack

No new dependencies. The browser's `WebSocket`. Tests use the `ws` package's `WebSocket`, which has the same API, against a real server.

## Commands

Unchanged. Playing online in development: `npm run server` and `npm run dev -- --host`, then open `http://localhost:5173/?create&name=You`.

## Project structure

```
src/net/session.ts         Session interface and LocalSession
src/net/networkSession.ts  NetworkSession: socket, join/rejoin, updates, commands, reconnect
src/net/view.ts            ClientState/StateUpdate -> GameState view, enemy interpolation (pure)
src/net/join.ts            Reading the URL into a join intent; invite links; token storage keys
src/ui/players.ts          Online panel section: room code, invite link, players list
tests/net/                 view, join and session tests (session tests use a real server)
```

`tests/net/` is typechecked with the server config (it imports `ws`).

## Code style

As [`SPEC.md`](SPEC.md#code-style). Network code takes its dependencies (WebSocket constructor, storage, clock) as parameters, so tests run in Node:

```ts
export function createNetworkSession(url: string, intent: JoinIntent, deps: NetworkDeps): NetworkSession
```

## Testing strategy

- **Unit:** `view` builds a valid `GameState` from a welcome (sim helpers like `topAt`, `canBuild` and `getFlowField` work on it), applies updates with and without grid fields, and interpolates enemies (midpoint, new, removed). `join` parses each URL form and builds invite links.
- **Session (real server on port 0):** create then join gives both sessions the same game. A build from B shows as a ghost, then as B's structure in both. A refused build reports its reason. Closing the socket reconnects as the same player. Code 4000 doesn't retry. Restart after game over gives both the new game.
- **LocalSession:** the existing gameplay tests cover the sim. One test checks that `LocalSession` ticks and answers commands as `main.ts` used to.
- **Manual (two tabs, then two machines):** create, invite, join, build, see each other's structures and owner marks, smooth enemies, votes, drop and rejoin, game over and restart.

## Boundaries

- **Always:** keep offline play unchanged; the UI only reads state; validate nothing on trust from the server beyond JSON parsing (the server is ours, but a bad message must not crash the page).
- **Ask first:** new dependencies; changing the protocol (it's shared with the server); client-side prediction.
- **Never:** send a player id; store tokens anywhere but `sessionStorage`; hard-code a server address.

## Success criteria

1. With no URL parameters, the game plays exactly as before.
2. Two tabs (and two machines on the network) can create and join a room and play the same game.
3. Enemies move smoothly, and builds show as ghosts until confirmed.
4. Each player's structures are marked with their colour when there's more than one player, and the panel lists players and votes.
5. Dropping the connection or reloading rejoins as the same player.
6. `npm run typecheck`, `npm test`, `npm run coverage` and `npm run build` pass.

## Resolved decisions

1. *(Claude)* A minimal URL-based create/join is part of this module, so the game is playable before `lobby`.
2. *(Claude)* Tokens live in `sessionStorage` (per tab), so two tabs are two players.
3. *(Claude)* Interpolation 100 ms behind (one update), no prediction.

## Open questions

None blocking. Review the *(Claude)* decisions when you try it.
