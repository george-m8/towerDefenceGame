// Which songs play where: the active music pack's songs for a place if it has any there,
// otherwise the built-in songs listed for that place. Pure.
import type { MusicPlace, PackFiles } from "./places";
import type { SongEntry } from "./songs";

/** The choice that means "no pack, built-in songs only". */
export const BUILT_IN = "built-in";

/** The chosen pack if it's there; otherwise the first pack (or none). */
export function activePack(packs: PackFiles, chosen: string | null): string | null {
  if (chosen === BUILT_IN) return null;
  if (chosen !== null && chosen in packs) return chosen;
  return Object.keys(packs).sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export function songsFor(
  place: MusicPlace,
  pack: string | null,
  packs: PackFiles,
  builtIn: readonly SongEntry[],
): SongEntry[] {
  const files = (pack !== null && packs[pack]?.[place]) || [];
  if (files.length) return files.map((file) => packSong(pack!, place, file));
  return builtIn.filter((song) => song.plays.includes(place));
}

/** A pack's MIDI file as a song: played once, with the default channel mapping. */
function packSong(pack: string, place: MusicPlace, file: string): SongEntry {
  return {
    id: `${pack}/${place}/${file}`,
    title: file.replace(/\.mid$/i, ""),
    plays: [place],
    loop: false,
    source: `Music pack "${pack}"`,
    licence: "Your own copy (kept out of git)",
    file: ["music-packs", pack, place, file].map(encodeURIComponent).join("/"),
  };
}

/** A random song, never the one that just played (`lastId`) when there's a choice. */
export function pickSong(
  songs: readonly SongEntry[],
  lastId: string | null,
  random: () => number = Math.random,
): SongEntry | null {
  const choices = songs.length > 1 ? songs.filter((song) => song.id !== lastId) : songs;
  return choices[Math.floor(random() * choices.length)] ?? null;
}
