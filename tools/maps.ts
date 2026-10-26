// `.map` files (SPEC-map-editor.md): hand-made maps in maps/ at the repo root. A browser can't
// list a folder, so this Vite plugin reads them when the dev server starts and at build time and
// hands the game the parsed maps as `virtual:maps`, in the client and the server builds alike.
// Under the dev server it also lets the map editor list and save them (`/__maps`); that endpoint
// doesn't exist in a build.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { MAP_EDITOR } from "../src/sim/config";
import { MAP_NAME_PATTERN, parseMap, serializeMap, type MapFile } from "../src/sim/mapFile";

const MODULE_ID = "virtual:maps";
const RESOLVED_ID = `\0${MODULE_ID}`;
/** Where the editor talks to the dev server. */
export const MAPS_ENDPOINT = "/__maps";

/** Every readable `.map` file in `dir`, by name (without `.map`), sorted. */
export function scanMaps(dir: string, warn: (message: string) => void = console.warn) {
  const maps: Record<string, MapFile> = {};
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".map"))
      .map((entry) => entry.name.slice(0, -".map".length))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return maps; // no folder, no maps
  }
  for (const name of names) {
    const file = join(dir, `${name}.map`);
    try {
      const result = parseMap(JSON.parse(readFileSync(file, "utf8")));
      if ("map" in result) maps[name] = result.map;
      else warn(`maps: skipping ${name}.map: ${result.error}`);
    } catch (e) {
      warn(`maps: skipping ${name}.map: ${(e as Error).message}`);
    }
  }
  return maps;
}

export type SaveResult = { ok: true; file: string } | { ok: false; status: number; error: string };

/** Writes a map sent by the editor to `dir/<name>.map`, after checking the name and the map. */
export function saveMap(dir: string, name: string, body: string): SaveResult {
  if (!MAP_NAME_PATTERN.test(name)) {
    return { ok: false, status: 400, error: `"${name}" isn't a map name (a-z, 0-9 and dashes)` };
  }
  if (Buffer.byteLength(body) > MAP_EDITOR.maxFileBytes) {
    return { ok: false, status: 413, error: "That map is too big to save" };
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "That isn't JSON" };
  }
  const result = parseMap(json);
  if ("error" in result) return { ok: false, status: 400, error: result.error };
  const folder = resolve(dir);
  const file = resolve(folder, `${name}.map`);
  if (!file.startsWith(folder + "/") && !file.startsWith(folder + "\\")) {
    return { ok: false, status: 400, error: "Maps can only be saved in the maps folder" };
  }
  writeFileSync(file, serializeMap(result.map));
  return { ok: true, file };
}

export function maps(dir = "maps"): Plugin {
  return {
    name: "maps",
    resolveId: (id) => (id === MODULE_ID ? RESOLVED_ID : undefined),
    load: (id) =>
      id === RESOLVED_ID ? `export default ${JSON.stringify(scanMaps(dir))};` : undefined,
    configureServer(server) {
      // A changed map refreshes the list for the next import, without reloading the page (the
      // editor would lose its undo history every time it saved).
      const folder = resolve(dir);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(folder)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.add(folder);
      for (const event of ["add", "change", "unlink"]) server.watcher.on(event, changed);
      server.middlewares.use(MAPS_ENDPOINT, (req, res) => void serveMaps(dir, req, res));
    },
  };
}

/**
 * The dev server's endpoint, mounted at MAPS_ENDPOINT (so `req.url` is what follows it):
 * GET lists the maps now on disk; POST /<name> saves one.
 */
export async function serveMaps(dir: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  const name = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\//, ""));
  if (req.method === "GET" && name === "") return reply(200, scanMaps(dir));
  if (req.method !== "POST") return reply(405, { error: "GET the list, or POST a map" });
  let body = "";
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAP_EDITOR.maxFileBytes) return reply(413, { error: "That map is too big to save" });
    body += chunk;
  }
  const result = saveMap(dir, name, body);
  if (result.ok) reply(200, { saved: `${name}.map` });
  else reply(result.status, { error: result.error });
}
