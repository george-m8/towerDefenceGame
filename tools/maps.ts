// `.map` files (SPEC-map-editor.md): hand-made maps in maps/ at the repo root, served to the game
// as `virtual:maps` and saved by the map editor through `/__maps` under the dev server. The
// folder plugin itself is shared with the other design files (dataFiles.ts).
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { parseMap, serializeMap, type MapFile } from "../src/sim/mapFile";
import {
  dataFilesPlugin,
  saveFile,
  scanFiles,
  serveFiles,
  type DataFileKind,
  type SaveResult,
} from "./dataFiles";

export type { SaveResult };

/** Where the editor talks to the dev server. */
export const MAPS_ENDPOINT = "/__maps";

const MAP_FILES: DataFileKind<MapFile> = {
  ext: ".map",
  noun: "map",
  moduleId: "virtual:maps",
  endpoint: MAPS_ENDPOINT,
  parse: (json) => {
    const result = parseMap(json);
    return "map" in result ? { file: result.map } : result;
  },
  serialize: serializeMap,
};

/** Every readable `.map` file in `dir`, by name (without `.map`), sorted. */
export const scanMaps = (dir: string, warn?: (message: string) => void) =>
  scanFiles(MAP_FILES, dir, warn);

/** Writes a map sent by the editor to `dir/<name>.map`, after checking the name and the map. */
export const saveMap = (dir: string, name: string, body: string): SaveResult =>
  saveFile(MAP_FILES, dir, name, body);

export const maps = (dir = "maps"): Plugin => dataFilesPlugin(MAP_FILES, dir);

/** The dev server's endpoint: GET lists the maps now on disk; POST /<name> saves one. */
export const serveMaps = (dir: string, req: IncomingMessage, res: ServerResponse) =>
  serveFiles(MAP_FILES, dir, req, res);
