# Spec: lobby

Status: APPROVED (2026-10-24) - requested directly ("create the lobby page"); decisions marked *(Claude)* are open to review
Module: `lobby` (see the Multiplayer map in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `net-client` ([`SPEC-net-client.md`](SPEC-net-client.md)).
Last updated: 2026-10-24

## Objective

A start page and a waiting room, so playing together doesn't need hand-made URLs. Players enter a name, create or join a room, see who's in, and the host starts the game when everyone is ready.

### User stories

1. As a player, the page opens on a start screen where I enter my name (remembered next time) and choose **Play solo**, **Create room** or **Join** with a code.
2. As a host, after creating a room I see its code, an invite link and who has joined, and I press **Start game** when we're ready.
3. As a friend, an invite link opens the start screen with the room code filled in. I enter my name and join the waiting room.
4. As a player in the waiting room, I see who the host is and that we're waiting for them.
5. As a host who leaves the waiting room, the next player becomes host, so the room isn't stuck.

## Rules

**Start screen**
- Shown when the URL has no `room` or `create`, or when a name is needed (it replaces the `prompt`).
- Name: 1-16 characters, remembered in `localStorage` (on this device, not per tab). The buttons stay disabled until there's a name.
- **Play solo** starts the offline game in the page. **Create room** creates a room. **Join** needs a 4-letter code (upper-cased as you type, letters only).
- `?room=CODE` opens it with the code filled in. `?create&name=Ann` and `?room=CODE&name=Bo` still go straight in, so old links keep working.

**Waiting room** (server)
- A new room starts **waiting**: the game doesn't tick, and commands are refused with "The game hasn't started".
- The **host** is the connected player with the lowest id. If the host disconnects, the next connected player becomes host.
- `{ type: "start" }` from the host starts the game. From anyone else it's refused with "Only the host can start". A second start is ignored.
- Joining is allowed while waiting and after the start (late joining stays as decided in `game-server`).
- Restart after game over starts the new game straight away, with no waiting room. *(Claude)*
- The welcome and every update carry `lobby: { started, host }`.

**Waiting room** (page)
- A dialog over the map: the room code, a "Copy invite link" button, the players (with colours and "(you)") and the host marked.
- The host sees **Start game**, and everyone else sees "Waiting for <host> to start...". The dialog closes for everyone when the game starts.

## Out of scope

- A list of open rooms, matchmaking, ready checks, kicking, chat, room settings (mode and economy belong to `game-setup`).

## Code changes

- `src/net/protocol.ts`: a `start` client message and `LobbyInfo` on `welcome` and `update`.
- `server/room.ts`: `started`, `hostOf(room)`, `startRoom`, command refusal and no ticking while waiting. `server/connection.ts` routes `start`.
- `src/net/networkSession.ts`: `lobby` (latest `LobbyInfo`) and `start()`.
- `src/net/join.ts`: the intent becomes `menu` (with an optional room code) when there's no room or create, or no name.
- `src/ui/startScreen.ts`, `src/ui/waitingRoom.ts`: the two dialogs. `src/main.ts` starts a session from the start screen without reloading.

## Testing strategy

- **Server (unit and socket):** waiting rooms don't tick and refuse commands; only the host can start; the host passes on when the host leaves; `lobby` info is in welcome and updates; restart doesn't return to waiting.
- **Client:** `readJoinIntent` gives `menu` (with the room) when the name or room is missing; `NetworkSession` exposes `lobby` and `start()` against a real server.
- **Manual:** the start screen (name remembered, solo, create, join by code, invite link fills the code), the waiting room in two tabs (host starts, the other waits, the host leaving hands over).

## Boundaries

- **Always:** keep `?create&name=` and `?room=&name=` links working; derive the host on the server.
- **Never:** let a non-host start the game; trust a client's claim to be host.

## Success criteria

1. The page opens on the start screen; Play solo plays offline as before.
2. Create and join (by code or invite link) put players in a waiting room that lists everyone.
3. Only the host can start; the game doesn't tick before that; the host role passes on if the host leaves.
4. `npm run typecheck`, `npm test`, `npm run coverage` and `npm run build` pass.

## Resolved decisions

1. *(Claude)* The waiting room freezes the game and refuses commands (no building before the start).
2. *(Claude)* The host is the lowest-id connected player, not a stored "owner", so it always exists while anyone is connected.
3. *(Claude)* Restart skips the waiting room.
4. *(Claude)* The name is remembered per device (`localStorage`); tokens stay per tab (`sessionStorage`).

## Open questions

None blocking.
