# Spec: audio

Status: APPROVED (2026-10-25)
Module: `audio` (new; added to the roadmap in [`tasks/plan.md`](tasks/plan.md)). Builds on the intro screen and the multiplayer sessions.
Last updated: 2026-10-25

## Objective

Give the game a voice: chiptune sound effects for what happens on the map, and music from MIDI files on the title screen and in the menus. Everything is played by **our own small synth** built on the browser's Web Audio API, with no audio library and no new dependency. ([chiptune-synth](https://github.com/8binami/chiptune-synth) was considered and is a good reference for sounds, but its AGPL-3.0 licence would have applied to the whole game.)

**Player-facing outcome:** dismissing the title screen starts a chiptune theme that carries on through the start screen and stops when a game begins. In play, archers and cannons go *tick* and *crump* as they hit, the keep groans with a falling square-wave sweep when enemies reach it, and claiming a treasure chest gives a bright rising chirp. A speaker button mutes everything, and the setting is remembered.

### The synth

A small, focused chiptune voice, enough for every sound below and for playing MIDI songs:

| Feature | Detail |
|---|---|
| Waveforms | Square/pulse with adjustable **duty cycle**, triangle, sawtooth, sine, **noise** |
| PWM | The pulse's duty cycle can sweep with an LFO (rate, depth). Built from two sawtooth oscillators with a modulated delay between them, the standard Web Audio way to make a true moving pulse wave. |
| Amplitude envelope | Attack, decay, sustain, release |
| Pitch envelope | Start N **semitones** above (positive) or below (negative) the note and slide onto it over a set time |
| Voices | Each note is its own short-lived voice, with automatic clean-up when it ends |
| Buses | Sound-effects bus and music bus, each with its own volume, into a master gain with a gentle limiter (`DynamicsCompressorNode`) so stacked sounds don't clip |
| Scheduling | Notes can start at a future audio-clock time, which is what the music sequencer uses |

### Sound effects

Defined in one table (`src/audio/sounds.ts`) so they're easy to tune. The first three are your designs.

| Cue | Sound | When |
|---|---|---|
| `enemyHit` | Noise burst, short decay | A tower shot or trap damages an enemy |
| `keepHit` | G3 pulse with PWM, pitch envelope +16 semitones (sweeps down onto G3) | An enemy reaches the keep |
| `treasure` | C4 pulse with PWM, pitch envelope -14 semitones (sweeps up onto C4) | A treasure chest is claimed (later: power-ups) |
| `splash` | Low noise thump | A cannon or catapult blast lands |
| `build` / `sell` / `denied` | Short blips | Placing, selling, or a rejected action |
| `waveStart` | Rising arpeggio | A wave starts spawning |
| `gameOver` | Falling phrase | The keep falls |

**Throttling:** dozens of hits can land in the same moment. Each cue has a cap (for example at most 4 `enemyHit` per 100 ms, set in the table), so busy waves stay a rhythm, not a wall of noise.

### Where cues come from

The simulation stays pure and never touches audio. It records cues as data, alongside its existing visual effects: `state.cues: { id, kind }[]`, kept for a few ticks like effects. Every cue has an increasing id. The audio layer remembers the last id it played and plays each newer cue once. This works the same for local and online play, since cues ride along in the state snapshots the server already sends. UI-only cues (`build`, `sell`, `denied`) are played by the UI when a command's result comes back.

### Music

- Songs are MIDI files in `public/music/`, listed in a small manifest (`src/audio/songs.ts`): file, title, where it plays (title, menu), loop on or off, source and licence, and how MIDI channels map onto synth instruments.
- **Instruments:** a handful of named instrument settings (lead pulse, soft pulse, triangle bass, saw arp, kick, snare, hi-hat) built from the same synth voice.
- **Channel mapping (default):** MIDI channel 10 (drums) plays kick/snare/hi-hat by note number (GM drum map: 35-36 kick, 38-40 snare, 42-46 hats). Other channels take lead, harmony, bass and arp in order. A song can override this in the manifest.
- **Playback:** the MIDI reader turns a file into timed note events once (respecting tempo changes). A lookahead sequencer then schedules the next ~200 ms of notes against the audio clock on a timer, so timing never drifts with frame rate.
- **Where it plays (for now):** the title theme starts when the intro screen is dismissed (the first user gesture) and carries on through the start screen. It fades out when a game starts. **No in-game music yet**; the manifest's "where" field leaves room for it later.
- Until you add your own MIDI files, a short **original** placeholder theme (written by us, so there are no rights issues) is used.
- The **licence of each song** you add is recorded in the manifest. MIDI arrangements of existing tunes often have their own copyright.

