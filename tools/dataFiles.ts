// A folder of design files at the repo root (`.map` files in maps/, `.items` files in items/),
// shared by their Vite plugins. A browser can't list a folder, so the plugin reads the files when
// the dev server starts and at build time and hands the game the parsed files as a virtual
// module, in the client and the server builds alike. Under the dev server it also lets the
// editors list and save them (GET and POST on an endpoint); that endpoint doesn't exist in a build.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { MAP_EDITOR } from "../src/sim/config";
import { MAP_NAME_PATTERN } from "../src/sim/mapFile";

/** One kind of design file: where it lives and how it's read and written. */
export interface DataFileKind<T> {
  /** The extension, with its dot (".map"). */
  ext: string;
  /** What one is called in messages ("map"). */
  noun: string;
  /** The virtual module the files are served as ("virtual:maps"). */
  moduleId: string;
  /** Where the editor talks to the dev server ("/__maps"). */
  endpoint: string;
  parse(json: unknown): { file: T } | { error: string };
  serialize(file: T): string;
}

/** Every readable file of this kind in `dir`, by name (without the extension), sorted. */
export function scanFiles<T>(
  kind: DataFileKind<T>,
  dir: string,
  warn: (message: string) => void = console.warn,
): Record<string, T> {
  const files: Record<string, T> = {};
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(kind.ext))
      .map((entry) => entry.name.slice(0, -kind.ext.length))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return files; // no folder, no files
  }
  for (const name of names) {
    const file = join(dir, `${name}${kind.ext}`);
    try {
      const result = kind.parse(JSON.parse(readFileSync(file, "utf8")));
      if ("file" in result) files[name] = result.file;
      else warn(`${dir}: skipping ${name}${kind.ext}: ${result.error}`);
    } catch (e) {
      warn(`${dir}: skipping ${name}${kind.ext}: ${(e as Error).message}`);
    }
  }
  return files;
}

export type SaveResult = { ok: true; file: string } | { ok: false; status: number; error: string };

/** Writes a file sent by an editor to `dir/<name><ext>`, after checking the name and the file. */
export function saveFile<T>(
  kind: DataFileKind<T>,
  dir: string,
  name: string,
  body: string,
): SaveResult {
  if (!MAP_NAME_PATTERN.test(name)) {
    return {
      ok: false,
      status: 400,
      error: `"${name}" isn't ${/^[aeiou]/.test(kind.noun) ? "an" : "a"} ${kind.noun} name (a-z, 0-9 and dashes)`,
    };
  }
  if (Buffer.byteLength(body) > MAP_EDITOR.maxFileBytes) {
    return { ok: false, status: 413, error: `That ${kind.noun} is too big to save` };
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "That isn't JSON" };
  }
  const result = kind.parse(json);
  if ("error" in result) return { ok: false, status: 400, error: result.error };
  const folder = resolve(dir);
  const file = resolve(folder, `${name}${kind.ext}`);
  if (!file.startsWith(folder + "/") && !file.startsWith(folder + "\\")) {
    return { ok: false, status: 400, error: `Files can only be saved in the ${dir} folder` };
  }
  writeFileSync(file, kind.serialize(result.file));
  return { ok: true, file };
}

export function dataFilesPlugin<T>(kind: DataFileKind<T>, dir: string): Plugin {
  const resolvedId = `\0${kind.moduleId}`;
  return {
    name: kind.moduleId.replace(/^virtual:/, ""),
    resolveId: (id) => (id === kind.moduleId ? resolvedId : undefined),
    load: (id) =>
      id === resolvedId ? `export default ${JSON.stringify(scanFiles(kind, dir))};` : undefined,
    configureServer(server) {
      // A changed file refreshes the list for the next import, without reloading the page (the
      // editor would lose its undo history every time it saved).
      const folder = resolve(dir);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(folder)) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.add(folder);
      for (const event of ["add", "change", "unlink"]) server.watcher.on(event, changed);
      server.middlewares.use(kind.endpoint, (req, res) => void serveFiles(kind, dir, req, res));
    },
  };
}

/**
 * The dev server's endpoint, mounted at the kind's endpoint (so `req.url` is what follows it):
 * GET lists the files now on disk; POST /<name> saves one.
 */
export async function serveFiles<T>(
  kind: DataFileKind<T>,
  dir: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const reply = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  const name = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\//, ""));
  if (req.method === "GET" && name === "") return reply(200, scanFiles(kind, dir));
  if (req.method !== "POST") return reply(405, { error: "GET the list, or POST a file" });
  let body = "";
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAP_EDITOR.maxFileBytes) {
      return reply(413, { error: `That ${kind.noun} is too big to save` });
    }
    body += chunk;
  }
  const result = saveFile(kind, dir, name, body);
  if (result.ok) reply(200, { saved: `${name}${kind.ext}` });
  else reply(result.status, { error: result.error });
}
