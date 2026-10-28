# Spec: music-packs

Status: APPROVED (2026-10-25)
Module: `music-packs` (builds on `audio`; takes over the intro hand-over part of the `music-director` outline in [`tasks/plan.md`](tasks/plan.md)).
Last updated: 2026-10-25

## Objective

Let a music pack (a folder of MIDI files) replace the game's music, category by category, with no code changes. Drop files into a category folder and they play there; leave a folder empty and the built-in songs play instead.

**Player-facing outcome:** dismissing the title screen starts the intro music. It plays once, to the end, carrying on through the start screen. If it finishes while you're still in the menus, menu music takes over. Starting a game stops the intro (or menu) music and starts in-game music, moving on to another song when each one ends. When the keep falls, the game-over music plays.

## Folder layout

```
public/music/music-packs/
  music-pack-1/
    intro/      plays once at start, carries on into the menu until it ends or a game starts
    menu/       after the intro ends, while still in the menus (shuffled)
    in-play/    during a game, one song after another (shuffled)
    game-over/  once, when the keep falls
  another-pack/
    ...
```

- **Each pack is a folder** inside `music-packs/`, named as you like. The Sound panel gets a **Songs** dropdown listing each pack plus "Built-in" (defaults only). It starts on the first pack (alphabetically), is remembered per device with the other sound settings, and is hidden when there are no packs. Changing it restarts the current music from the new pack.

- **A folder with `.mid` files in it replaces the defaults for that category.** An empty (or missing) folder uses the defaults from `src/audio/songs.ts`.
- **Several songs in a folder:** one is picked at random. In `menu` and `in-play`, when a song ends the next is picked at random, never the same one twice in a row (a folder with one song repeats it).
- **Pack songs have no manifest entry.** They use the default channel mapping (channel 10 is drums, other channels take lead, harmony, bass and arp in order of appearance). The title is the file name.

## Now playing and Skip

