# Tasks: audio

Spec: [`SPEC-audio.md`](../SPEC-audio.md) | Plan: [`plan.md`](plan.md)

Standard verification for every task (in addition to task-specific checks):
`npm run typecheck && npm test && npm run build`

---

## Phase G: Sound effects

## Task 1: Synth voice and pure note maths

**Description:** Add `src/audio/envelopes.ts`:
- `midiToHz`, `noteToHz("G", 3)` and semitone offsets
- the pitch-envelope start frequency for an offset (+16 / -14 semitones)
- ADSR timing helpers
- the delay time that makes a given pulse duty cycle (for PWM), clamped to safe limits

Add `src/audio/synth.ts`: a Web Audio voice with pulse (duty cycle and optional PWM LFO, built from two sawtooths and a modulated delay), triangle, saw, sine and noise (looped noise buffer); an ADSR gain envelope; a pitch envelope sliding onto the note; and self-disconnecting nodes. Voices connect to a given output node.

**Acceptance criteria:**
- [x] `noteToHz` gives A4 = 440 Hz and the right G3/C4 values; +16 / -14 semitone start frequencies are correct
- [x] Duty-cycle delay times are correct for 12.5%, 25% and 50% pulses, and stay inside safe limits
- [x] A voice of each waveform can be built and stopped without leaving nodes connected (sound test: 9 live voices after playing everything, 0 two seconds later)

**Verification:**
- [x] `npm test` (new `tests/audio/envelopes.test.ts`)

**Dependencies:** None

**Files likely touched:** `src/audio/envelopes.ts`, `src/audio/synth.ts`, `tests/audio/envelopes.test.ts`

**Estimated scope:** M

---

## Task 2: Audio engine, gesture unlock and sound settings

**Description:**
- `src/audio/engine.ts`: an `AudioEngine` interface (`unlock`, `playSound`, `playNote`, `setVolumes`, `now`), a Web Audio implementation with sound-effect and music buses into a master gain and limiter, and a fake engine for tests. The engine is created at load but stays silent (every call a no-op) until `unlock()`. The intro screen's dismiss calls `unlock()`.
- `src/audio/settings.ts`: mute and two volumes (music, effects), saved per device, falling back to defaults when storage is blocked.
- A speaker button with the two volume sliders in the side panel.

**Acceptance criteria:**
- [x] Nothing can play before `unlock()`, and unlocking twice is harmless. Audio errors never reach the game.
- [x] Mute and volumes round-trip through storage; blocked storage gives defaults with no error
- [x] The speaker button mutes and unmutes, and the sliders change the bus volumes

**Verification:**
- [x] `npm test` (`tests/audio/settings.test.ts`, engine-lock behaviour on the fake)
- [x] Manual: sound button and sliders in the panel; mute saved and restored across a reload (nothing audible until Task 3)

**Dependencies:** Task 1

**Files likely touched:** `src/audio/engine.ts`, `src/audio/settings.ts`, `src/ui/panel.ts`, `src/main.ts`, `src/styles.css` (+ tests)

**Estimated scope:** M

---

## Task 3: Sound-effect table, cue player and UI sounds

**Description:**
- `src/audio/sounds.ts`: the table of sound effects with throttle caps: `enemyHit` (noise burst), `keepHit` (G3 pulse with PWM, +16 semitones), `treasure` (C4 pulse with PWM, -14 semitones), `splash`, `build`, `sell`, `denied`, `waveStart`, `gameOver`.
- `src/audio/cues.ts`: pure; given a list of `{ id, kind }` cues, the last played id and the clock, returns which to play now and the new last id, applying caps.
- The UI plays `build`, `sell` and `denied` when a command's result comes back.
- A dev-only `?soundtest` page lists every sound with a play button and shows the live node count.

**Acceptance criteria:**
- [x] The cue player plays each id once, never replays older ids (even when given the same cues again), and respects each cue's cap
- [x] Building, selling and a rejected action each make their sound in the game
- [x] `?soundtest` (dev server only) plays every sound in the table, and the node count returns to its baseline after each sound

**Verification:**
- [x] `npm test` (`tests/audio/cues.test.ts`)
- [x] Manual: every sound on `?soundtest` plays without errors and cleans up (actual listening is left to you: Checkpoint G)

**Dependencies:** Task 2

**Files likely touched:** `src/audio/sounds.ts`, `src/audio/cues.ts`, `src/ui/soundTest.ts`, `src/main.ts` (+ tests)

**Estimated scope:** M

---

## Task 4: Sound cues from the simulation

**Description:** Add `cues: { id, kind, ttl }[]` and a `nextCueId` counter to the game state. The sim adds a cue when:
- an enemy takes damage from a tower or trap (`enemyHit`)
- a splash lands (`splash`)
- an enemy reaches the keep (`keepHit`)
- a chest is claimed (`treasure`)
- a wave starts (`waveStart`)
- the game ends (`gameOver`)

