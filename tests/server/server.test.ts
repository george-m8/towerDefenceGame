import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startServer, type GameServer } from "../../server/server";

let server: GameServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

describe("server", () => {
  it("accepts WebSocket connections on /ws", async () => {
    let connections = 0;
    server = await startServer("127.0.0.1", 0, () => connections++);
    const socket = await connect(`ws://127.0.0.1:${server.port}/ws`);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
    expect(connections).toBe(1);
  });

  it("refuses WebSocket connections on other paths", async () => {
    server = await startServer("127.0.0.1", 0);
    await expect(connect(`ws://127.0.0.1:${server.port}/other`)).rejects.toThrow();
  });
});

describe("static files (production)", () => {
  function siteDir(): string {
    const root = mkdtempSync(join(tmpdir(), "td-static-"));
    const site = join(root, "dist");
    mkdirSync(join(site, "assets"), { recursive: true });
    writeFileSync(join(site, "index.html"), "<h1>game</h1>");
    writeFileSync(join(site, "assets", "app.js"), "console.log(1)");
    writeFileSync(join(root, "secret.txt"), "nope");
    return site;
  }

  async function get(path: string) {
    const res = await fetch(`http://127.0.0.1:${server!.port}${path}`);
    return { status: res.status, type: res.headers.get("content-type"), body: await res.text() };
  }

  it("serves the built game next to /ws", async () => {
    server = await startServer("127.0.0.1", 0, () => {}, siteDir());
    expect(await get("/")).toMatchObject({ status: 200, body: "<h1>game</h1>" });
    expect((await get("/")).type).toContain("text/html");
    expect(await get("/assets/app.js")).toMatchObject({ status: 200, body: "console.log(1)" });
    expect((await get("/assets/app.js")).type).toContain("text/javascript");
    const socket = await connect(`ws://127.0.0.1:${server.port}/ws`);
    socket.close();
  });

  it("never serves files outside the site folder", async () => {
    server = await startServer("127.0.0.1", 0, () => {}, siteDir());
    expect((await get("/../secret.txt")).status).toBe(404);
    expect((await get("/%2e%2e/secret.txt")).status).toBe(404);
    expect((await get("/assets/%2e%2e/%2e%2e/secret.txt")).status).toBe(404);
    expect((await get("/missing.js")).status).toBe(404);
    expect((await get("/assets")).status).toBe(404); // a folder
  });

  it("serves nothing over HTTP without a site folder", async () => {
    server = await startServer("127.0.0.1", 0);
    expect((await get("/")).status).toBe(404);
  });
});