Under the Sound on/off button: **Now playing: <title>** (a pack song's title is its file name) and a **Skip** button, both hidden while nothing plays.

- **Skip in the menu or in-play** fades out (short fade) and starts a different random song from the same place (the same song again if it's the only one).
- **Skip on the intro** ends it, which hands over to menu music just as the intro finishing does. **Skip on game-over** stops it.
- Skip works while muted too (the title still changes).

## Defaults (when a folder is empty)

| Category | Default |
|---|---|
| intro | Concertino in D (Baston), played once |
| menu | Keep Theme (placeholder), looping |
| in-play | none yet (silence) until default songs are added to the manifest |
| game-over | none (the existing game-over sound effect still plays) |

The manifest's `MusicPlace` becomes `intro | menu | in-play | game-over`, and each song lists where it plays as now.

## How the game finds the files

A browser can't list a folder, so a small Vite plugin scans `public/music/music-packs/<pack>/<category>/` when the dev server starts and at build time, and hands the game the list of files per category (a virtual module). In dev it watches the folder, so adding or removing a file reloads the page. File names are URL-encoded when fetched (pack names have spaces and apostrophes).

## Rights

The current pack holds MIDI arrangements of commercial songs, which are under copyright. **Pack contents are git-ignored** (only `music-packs/` itself, kept with a `.gitkeep`, is committed), so a pack stays on your machine and never reaches the public repo or a deployed build made from a clean checkout. Built-in defaults keep the existing rule: a source and licence for every song in the manifest.

## MIDI reader fix

2 of the 16 pack files fail to load today (`Buddy Holly - Weezer.mid`, `Feel Good Inc. - Gorillaz.mid`). The program that wrote them put a broken status byte (`0xF0`, where a program change `0xC0` belongs) into one track, and our reader then rejects the whole file. Fix: **a broken track is cut short at the bad byte and its notes so far are kept**, and the other tracks load normally. The song plays, missing at most the rest of one part.

## Design

```
vite.config.ts            // registers the plugin
tools/musicPacks.ts       // Vite plugin: scans the folders -> virtual:music-packs (Node only)
src/audio/songs.ts        // MusicPlace widened; defaults per place
src/audio/playlist.ts     // pure: songs for a place (pack else defaults), random pick without repeats
src/audio/sequencer.ts    // play-once with an "ended" callback; play(place) uses the playlist
src/audio/midi.ts         // tolerant of a broken track
src/audio/settings.ts     // the chosen pack, saved with mute and volumes
src/ui/soundControls.ts   // the Music (pack) dropdown
src/main.ts               // intro -> menu hand-over, in-play on start, game-over on the keep falling
```

- **Music state in `main.ts`** stays small: `intro` plays on intro dismiss; when it ends, `menu` plays only if we're still in the menus; `startSession` stops whatever plays and starts `in-play`; the game-over dialog opening starts `game-over`.
- **Stopping for a game** cuts quickly (a short fade, as now) instead of waiting for the intro to end. The next song starts once the fade is over.
- **Restart** after game over goes back to in-play music.
- **Direct room links** skip the intro, so audio is still locked when the game starts; in-play music starts at the first click or key press.

## Testing strategy

Vitest, written first:

- **Playlist:** a category with pack files uses only those; an empty category uses the defaults; random pick is injectable and never repeats the last song when there's more than one.
- **Sequencer:** a play-once song calls `ended` after its last note; a looping song never does; `fadeOut` doesn't call `ended`.
- **Hand-over:** the intro ending in the menu starts menu music; the intro ending after a game started does nothing; starting a game during the intro switches to in-play music.
- **Now playing and Skip:** the player reports each song as it starts and nothing when it stops; skipping a shuffled place starts a different song after the fade; skipping a play-once place reports it ended.
- **Plugin:** the folder scan groups `.mid` files by category and ignores other files (tested on a temp folder).
- **MIDI reader:** a fixture with a broken track keeps the good tracks and the notes before the bad byte.
- **Manual (in the browser):** intro plays to the end then menu music; starting a game mid-intro switches to in-play; in-play moves to another song at the end; game-over plays; empty folders fall back to the defaults.

## Boundaries

- **Always:** keep pack contents out of git; fall back to defaults silently if a pack file is missing or broken.
- **Ask first:** committing any pack MIDI file; adding default in-play songs (each needs a source and licence).
- **Never:** let a broken pack file stop the game or the music for other categories.

## Success criteria

1. Each category plays pack songs when its folder has any, and defaults when it's empty.
2. The intro plays once, carries into the menu, hands over to menu music if it ends there, and stops when a game starts.
3. In-play music moves from song to song with no immediate repeats; game-over music plays when the keep falls.
4. All 16 files in the current pack load.
5. `git status` never shows pack MIDI files.
6. The Sound panel shows the song playing, and Skip moves on (or ends the intro into menu music).
7. `npm run typecheck`, `npm test` and `npm run coverage` pass.

## Resolved decisions

1. **Several packs**, each in its own folder (`music-packs/music-pack-1/...`), chosen in the Sound panel.
2. **Game over** stops in-play music and plays a game-over song once.
3. **Menu music shuffles** like in-play.
4. **Now playing and Skip** sit under the mute button (added 2026-10-25).

## Update (2026-10-25): medieval instruments, Online Sequencer files, even loudness

**Medieval instruments.** The MIDI reader keeps each note's General MIDI program (the instrument the file asks for). Each GM family plays on a medieval-flavoured chiptune voice: pianos on harpsichord, guitars and plucked strings on lute, basses on a plucked bass, organs and pads on a portative organ, strings on viol, brass on sackbut, reeds on shawm, pipes and synth leads on recorder, chromatic percussion and synth effects on bells. Drums become a low drum, a tabor and a tambourine. Sound-effect programs are skipped. A song with no program changes at all takes recorder, lute, bass and harpsichord in order of channel appearance. Manifest songs can still override per channel.

**Online Sequencer files.** That site gives each track its own channel number (past 15) and ORs it into the status byte, so `0x90` (note on) comes out as e.g. `0xF5` and note off / program change as `0xE5`. A track that fails a strict read (invalid status byte, a data byte of 0x80 or more, an unterminated sysex) is read again this way: its first event (if it could be a program change) is the program, and every later channel event is a note, on when the velocity is above 0, off when it's 0. The track gets a channel of its own (16 and up), so it never collides with the drums on channel 10. If that read also fails, the strict read's notes up to the bad byte are kept, as before. Notes with velocity 0 stay silent: people draw pictures on that site with silent notes.

**Even loudness.** When a song loads, its loudness is estimated from its notes (each note's volume and envelope, over the song's length) and a gain brings it towards a common level, limited to between a quarter and four times, so a dense arrangement doesn't blast and a quiet one isn't lost.

**Success criteria (added):** Creep, Buddy Holly, Numb and Are We Still Friends play their melodic parts; every song plays on the medieval voices; I'm Still Standing is no longer much louder than the rest. Tests cover the overflowed-channel read, program capture, the program-to-instrument map and the loudness gain.

## Open questions

None.
