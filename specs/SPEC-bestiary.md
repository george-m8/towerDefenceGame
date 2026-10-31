# Spec: bestiary

Status: APPROVED (2026-10-25)
Module: `bestiary` (see "Armies" in [`CAPABILITIES.md`](CAPABILITIES.md)). Builds on `enemy-kinds` ([`SPEC-enemy-kinds.md`](SPEC-enemy-kinds.md)) and `fog-of-war`.
Last updated: 2026-10-25

## Objective

A monster journal that fills in as you meet enemies. The first time a kind of enemy comes **into sight**, it gets an entry: its glyph, name, what it does, its stats and its variants. Kinds you haven't met yet show as locked `?` entries, so you know there's more out there. The journal remembers what you've found on this device, across games.

**Player-facing outcome:** on wave 3 the first zergs come into view. A notice says `New in the journal: Zerg`. Pressing `J` (or the Journal button) opens the journal: `Zerg (z)`, "Tiny and cheap, comes in numbers", HP 6, speed 1.8, hit 2 every 0.6s, bounty 1, first seen on wave 3. Below it, three locked entries show `?`. The journal reads "5 of 8 found".

### Unlocking

- An entry unlocks when an enemy of that kind is drawn in sight for this viewer (the same `canSeeEnemiesAt` rule the renderer uses). Enemies hidden in fog don't count.
- Unlocking happens in the browser, from what the viewer sees, so it works the same offline and online. The simulation and server know nothing about the journal.
- Each entry records the wave it was first seen on (the current wave number when it unlocked).
- Unlocks are saved per device and kept across games, sessions and rooms. If storage is missing or blocked, the journal still works for this page load and just isn't remembered.
- Dev-spawned enemies (`E`) count. That's an easy way to fill the journal while testing.

### The journal window

