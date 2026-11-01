// Campaign levels: a folder per level in levels/ at the repo root, holding one `.map`, at most one
// `.items` and one `.level` file (any names). The folders are played in name order, so they're
// numbered ("01-starter"). Served to the game as `virtual:levels`, read at dev server start and
// build time like the other design files (dataFiles.ts); there's no editor for them yet.
// `npm run level-icons` saves each level's icon (its map, simplified) into its `.level` file.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { parseItems } from "../src/sim/itemsFile";
import { ICON_SIDES, mapIcon, parseLevel, serializeLevel, type Level } from "../src/sim/levelFile";
import { MAP_NAME_PATTERN, parseMap } from "../src/sim/mapFile";

export const LEVELS_MODULE = "virtual:levels";

/** Reads the one file in `files` with this extension: null if there's none, an error if two. */
function readOne<T>(
  folder: string,
  files: string[],
  ext: string,
  parse: (json: unknown) => { file: T } | { error: string },
): { file: T | null } | { error: string } {
  const found = files.filter((f) => f.endsWith(ext));
  if (found.length === 0) return { file: null };
  if (found.length > 1)
    return { error: `it has ${found.length} ${ext} files (${found.join(", ")})` };
  try {
    const result = parse(JSON.parse(readFileSync(join(folder, found[0]), "utf8")));
    return "error" in result ? { error: `${found[0]}: ${result.error}` } : result;
  } catch (e) {
    return { error: `${found[0]}: ${(e as Error).message}` };
  }
}

/** One level's folder, read and checked, and where its `.level` file is. */
export function readLevel(folder: string): { level: Level; file: string } | { error: string } {
  const files = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const level = readOne(folder, files, ".level", (json) => {
    const r = parseLevel(json);
    return "level" in r ? { file: r.level } : r;
  });
  if ("error" in level) return level;
  if (!level.file) return { error: "it has no .level file" };
  // The map's mode is the level's.
  const map = readOne(folder, files, ".map", (json) => {
    const r = parseMap(json, { mode: level.file!.mode });
    return "map" in r ? { file: r.map } : r;
  });
  if ("error" in map) return map;
  if (!map.file) return { error: "it has no .map file" };
  const items = readOne(folder, files, ".items", (json) => {
    const r = parseItems(json);
    return "items" in r ? { file: r.items } : r;
  });
  if ("error" in items) return items;
  return {
    level: { level: level.file, map: map.file, ...(items.file ? { items: items.file } : {}) },
    file: join(
      folder,
      files.find((f) => f.endsWith(".level"))!,
    ),
  };
}

/** Whether a level's saved icon is there, and the size its map's calls for. */
const iconFits = ({ level, map }: Level) => level.icon?.length === ICON_SIDES[map.size];

/** Every readable level folder in `dir`, by folder name, in name order. */
export function scanLevels(
  dir: string,
  warn: (message: string) => void = console.warn,
): Record<string, Level> {
  const levels: Record<string, Level> = {};
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return levels; // no folder, no levels
  }
  for (const name of names) {
    if (!MAP_NAME_PATTERN.test(name)) {
      warn(`${dir}: skipping ${name}: a level's folder name is a-z, 0-9 and dashes`);
      continue;
    }
    const result = readLevel(join(dir, name));
    if ("error" in result) {
      warn(`${dir}: skipping ${name}: ${result.error}`);
      continue;
    }
    const { level } = result;
    if (!iconFits(level)) {
      warn(`${dir}: ${name} has no icon for its map saved (npm run level-icons): making one`);
      level.level = { ...level.level, icon: mapIcon(level.map) };
    }
    levels[name] = level;
  }
  return levels;
}

/**
 * Saves each level's icon, made from its map, into its `.level` file: only where there's none
 * that fits the map yet (so a hand-made one stays), or every one with `all`. Returns the
 * folders whose files were written.
 */
export function saveLevelIcons(
  dir: string,
  { all = false, warn = console.warn }: { all?: boolean; warn?: (message: string) => void } = {},
): string[] {
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  const written: string[] = [];
  for (const name of names) {
    const result = readLevel(join(dir, name));
    if ("error" in result) {
      warn(`${dir}: skipping ${name}: ${result.error}`);
      continue;
    }
    if (!all && iconFits(result.level)) continue;
    const { level, map } = result.level;
    writeFileSync(result.file, serializeLevel({ ...level, icon: mapIcon(map) }));
    written.push(name);
  }
  return written;
}

export function levels(dir = "levels"): Plugin {
  const resolvedId = `\0${LEVELS_MODULE}`;
  return {
    name: "levels",
    resolveId: (id) => (id === LEVELS_MODULE ? resolvedId : undefined),
    load: (id) =>
      id === resolvedId ? `export default ${JSON.stringify(scanLevels(dir))};` : undefined,
    configureServer(server) {
      // A changed file refreshes the list for the next page load.
      const folder = resolve(dir);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(folder)) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.add(folder);
      for (const event of ["add", "change", "unlink"]) server.watcher.on(event, changed);
    },
  };
}
