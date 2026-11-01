# Spec: players

Status: APPROVED (2026-10-24)
Module: `players` (see the Multiplayer map in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on the MVP ([`SPEC.md`](SPEC.md)), `tile-layers` and `map-gen`.
Last updated: 2026-10-24

## Objective

Teach the simulation that a game can have several players. Each player has their own gold and their own structures, and everyone defends one keep against the same enemies. This module is pure `src/sim/` work with no networking. It's fully tested offline, so `game-server` can host it later without changing rules.

**Who it's for:** players in a co-op game (through `game-server` later), and the single-player game, which must behave exactly as it does today.

### User stories

1. As a player, I have my own gold. What I earn and spend doesn't affect other players.
2. As a player, I can sell only structures I built. Other players' structures are theirs.
3. As a player, I get the bounty for enemies my towers and traps kill, the income from my houses, the gold from chests I build on and trees I clear, and the bonus when I send a wave early.
4. As a player, I can vote to pause or fast-forward. It happens only when every connected player has voted, and any of us can withdraw our vote to undo it.
5. As a player who dropped out, I come back to the same structures and gold.
6. As a single player, nothing changes: my vote alone pauses or fast-forwards, and all gold is mine.

## Rules

**Players**
- A game has 1 or more players. Each has an `id` (small positive integer, assigned in join order), a `name`, `gold`, a `connected` flag and their own pause/fast-forward votes.
- `createGame` creates one player (id 1) by default, so single-player and all existing tests keep working. Options can pass a list of names to start with several.
- `addPlayer(state, name)` adds a player at any time with `STARTING_GOLD` and returns their id. Ids are never reused.
- `setConnected(state, id, connected)` marks a player as dropped or back. A dropped player keeps their gold and structures, and their structures keep working (towers fire, houses pay). Their votes are cleared when they drop.

**Commands**
- `applyCommand(state, playerId, command)` takes the acting player as its own argument, not as a field on the command. The server will pass the id of the connection that sent the command, so a client can never claim to be someone else. (This refines the map's "every command carries a `playerId`".)
- A command from an unknown player id is rejected: `{ ok: false, reason: "Unknown player" }`.
- `togglePause` and `toggleFastForward` toggle **that player's vote**.

**Votes**
- The game is paused while every connected player has voted to pause. The same applies to fast-forward.
- `state.paused` and `state.speed` are recalculated whenever a vote, a connection or the player list changes. Nothing else writes them. `main.ts` and the panel keep reading them as they do today.
- If no players are connected, the game is paused, so an empty room doesn't play itself.
- Building and selling still work while paused (unchanged).

**Gold**
- `GameState.gold` is removed. Gold lives only on `state.players[id].gold`, so the compiler finds every place that used the shared pool.
- Building costs the acting player. `canBuild` checks that player's gold.
- **Bounties:** each enemy records which player struck its **killing blow**, meaning the hit that took its HP from above 0 to 0 or below. That player gets the bounty. If a splash or trap kills several enemies, each kill goes to that structure's owner. A kill with no owner (none possible today) pays nobody.
- **Income:** each house pays its owner.
- **Sell refunds**, **tree clearing** and **ruin salvage** pay the player who did it.
- **Chests** pay the player whose build claimed them.
- **Early send** pays the bonus to the player who sent the wave. Any player can send.

**Ownership**
- Every structure has an `owner`: the id of the player who built it, or `null` for neutral map structures (ruins).
- Selling looks at the top structure on the tile (unchanged). It works only if that structure is yours or neutral, otherwise `{ ok: false, reason: "That belongs to <name>" }`. So a ruin carrying another player's tower can't be salvaged until that tower is gone.
- A tower can be mounted on your own wall or on a neutral ruin, but not on another player's wall. This stops anyone's sale or loss from taking down someone else's tower unexpectedly.
- When a wall is destroyed, its tower falls as today, whoever owns them.

**Shared**
- One keep, one HP pool, one wave sequence, one map. When the keep falls, the game is over for everyone.

## Out of scope

- Networking, rooms, message formats and player limits (`game-server`).
- Showing owners, player colours, other players' gold or vote counts in the UI (`net-client`). The single-player UI stays as it is apart from reading the local player's gold.
- Names, joining and starting a game (`lobby`).
- Shared gold, trading or gifting gold, team modes (later game modes).
- What happens to a player's structures if they leave for good (they just stay).

## Data model

```ts
// src/sim/types.ts
export type PlayerId = number;

export interface Player {
  id: PlayerId;
  name: string;
  gold: number;
  connected: boolean;
  votes: { pause: boolean; fastForward: boolean };
}

export interface Structure {
  // ...existing fields
  /** Who built it; null for neutral map structures (ruins). */
  owner: PlayerId | null;
}

export interface Enemy {
  // ...existing fields
  /** The player whose structure struck the killing blow, once hp <= 0. */
  killedBy: PlayerId | null;
}

export interface GameState {
  // ...existing fields, minus `gold`
  players: Record<PlayerId, Player>;
  nextPlayerId: PlayerId;
  /** Derived from votes; never set directly. */
  paused: boolean;
  speed: number;
}
```

## Commands

Unchanged from [`SPEC.md`](SPEC.md#commands): `npm test`, `npm run typecheck`, `npm run coverage`, `npm run build`.

## Project structure

- New: `src/sim/players.ts` (`addPlayer`, `setConnected`, `playerName`, vote recalculation) and `tests/sim/players.test.ts`.
- Changed: `types.ts`, `game.ts` (`createGame` options, `applyCommand` signature), `grid.ts` (`canBuild` and `placeStructure` take the player), `economy.ts`, `waves.ts` (early send), `towers.ts` and `traps.ts` (a shared `damageEnemy` that records the killing blow), `mapgen.ts`/`game.ts` (ruins are neutral).
- UI: `main.ts` holds a `LOCAL_PLAYER = 1` and passes it to `applyCommand`. The panel reads that player's gold.

## Code style

As [`SPEC.md`](SPEC.md#code-style): plain data and functions, tunables in `config.ts`. Damage goes through one helper so kill credit can't be missed:

```ts
// src/sim/enemies.ts
/** Deals damage and records who struck the killing blow. */
export function damageEnemy(enemy: Enemy, amount: number, by: PlayerId | null): void {
  if (enemy.hp <= 0) return;
  enemy.hp -= amount;
  if (enemy.hp <= 0) enemy.killedBy = by;
}
```

## Testing strategy

Vitest, in `tests/sim/players.test.ts`, on a blank map with waves off (`createGameWithoutWaves`):

- **Gold is separate:** building costs only the builder; A can't build with B's gold.
- **Ownership:** A can't sell B's structure (with the reason naming B); anyone can salvage a ruin; A can't mount on B's wall but can on their own wall or a ruin.
- **Credit:** single-target kill, splash kill (each victim to the tower's owner), trap kill, and an enemy hit by A then finished by B pays B. House income, tree clearing, chest claim and early send pay the acting player.
- **Votes:** pause and fast-forward need every connected player; withdrawing one vote undoes them; a dropped player's vote is cleared and they no longer count; everyone dropped means paused; a single player's vote decides alone.
- **Rejoin:** drop and reconnect keeps gold and structures, and income keeps arriving while dropped.
- **Unknown player** commands are rejected.
- **Determinism:** the same seed and command list (with player ids) gives the same state twice.

Existing tests switch from `state.gold` to the player's gold (a `goldOf(state, id = 1)` helper in `tests/sim/helpers.ts`) and otherwise pass unchanged. That proves single-player behaviour hasn't moved. Coverage stays >= 80% lines on `src/sim/`.

## Boundaries

- **Always:** keep `src/sim/` free of DOM, networking and `Math.random`; route all enemy damage through `damageEnemy`; derive `paused` and `speed` only from votes.
- **Ask first:** changing a gold rule above (e.g. sharing bounties); changing the tick rate or any MVP rule; new dependencies (none needed here).
- **Never:** trust a player id from inside a command; let one player spend or sell another's gold or structures; change single-player behaviour.

## Success criteria

1. With one player, the game plays exactly as before: all existing tests pass after the mechanical `gold` change, and a manual playthrough feels the same.
2. With two players in a test, each one's gold changes only through their own actions and kills.
3. Only the owner can sell a structure. Ruins can be salvaged by anyone. Towers mount only on your own walls or ruins.
4. Bounties follow the killing blow, including splash and traps.
5. Pause and fast-forward happen only on unanimous votes of connected players, and any withdrawal undoes them.
6. A dropped player who reconnects has their gold, including income earned meanwhile, and their structures.
7. `npm run typecheck`, `npm test`, `npm run coverage` and `npm run build` pass.

## Resolved decisions

1. **Separate resources and structures** for now (no shared gold).
2. **Pause and fast-forward** are unanimous votes of connected players.
3. **Rejoin** is allowed and restores the player's gold and structures.
4. **Ruins are neutral:** anyone can salvage them, and anyone can mount a tower on them.
5. **No towers on another player's wall.**
6. **Nobody connected means paused.**
7. **Kill credit goes to the killing blow** (the hit that takes HP to 0 or below).

## Open questions

None.
