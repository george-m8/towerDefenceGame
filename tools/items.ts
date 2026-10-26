// `.items` files (SPEC-items-editor.md): what players may build, and how many at once, in items/
// at the repo root. Served to the game as `virtual:items` and saved by the items editor through
// `/__items` under the dev server, like maps (dataFiles.ts).
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { parseItems, serializeItems, type ItemsFile } from "../src/sim/itemsFile";
import {
  dataFilesPlugin,
  saveFile,
  scanFiles,
  serveFiles,
  type DataFileKind,
  type SaveResult,
} from "./dataFiles";

/** Where the items editor talks to the dev server. */
export const ITEMS_ENDPOINT = "/__items";

const ITEMS_FILES: DataFileKind<ItemsFile> = {
  ext: ".items",
  noun: "items file",
  moduleId: "virtual:items",
  endpoint: ITEMS_ENDPOINT,
  parse: (json) => {
    const result = parseItems(json);
    return "items" in result ? { file: result.items } : result;
  },
  serialize: serializeItems,
};

/** Every readable `.items` file in `dir`, by name (without `.items`), sorted. */
export const scanItems = (dir: string, warn?: (message: string) => void) =>
  scanFiles(ITEMS_FILES, dir, warn);

export const saveItems = (dir: string, name: string, body: string): SaveResult =>
  saveFile(ITEMS_FILES, dir, name, body);

export const items = (dir = "items"): Plugin => dataFilesPlugin(ITEMS_FILES, dir);

/** The dev server's endpoint: GET lists the items files now on disk; POST /<name> saves one. */
export const serveItems = (dir: string, req: IncomingMessage, res: ServerResponse) =>
  serveFiles(ITEMS_FILES, dir, req, res);
