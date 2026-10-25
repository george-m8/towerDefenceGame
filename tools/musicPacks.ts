// Music packs: folders of MIDI files at public/music/music-packs/<pack>/<place>/. A browser
// can't list a folder, so this Vite plugin does it when the dev server starts and at build
// time, and hands the game the list as `virtual:music-packs`.
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { MUSIC_PLACES, type MusicPlace, type PackFiles } from "../src/audio/places";

const MODULE_ID = "virtual:music-packs";
const RESOLVED_ID = `\0${MODULE_ID}`;

/** Each pack's .mid files by place, sorted. A missing folder means no packs. */
export function scanMusicPacks(dir: string): PackFiles {
  const packs: PackFiles = {};
  for (const pack of folders(dir)) {
    packs[pack] = {};
    for (const place of folders(join(dir, pack))) {
      if (!MUSIC_PLACES.includes(place as MusicPlace)) continue;
      const songs = readdirSync(join(dir, pack, place), { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.mid$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
      if (songs.length) packs[pack][place as MusicPlace] = songs;
    }
  }
  return packs;
}

function folders(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function musicPacks(dir = "public/music/music-packs"): Plugin {
  return {
    name: "music-packs",
    resolveId: (id) => (id === MODULE_ID ? RESOLVED_ID : undefined),
    load: (id) =>
      id === RESOLVED_ID ? `export default ${JSON.stringify(scanMusicPacks(dir))};` : undefined,
    configureServer(server) {
      // Adding or removing a song reloads the page with the new list.
      const folder = resolve(dir);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(folder)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.add(folder);
      for (const event of ["add", "unlink", "addDir", "unlinkDir"])
        server.watcher.on(event, changed);
    },
  };
}
