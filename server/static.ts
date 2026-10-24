// Serves the built game (dist/) in production, so one process hosts the page and /ws.
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/** A request handler for files under `dir`. Anything outside it, or missing, is a 404. */
export function serveStatic(dir: string) {
  const root = resolve(dir);
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const file = resolveFile(root, req.url ?? "/");
    if (!file) return notFound(res);
    try {
      if (!(await stat(file)).isFile()) return notFound(res);
      const body = await readFile(file);
      const type = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type }).end(body);
    } catch {
      notFound(res);
    }
  };
}

/** The file a URL maps to inside `root`, or null if it would escape it. */
function resolveFile(root: string, url: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, "http://x").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  const file = resolve(join(root, pathname === "/" ? "index.html" : pathname));
  return file.startsWith(root + sep) ? file : null;
}

function notFound(res: ServerResponse) {
  res.writeHead(404).end();
}