Cues age out like effects. They're included in network snapshots, and the audio layer feeds them through the cue player every frame, for local and online sessions alike.

**Acceptance criteria:**
- [x] Each event adds exactly one cue with an increasing id; cues expire after a few ticks; same seed and commands give the same cues
- [x] Cues reach online clients in snapshots (snapshot test), and replaying the same snapshot plays nothing twice
- [x] In a local game the cues play (dev voice counter: up to 8 voices at once during a 200-enemy stress wave reaching the keep, no errors). Listening is for you at Checkpoint G.

**Verification:**
- [x] `npm test` (`tests/sim/cues.test.ts`, snapshot test in `tests/net/`)
- [ ] Manual: listen in a local game and a two-tab online game (left for you at Checkpoint G; online delivery is covered by the snapshot test)

**Dependencies:** Task 3

**Files likely touched:** `src/sim/types.ts`, `src/sim/game.ts`, `src/sim/enemies.ts`, `src/sim/towers.ts`, `src/sim/traps.ts`, `src/sim/economy.ts`, `src/sim/waves.ts`, `src/net/snapshot.ts`, `src/main.ts` (+ tests). This is wider than usual, but each change is a one-line `addCue`.

**Estimated scope:** M

---

### Checkpoint G: sound effects
- [ ] All tests pass, build clean
- [ ] Every sound effect heard in a local and an online game; a busy wave (dev `M` stress test) stays under the hit cap
- [ ] Review with human (tune the sounds with `?soundtest`)

---

## Phase H: Music

## Task 5: MIDI file reader

**Description:** `src/audio/midi.ts`, pure: turns MIDI file bytes into `{ notes: { time, duration, midi, velocity, channel }[], length }` in seconds. Handles format 0 and 1, variable-length quantities, running status, tempo changes (including mid-song), note-on with velocity 0 as note-off, and skips meta and sysex events. A corrupt or truncated file gives a clear error instead of throwing something random.

**Acceptance criteria:**
- [x] Hand-built byte fixtures for format 0 and format 1 produce the expected notes and timings
- [x] Running status, velocity-0 note-offs and a mid-song tempo change are all handled
- [x] Corrupt and truncated files are rejected with a clear error

**Verification:**
- [x] `npm test` (`tests/audio/midi.test.ts`)

**Dependencies:** None

**Files likely touched:** `src/audio/midi.ts`, `tests/audio/midi.test.ts`

**Estimated scope:** S

---

## Task 6: Sequencer and title/menu music

**Description:**
- `src/audio/sequencer.ts`: pure scheduling, plus a thin timer that every ~50 ms schedules the notes falling in the next ~200 ms through `engine.playNote`. Supports looping, stopping and fading out.
- `src/audio/songs.ts`: the manifest (file, title, where it plays, loop, source and licence, channel-to-instrument map) and instrument settings. Default mapping: channel 10 to kick/snare/hi-hat by GM note, other channels to lead, harmony, bass and arp.
- A short original placeholder theme, so music works before your MIDI files arrive.
- The title theme starts on the intro's dismiss, carries on through the start screen, and fades out when a game starts.

**Acceptance criteria:**
- [x] The sequencer schedules only the next lookahead window, with times correct across tempo changes, and loops at the song's end
- [x] Channel 10 notes go to drum instruments; other channels follow the default or the manifest's mapping
- [ ] In the browser the theme starts on the intro's dismiss, plays through the start screen, and fades when a game starts (left for you to listen: the browser check kept detaching while you were using it; the player logic is unit-tested)

**Verification:**
- [x] `npm test` (`tests/audio/sequencer.test.ts`, a manifest sanity test)
- [ ] Manual: listen from the intro into a game; mute and volume affect the music (yours)

**Dependencies:** Tasks 2, 5

**Files likely touched:** `src/audio/sequencer.ts`, `src/audio/songs.ts`, `public/music/`, `src/main.ts` (+ tests)

**Estimated scope:** M

---

## Task 7: Docs

**Description:** README: a "Sound and music" section covering the sound effects, the speaker button, the `?soundtest` page, and how to add a MIDI song (where the file goes, the manifest entry, channel mapping, recording its licence). `SPEC.md` gets a pointer to `SPEC-audio.md`.

**Acceptance criteria:**
- [ ] Someone can add a new MIDI song by following the README alone
- [ ] README and `SPEC.md` describe the audio accurately

**Verification:**
- [ ] `npm run build`

**Dependencies:** Task 6

**Files likely touched:** `README.md`, `SPEC.md`

**Estimated scope:** S

---

### Checkpoint H: audio complete
- [ ] All 7 success criteria in `SPEC-audio.md` met
- [ ] `npm run coverage` passes (80% lines or more for `src/sim/` and the pure audio modules)
- [ ] Review with human, then move this file to `tasks/audio/`