### Settings

- A speaker button in the side panel toggles mute (no keyboard shortcut). Music and sound-effect volume sliders sit next to it.
- Settings are saved in `localStorage` per device. If storage is blocked, the game still works and just forgets them.
- Audio never starts before a user gesture. If the browser blocks audio, the game stays silent with no errors.

## Out of scope

- In-game music (title and menus only for now)
- A music editor or tracker inside the game (you bring MIDI files)
- Positional (left/right) audio from where an event happened
- Live MIDI keyboard input
- Per-player sound settings synced between devices

## Design

```
src/audio/
  synth.ts     // Web Audio voices: waveforms, PWM, ADSR, pitch envelope, noise, buses, limiter
  envelopes.ts // pure maths: MIDI note -> Hz, semitone offsets, envelope timings
  engine.ts    // AudioEngine interface + the Web Audio implementation; unlock on first gesture
  sounds.ts    // the sound-effect table (cue -> voice settings), plus throttling caps
  cues.ts      // pure: given state.cues and the last played id, which cues to play now (throttled)
  midi.ts      // pure: MIDI file bytes -> timed note events (format 0/1, tempo changes, running status)
  sequencer.ts // pure scheduling maths + a thin timer that feeds the engine
  songs.ts     // the song manifest and instrument settings (including the placeholder theme)
  settings.ts  // mute and volumes, saved per device
```

- **An `AudioEngine` interface** (`playSound`, `playNote`, `setVolumes`, `now`) sits in front of the Web Audio code. Tests use a fake engine that records calls, so cue handling, throttling and song scheduling are all tested without sound.
- `src/sim/` gains only the `cues` list and the places that add to it: enemy damage, keep damage, chest claims, splashes, wave starts and game over. No audio imports in the sim.

## Commands

Unchanged. No new dependencies.

## Testing strategy

Vitest, written before each change:

- **Pure synth maths:** note-to-frequency (A4 = 440 Hz, G3, C4), semitone offsets (+16 / -14), envelope timings, and PWM delay-time limits for a given duty cycle.
- **Cues (sim):** keep damage, chest claims, enemy hits, splashes, wave start and game over each add one cue with an increasing id; cues expire like effects; the same seed and commands give the same cues.
- **Cue player:** plays each id exactly once, skips ids already played (including after a network snapshot replaces the state), and respects the throttle caps.
- **MIDI reader:** small hand-built MIDI byte fixtures for format 0 and format 1, running status, tempo changes, note-on with velocity 0 as note-off, and a corrupt file rejected cleanly.
- **Sequencer:** note times in seconds are correct across a tempo change; looping restarts at the right time; channel 10 notes map to drum instruments; only the next lookahead window is scheduled.
- **Settings:** mute and volumes round-trip through storage, and blocked storage falls back to defaults.
- **Manual (in the browser):** listen to every sound effect and the title theme; check nothing plays before the first click; check mute and volumes; check music fades when a game starts.

Coverage stays at 80% lines or more for `src/sim/`. The pure audio modules are held to the same bar. `synth.ts` (raw Web Audio wiring) is checked by ear.

## Boundaries

- **Always:** keep the sim free of audio code; send every sound through the `AudioEngine` interface; put all sound settings in `sounds.ts` and `songs.ts`; record each song's source and licence in the manifest.
- **Ask first:** adding any audio dependency; autoplaying anything without a gesture; changing which events make sounds; adding in-game music.
- **Never:** commit MIDI files we don't have the right to use; let audio errors break the game.

## Success criteria

1. The title theme plays once the intro screen is dismissed, carries on through the start screen, and fades when a game starts. Nothing plays before the first gesture.
2. Enemy hits, keep damage and treasure claims each play their sound, in local and online games, at most once per event.
3. Keep damage and treasure match the described designs (G3 pulse with PWM and +16 semitone pitch envelope; C4 pulse with PWM and -14 semitones). Hits are a noise burst.
4. A busy wave doesn't produce more hit sounds per moment than the configured cap.
5. Any MIDI file in the manifest plays with correct timing (including tempo changes) and loops if set to.
6. Mute and volumes work and are remembered; blocked audio or storage never causes an error.
7. All tests pass. `npm run typecheck`, `npm test` and `npm run coverage` pass.

## Resolved decisions

1. **Our own synth** on the Web Audio API instead of chiptune-synth, because of its AGPL-3.0 licence.
2. **Our own small MIDI reader** instead of a dependency.
3. **Music on the title screen and menus only** for now.
4. **Mute is a button only**, no keyboard shortcut.

## Open questions

None.
