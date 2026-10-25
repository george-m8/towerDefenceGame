# Tasks: bestiary

Spec: [`SPEC-bestiary.md`](../../SPEC-bestiary.md)

Standard verification for every task: `npm run typecheck && npm test && npm run build`

## Task 1: Journal state, discovery and storage

`description` on every kind in `ENEMY_KINDS` (spec table). `src/ui/journal.ts`: `Journal`, `loadJournal`/`saveJournal` (key `keep-journal`, guarded like `src/audio/settings.ts`), `discover` (kinds the viewer can see now, first-seen wave, roster order), `variantSummary`, and pure entry builders (`entryLines(kind, journal)` for found and locked entries, `foundCount`).

- [x] An enemy in sight unlocks its kind with the current wave; one in fog doesn't; found kinds aren't returned again; new kinds come back in roster order
- [x] Storage round trip; missing, throwing and corrupt storage give an empty journal; unknown kind ids are dropped
- [x] Variant summaries for runt, brute and a standard variant; found and locked entry lines; `5 of 8 found` count

Files: `src/sim/config.ts`, `src/ui/journal.ts`, `tests/ui/journal.test.ts`. Size: S. Depends on: none.

## Task 2: Journal window

`src/ui/journalView.ts`: dialog over the map listing every kind (found entries with glyph in colour, locked `?` entries with first possible wave), header count, Forget with in-window confirm, close button. `J` toggles, `Esc` closes. Journal button in the panel. A `#journal` dialog host in `index.html` and its CSS.

- [x] `J` and the button open and close it; `Esc` closes it
- [x] Found and locked entries match the spec; Forget clears after confirming
- [x] Browser: the window reads well at the usual sizes and doesn't block the game

Files: `src/ui/journalView.ts`, `src/ui/panel.ts`, `src/ui/input.ts`, `index.html`, `src/styles.css`, `src/main.ts`. Size: M. Depends on: 1.

## Task 3: Unlocking in play, with a notice and sound

Each frame, `discover` runs on the drawn state for this viewer; new kinds are saved and queued as notices (`New in the journal: <Kind> (J to open)`, 4 s each, one after another) with a short "discovered" UI sound. Works for local and online sessions.

- [x] Notice queue: several unlocks at once show one after another (pure queue logic tested)
- [x] Browser: `E` through the roster unlocks each kind with a notice and sound; the journal survives a reload; online, each client unlocks from its own view

Files: `src/ui/journalView.ts`, `src/main.ts`, `src/audio/sounds.ts`, `tests/ui/journal.test.ts`. Size: S. Depends on: 2.

## Checkpoint (after Task 3)

- [x] All tests pass; typecheck and build clean
- [ ] Browser check with George: unlocks, notices, journal window, reload, Forget

## Task 4: Docs

README (the journal, `J`), SPEC.md "Since `bestiary`", plan roadmap status.

- [x] Docs match the built behaviour

Files: `README.md`, `SPEC.md`, `tasks/plan.md`. Size: XS. Depends on: 3.
