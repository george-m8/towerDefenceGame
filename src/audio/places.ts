// Where music plays. Also the category folders of a music pack, so it has no imports: the
// Vite plugin that scans the packs (tools/musicPacks.ts) runs in Node and uses it too.

export const MUSIC_PLACES = ["intro", "menu", "in-play", "game-over"] as const;
export type MusicPlace = (typeof MUSIC_PLACES)[number];

/** A pack's MIDI file names per place, by pack name. */
export type PackFiles = Record<string, Partial<Record<MusicPlace, string[]>>>;
