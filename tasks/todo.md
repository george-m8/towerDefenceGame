# Tasks: music-packs

Spec: [`SPEC-music-packs.md`](../SPEC-music-packs.md). Plan: [`tasks/plan.md`](plan.md).

## Task 1: MIDI reader keeps the good tracks
- [x] A track with a bad byte is cut short there; its notes so far and the other tracks are kept
- [x] A file that is broken before any track (bad header) is still rejected
- [x] All 16 files in music-pack-1 parse
- Files: `src/audio/midi.ts`, `tests/audio/midi.test.ts`

## Task 2: Pack scan and Vite plugin
- [x] `scanMusicPacks(dir)` returns `{ pack: { category: [files] } }`, only `.mid` files, only known categories, sorted
- [x] `virtual:music-packs` gives the game that list in dev and build; the dev server reloads when a pack file changes
- [x] Pack contents are git-ignored; `public/music/music-packs/.gitkeep` keeps the folder
- Files: `tools/musicPacks.ts`, `vite.config.ts`, `src/vite-env.d.ts`, `.gitignore`, `tests/tools/musicPacks.test.ts`

## Task 3: Playlist and chosen pack
- [x] Songs for a place: the active pack's songs if it has any there, otherwise the built-in songs for that place
- [x] Random pick never repeats the last song when there are several
- [x] Active pack: the saved choice if it exists, else the first pack; "Built-in" means none
- [x] The chosen pack is saved with the sound settings
- Files: `src/audio/playlist.ts`, `src/audio/songs.ts`, `src/audio/settings.ts`, tests

## Task 4: Music player
- [ ] Places are intro, menu, in-play, game-over
- [ ] A play-once song reports `ended` after its last note; menu and in-play move on to another song instead
- [ ] `switchTo` fades out and starts the next place after the fade; a stale load never starts
- [ ] `resume()` starts the wanted place once audio unlocks
- Files: `src/audio/sequencer.ts`, `tests/audio/sequencer.test.ts`

## Task 5: Wiring and Music dropdown
- [ ] Intro dismiss plays intro; intro ending in the menus plays menu music
- [ ] Starting a game plays in-play; game over plays game-over; restart plays in-play
- [ ] A Music dropdown (packs + Built-in) appears when packs exist and restarts the current music
- Files: `src/main.ts`, `src/ui/soundControls.ts`, `src/audio/engine.ts`

## Task 6: Docs
- [ ] README "Music packs" section; SPEC-audio and CAPABILITIES updated