- Opened and closed with `J` or a **Journal** button in the panel. `Esc` closes it. It opens over the map, like the other dialogs, and the game keeps running underneath (online games can't pause for one player).
- A header shows how many have been found: `5 of 8 found`.
- Entries are listed in roster order (`ENEMY_KIND_ORDER`). Kinds added by later modules simply appear as new locked entries.
- **Unlocked entry:** the glyph in the kind's colour, name, a one-line description, stats at wave 1 (HP, speed, hit and interval, bounty), the first wave it can appear in, the first wave you saw it, and its variants. Each variant is listed by name and size, with its differences in words, e.g. `runt (small): weaker, faster, hits softer`. Kinds with one variant show no variant list.
- **Locked entry:** a grey `?`, `???`, and the first wave it can appear in, so you know roughly when to expect it.
- A small **Forget** button clears the journal after a confirmation in the window itself (no browser dialogs).

### Notice

- When a kind unlocks, a short notice appears over the map for 4 seconds: `New in the journal: Wolf rider (J to open)`, with a UI sound. Several unlocks at once (dev spawning) show one notice per kind, one after another.

### Descriptions

Each kind in `ENEMY_KINDS` gains a `description` (one line). The first eight:

| Kind | Description |
|---|---|
| Goblin | Weak all round, but cheap and plentiful. |
| Zerg | Tiny and cheap, comes in numbers. |
| Wolf rider | Fast and fragile. |
| Barbarian | Quick hits, tougher than a goblin. Follows its chief. |
| Dwarf | Slow, with solid hits. Follows its thane. |
| Barbarian chief | Leads barbarians. Slow, but hits very fast. |
| Dwarf thane | Leads dwarves. A stronger dwarf. |
| Golem | Rare, slow and huge, with slow crushing hits. |

Variant differences are worded from their multipliers: HP above or below 1 means `tougher` / `weaker`, speed means `faster` / `slower`, damage means `hits harder` / `hits softer`.

## Out of scope

- Journal entries for your own units (could be a second tab once `units` exists)
- Kill counts or other per-kind statistics
- Sharing the journal between players or syncing it to a server
- Pausing the game while the journal is open

## Data model

```ts
// src/sim/config.ts
export interface EnemyKind { ...existing; description: string }

// src/ui/journal.ts (pure, no DOM)
export interface Journal {
  /** Kinds found, with the wave each was first seen on. */
  found: Partial<Record<EnemyKindId, { firstSeenWave: number }>>;
}
export function loadJournal(storage: Storage | null): Journal;
export function saveJournal(storage: Storage | null, journal: Journal): void;
/** Unlocks kinds the viewer can see now; returns the newly found ones, in roster order. */
export function discover(journal: Journal, state: GameState, viewer: PlayerId): EnemyKindId[];
export function variantSummary(variant: EnemyVariant): string; // "runt (small): weaker, faster, hits softer"

// src/ui/journalView.ts (DOM)
export function createJournalView(root: HTMLElement, journal: Journal): {
  update(state: GameState | null, viewer: PlayerId): void;   // called each frame
  toggle(): void;
};
```

Storage key `keep-journal`, guarded exactly like `src/audio/settings.ts`: every read and write in try/catch, with a fallback to an empty journal. Unknown kind ids in saved data are ignored.

## Commands

Unchanged: `npm run dev`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/config.ts`: `description` on each kind
- `src/ui/journal.ts`: pure journal state, discovery, storage, wording
- `src/ui/journalView.ts`: window, notice, `J` key
- `src/main.ts`, `src/ui/panel.ts`, `src/ui/input.ts`, `index.html`, CSS: wiring, button, key, dialog host
- `src/audio/sounds.ts`: a short "discovered" UI sound
- `tests/ui/journal.test.ts`

## Code style

Pure logic first, a thin DOM layer on top, as in `tileInfo.ts` and `votes.ts`:

```ts
export function discover(journal: Journal, state: GameState, viewer: PlayerId): EnemyKindId[] {
  const found: EnemyKindId[] = [];
  for (const enemy of state.enemies) {
    if (journal.found[enemy.kind] || found.includes(enemy.kind)) continue;
    if (canSeeEnemiesAt(state, enemy.x, enemy.y, viewer)) found.push(enemy.kind);
  }
  for (const kind of found) journal.found[kind] = { firstSeenWave: Math.max(1, state.wave.number) };
  return ENEMY_KIND_ORDER.filter((kind) => found.includes(kind));
}
```

## Testing strategy

Vitest, written before each change:

- **Discovery:** an enemy in sight unlocks its kind with the current wave; one in fog doesn't; an already-found kind isn't returned again; several new kinds come back in roster order.
- **Storage:** round trip; missing, blocked (throwing) and corrupt storage give an empty journal without errors; unknown kind ids are dropped.
- **Wording:** variant summaries for runt, brute and a standard variant; locked and unlocked entry text (pure functions that build the entry lines).
- **Count:** `found / total` matches the roster.

Browser checks: `E` through the roster unlocks each kind with a notice; the journal shows found and locked entries; it survives a reload; Forget clears it. Coverage for `src/sim/` stays at 80% or more (this module is mostly `src/ui/`).

## Boundaries

- **Always:** keep the journal client-side; guard every storage call; build entries from `ENEMY_KINDS` so new kinds need no journal changes; update README (journal, `J`).
- **Ask first:** pausing the game while it's open; adding unit entries; changing how unlocking works (e.g. on kill instead of on sight).
- **Never:** send the journal to the server; use `alert`/`confirm`; unlock from enemies the viewer can't see.

## Success criteria

1. A kind unlocks the first time one is drawn in sight, with a notice and sound, and stays unlocked after a reload.
2. The journal opens with `J` or its button and shows every roster kind, found or locked, with the count.
3. Unlocked entries show glyph, name, description, wave-1 stats, first possible wave, first-seen wave and variants in words.
4. Missing or blocked storage never breaks the game.
5. `npm run typecheck`, `npm test` and `npm run build` pass.

## Open questions

None.

## Resolved decisions (2026-10-25)

1. Locked entries show the first wave they can appear in.
2. A Forget button clears the journal, with an in-window confirm.
