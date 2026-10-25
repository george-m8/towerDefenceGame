# Spec: game-setup

Status: DEFERRED (2026-10-25) - built together with `food`, since the toggle has nothing to switch until food exists. Draft kept as is; review it when `food` is next.
Module: `game-setup` (see "AoE update" in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on the mode screen ([`src/ui/startScreen.ts`](src/ui/startScreen.ts)) and the lobby ([`SPEC-lobby.md`](SPEC-lobby.md)).
Last updated: 2026-10-25

## Objective

Before a game starts, the player chooses its **economy**: **Gold only** (today's game) or **Food + gold**. The choice goes into `createGame` as a rules config. It's stored on the game state, so every later module (`resources`, `town-economy`, `units`) reads one place to decide whether food exists. It works with every mode (Endless and PvP), solo and online.

This module only carries the choice. Nothing in play changes yet: food arrives with `resources`.

**Player-facing outcome:** on the Game mode screen, under Map size, there's an **Economy** row with two choices: `Gold only` and `Food + gold`. Picking `Food + gold` and then Endless starts a game whose rules say food is on. The hover text on each choice explains it. In an online room, the waiting room shows the economy next to the mode (`Endless · Food + gold`), and a restart keeps it.

### Rules

- `GameRules` is a small object on the game state: `{ economy: "gold" | "foodAndGold" }`. It's an object rather than a bare flag so later setup options (Ramparts settings, starting gold) have a home.
- **Default: `gold`.** Every existing caller and test that passes no rules gets today's game unchanged.
- Rules are fixed for the whole game. There's no command to change them during play.
- A restart (solo **New game**, online restart) keeps the same rules, as it already keeps mode and size.

### Choosing

- The Game mode screen gets an **Economy** radio group, built the same way as Map size: two buttons, one checked, `Gold only` selected by default.
  - `Gold only`: "Everything is bought with gold."
  - `Food + gold`: "Gather food as well as gold. Food feeds your people." (The wording can change when `resources` gives food a use.)
- Choosing a mode card starts the game with the selected size and economy. Solo games pass it to `LocalSession`. Room creators send it in the `create` message.
- The choice isn't remembered between visits, the same as map size.

### Online

- `create` gains an optional `economy` field. The server checks it (`"gold"` or `"foodAndGold"`, otherwise `Bad economy`) and passes it to `createGame`. A missing value means `gold`.
- The room keeps its rules for restarts, as it keeps `size`.
- `rules` reaches clients in the welcome snapshot as part of the state. It never changes, so updates don't carry it.
- The waiting room shows the economy beside the mode for everyone who joins.

## Out of scope

- Food itself (the player's `food` counter, food sources, spending): `resources`
- Other setup options (Ramparts, starting gold, difficulty): later modules add fields to `GameRules`
- Changing rules after a room is created, or players voting on them
- Remembering the last choice per device

## Data model

```ts
// src/sim/types.ts
export type Economy = "gold" | "foodAndGold";
export interface GameRules {
  /** Gold only (default), or food as a second currency. */
  economy: Economy;
}
export interface GameState { ...existing; rules: GameRules }

// src/sim/game.ts
export interface GameOptions { ...existing; rules?: Partial<GameRules> }
export const DEFAULT_RULES: GameRules = { economy: "gold" };

// src/net/protocol.ts
| { type: "create"; name: string; mode?: GameMode; size?: MapSize; economy?: Economy }
```

`createGame` fills `state.rules` from `{ ...DEFAULT_RULES, ...options.rules }`. A helper `hasFood(state)` (in `game.ts` or a small `rules.ts`) is what later modules call, so no one compares strings directly.

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/types.ts`, `src/sim/game.ts`: `GameRules`, defaults, `hasFood`
- `src/net/protocol.ts`: `economy` on `create`, with validation
- `src/net/session.ts`: `LocalSession` passes rules into `createGame` and keeps them on restart
- `server/room.ts`: rules stored on the room, used on create and restart
- `src/ui/startScreen.ts`: the Economy radio group; `onChoose` carries the economy
- `src/ui/waitingRoom.ts`: shows the economy next to the mode
- `src/main.ts`: wiring
- Tests: `tests/sim/game.test.ts`, `tests/net/protocol.test.ts`, the server room tests, `tests/ui/startScreen.test.ts` if it exists, otherwise the pure parts only

## Code style

Follows the existing option-passing style:

```ts
export function createGame(seed: number, options: GameOptions = {}): GameState {
  // ...
  const state: GameState = {
    // ...
    mode,
    rules: { ...DEFAULT_RULES, ...options.rules },
    // ...
  };
}

export function hasFood(state: GameState): boolean {
  return state.rules.economy === "foodAndGold";
}
```

## Testing strategy

Vitest, written before each change:

- **Sim:** `createGame` with no rules gives `economy: "gold"`; with `{ economy: "foodAndGold" }` it's stored; `hasFood` matches. The full existing suite passes untouched.
- **Protocol:** `create` with a valid economy parses; a bad value fails with `Bad economy`; a missing value parses as before.
- **Server:** a room created with `foodAndGold` keeps it after a restart.
- **Snapshot:** `rules` is in the welcome state.

Browser checks: solo and online, each economy shows in the state (dev console or waiting room); restart keeps it; the radio group works with the keyboard.

## Boundaries

- **Always:** default to `gold` so existing games and tests don't change; validate `economy` on the server; read rules through `hasFood`; update README (the Economy choice).
- **Ask first:** adding any other rule to `GameRules`; showing a food counter before `resources` exists.
- **Never:** let a client change rules after the room is created; trust an unvalidated `economy` value.

## Success criteria

1. The Game mode screen has an Economy choice, `Gold only` by default.
2. Solo and online games start with the chosen economy in `state.rules`, and restarts keep it.
3. The waiting room shows the economy.
4. Games created without rules behave exactly as today, and the existing suite passes.
5. `npm run typecheck`, `npm test` and `npm run build` pass.

## Open questions

1. **Default economy.** Proposed: `Gold only`, so nothing changes for existing players. Do you want `Food + gold` to be the default once `resources` lands?
2. **Labels.** Proposed: `Gold only` / `Food + gold`. The capability map calls it "AoE mode". Do you want that name on screen?
