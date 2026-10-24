# Spec: game-server

Status: APPROVED (2026-10-24)
Module: `game-server` (see the Multiplayer map in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `players` ([`SPEC-players.md`](SPEC-players.md)).
Last updated: 2026-10-24

## Objective

A Node server that hosts co-op games. Each room runs one copy of the existing simulation. Players connect over a WebSocket and send commands. The server checks them, applies them for the sender's player, ticks the game at 20 Hz and sends every player the state. It runs on your machine first, reachable by friends on your network, and can move to a real host later with no code changes.

This module is the server and the message format only. The browser doesn't use it until `net-client`, and room codes and names get a screen in `lobby`. Until then, the server is proven by tests that connect real WebSocket clients.

### User stories

1. As a host, I run one command and get a server that friends on my network can connect to.
2. As a player, I can create a room and get a short code, or join a room by its code with a name.
3. As a player, my commands affect the game as me, and nobody can act as me.
4. As a player, I receive the game state as it changes, quickly enough to draw a smooth game.
5. As a player who dropped out, I reconnect and I'm the same player, with my gold and structures.
6. As a player, after the keep falls, we can start a new game in the same room.

## Rules

**Rooms**
- `create` makes a room with a random seed and a 4-letter code (no look-alike letters such as O/0, I/1), and joins the creator to it as player 1.
- `join` with a code adds a new player through `addPlayer`. It's rejected if the room doesn't exist or is full (4 players, set in config).
- New players can join a game that's already running. They start with the starting gold. `lobby` may later add a waiting phase.
- The game starts as soon as the room is created. Votes, game over and everything else follow the `players` rules.
- A room with nobody connected is paused (from `players`) and deleted after 10 minutes empty (configurable). Rejoining within that window works.
- **Restart:** after game over, any player can send `restart`. The room gets a new game with a new seed, and every player keeps their id, name and token but starts again with the starting gold.

**Identity and rejoin**
- On `create` or `join` the server sends a random secret `token` along with the `playerId`. The client keeps it (in `net-client`).
- `rejoin` with a room code and token reconnects as the same player (`setConnected(true)`). An unknown or wrong token is rejected. If the token's player is still connected elsewhere, that older connection is closed.
- A closed connection calls `setConnected(false)`. Gold and structures stay.
- The server works out a connection's `playerId` itself. Clients never send one.

**Commands**
- `{ type: "command", seq, command }` applies `command` as the connection's player. The server replies `{ type: "result", seq, result }` so the client can match replies to the commands it sent.
- `debugSpawn` is always rejected online.
- Every incoming message is validated: its shape, field types, known command types and structure kinds, integers in range. A malformed message gets an `error` reply and is otherwise ignored. A message over 4 KB closes the connection.
- Rate limit: 40 messages per second per connection, enough for painting walls by dragging. Extra messages are dropped with one `error` per second.

**Time and updates**
- Each room ticks on its own timer at 20 Hz, times `state.speed`, with the same catch-up cap as `main.ts`. A paused or game-over room doesn't tick.
- **Snapshot:** on create, join, rejoin and restart, the player gets the whole `GameState` except `flow` (the client recomputes it lazily) and `rngState` (server only). Enemies carry only `id`, `x`, `y`, `hp` and `maxHp`, with positions rounded to 2 decimals, and structures leave out `cooldown` (see `ClientEnemy` / `ClientStructure`).
- **Updates:** sent to everyone in the room at 10 Hz (every 2 ticks), and straight away after any command that changes state. An update contains: `tick`, `enemies`, `effects`, `structures`, `players` (without tokens), `wave`, `keep`, `paused`, `speed`, `gameOver`. The tile layers (`terrain`, `base`, `mount`) and `features` are only included when `gridVersion` has changed since the last update.
- **Size target:** an update with 200 enemies and 150 structures is under 30 KB of JSON (measured: about 21 KB; 41 KB when it carries the grid). Sending full enemy objects measured 40 KB, which is why enemies and structures are trimmed. Smaller encodings can come later if it's ever a problem.

**Hosting**
- `HOST` (default `0.0.0.0`, so other machines on the network can connect) and `PORT` (default `8787`) come from environment variables.
- WebSocket path: `/ws`. In development, the Vite dev server proxies `/ws` to the game server, so the browser always connects to its own origin. Nothing hard-codes a host or port.
- In production (later), the same server also serves the built `dist/` files on the same port, so a deployment is one process and one URL.
- On start, the server logs the address to share on the local network (e.g. `http://192.168.1.20:5173` in dev).

## Message format

Shared types in `src/net/protocol.ts`, used by the server now and the client in `net-client`:

```ts
// Client -> server
export type ClientMessage =
  | { type: "create"; name: string }
  | { type: "join"; room: string; name: string }
  | { type: "rejoin"; room: string; token: string }
  | { type: "command"; seq: number; command: Command }
  | { type: "restart" };

// Server -> client
export type ServerMessage =
  | { type: "welcome"; room: string; playerId: PlayerId; token: string; state: ClientState }
  | { type: "update"; update: StateUpdate }
  | { type: "result"; seq: number; result: CommandResult }
  | { type: "error"; reason: string };
```

`ClientState` is `GameState` without `flow` and `rngState`, with trimmed enemies and structures. `StateUpdate` is the update described above, with the grid fields optional. Names are trimmed, 1-16 characters, and made unique in the room (a duplicate gets " 2" added).

## Out of scope

- Any browser changes: connecting, drawing server state, smoothing, the lobby screen (`net-client`, `lobby`).
- Deploying to a real host, HTTPS/WSS certificates, accounts, persistence across server restarts (rooms live in memory).
- Lockstep, binary encodings, delta compression beyond "grid only when it changes".
- Kicking players, spectators, chat.

## Tech stack

- Node 22+ (you have 23.11; the MVP spec says 22 or 24 LTS).
- `ws` 8 (runtime, approved with the map).
- New dev dependencies (approved): `tsx` (runs the TypeScript server directly. Node's built-in type stripping can't resolve the sim's extension-less imports), `@types/ws` and `@types/node`.
- The server reuses `src/sim/` unchanged. No other runtime dependencies.

## Commands

```
Server (dev):   npm run server         # tsx watch server/main.ts, restarts on change
Client (dev):   npm run dev -- --host  # Vite, reachable on the LAN, proxies /ws to the server
Probe:          npm run server:probe -- <host[:port]> [seconds]
Server (prod):  npm run build && npm run build:server && npm run start   # node dist-server/main.js --static dist
Test:           npm test               # now includes tests/server/
Typecheck:      npm run typecheck      # now also checks server/
```

## Project structure

```
src/net/protocol.ts     Message types, validation, name rules (shared, no Node or DOM)
src/net/snapshot.ts     GameState -> ClientState / StateUpdate (shared, pure)
server/main.ts          Reads env, starts HTTP + WebSocket server, logs LAN address
server/rooms.ts         Room registry: create, find, expire empty rooms, codes
server/room.ts          One room: sim state, players' tokens and sockets, tick timer, broadcasts
server/connection.ts    Per-socket handling: validation, rate limit, routing to a room
server/config.ts        Server tunables: port/host defaults, max players, rates, limits
server/server.ts        HTTP + WebSocket server startup (testable on port 0)
server/static.ts        Serves dist/ in production, refusing paths outside it
server/probe.ts         Reachability check: creates a room and prints updates
tests/server/           Unit tests (protocol, snapshot, room) and socket integration tests
```

`server/` gets its own `tsconfig` (Node types, no DOM) that includes `src/sim` and `src/net`. `src/net` must stay free of Node and DOM APIs so the browser can import it.

## Code style

As [`SPEC.md`](SPEC.md#code-style). A room takes its clock and its send function as inputs, so tests drive time by hand and never sleep:

```ts
// server/room.ts
export function createRoom(code: string, seed: number, send: SendFn): Room { ... }

/** Advances the room by whole ticks for the elapsed time and broadcasts on the update cadence. */
export function advanceRoom(room: Room, elapsedMs: number): void { ... }
```

## Testing strategy

- **Unit (no sockets):** `protocol` validation accepts every valid message and rejects malformed ones (bad types, unknown commands, out-of-range numbers, long names). `snapshot` drops `flow`, `rngState` and tokens, and only includes grid fields after a grid change. `room`: commands apply as the sender, `debugSpawn` is rejected, ticks follow elapsed time and speed, updates go out every 2 ticks, restart keeps players and resets gold, empty rooms expire.
- **Integration (real `ws` on port 0):** two clients create and join a room, both receive the welcome and updates. A build from B is owned by B and both see it. Reconnecting with the token restores the same player. A wrong token, unknown room or full room is rejected. Oversized and flooded messages are handled as specified.
- **Size check:** a test builds a state with 200 enemies and 150 structures and checks the update is under 30 KB.
- Coverage: `src/net/` and `server/` (except `main.ts`) join `src/sim/` in the 80% lines threshold.
- **Manual:** run `npm run server` on one machine and connect from another machine on the same network with a tiny script (`npm run server:probe -- <host>`) that creates a room and prints updates. A full in-browser check waits for `net-client`.

## Boundaries

- **Always:** validate every client message; derive the player from the connection; keep `src/sim/` unchanged except for bugs found here; keep `src/net/` free of Node and DOM; read host and port from the environment.
- **Ask first:** any dependency beyond `ws`, `tsx`, `@types/ws`, `@types/node`; changing the tick rate or update rate; persisting rooms; exposing anything beyond `/ws` (and static files later).
- **Never:** trust a player id, token or game state sent by a client; send tokens or `rngState` to clients; hard-code a host, port or IP.

## Success criteria

1. `npm run server` starts a server that another machine on the same network can reach (manual, with the probe script).
2. Two clients can create and join a room and receive the same state, with builds owned by their senders.
3. A dropped client reconnects with its token as the same player, with its gold and structures.
4. Invalid, oversized and flooding messages never crash the server or change the game.
5. Updates arrive at 10 Hz, and an update with 200 enemies and 150 structures is under 30 KB.
6. Restart after game over works, keeping players and resetting gold.
7. `npm run typecheck`, `npm test`, `npm run coverage` and `npm run build` pass.

## Resolved decisions

1. **Dev dependencies:** `tsx`, `@types/ws` and `@types/node` are approved.
2. **Late joining:** new players can join a running game until `lobby` adds a waiting phase.
3. **Room size:** at most 4 players.
4. **Restart:** any one player can restart after game over, with no vote.
5. **Empty rooms** are deleted after 10 minutes empty; rejoining works within that window.

## Open questions

None.
