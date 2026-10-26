import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAP_EDITOR } from "../../src/sim/config";
import { mapFromGenerated } from "../../src/sim/game";
import { mapName, parseMap, serializeMap, validateMap } from "../../src/sim/mapFile";
import { maps as mapsPlugin, saveMap, scanMaps, serveMaps } from "../../tools/maps";

let root = "";
let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
  if (root) rmSync(root, { recursive: true, force: true });
});

function folder(): string {
  root = mkdtempSync(join(tmpdir(), "maps-"));
  return root;
}

const sample = mapFromGenerated("Sample", "endless", "XS", 4);

describe("scanMaps", () => {
  it("lists each .map file by name, parsed, sorted", () => {
    const dir = folder();
    writeFileSync(join(dir, "zebra.map"), serializeMap(sample));
    writeFileSync(join(dir, "alpha.map"), serializeMap({ ...sample, title: "Alpha" }));
    writeFileSync(join(dir, "notes.txt"), "not a map");
    const maps = scanMaps(dir);
    expect(Object.keys(maps)).toEqual(["alpha", "zebra"]);
    expect(maps.alpha.title).toBe("Alpha");
    expect(maps.zebra).toEqual(sample);
  });

  it("skips a broken file with a warning, and lists nothing for a missing folder", () => {
    const dir = folder();
    writeFileSync(join(dir, "broken.map"), "{ not json");
    writeFileSync(join(dir, "wrong.map"), JSON.stringify({ format: "nope" }));
    const warnings: string[] = [];
    expect(scanMaps(dir, (w) => warnings.push(w))).toEqual({});
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toContain("wrong.map");
    expect(scanMaps(join(dir, "missing"))).toEqual({});
  });
});

describe("saveMap", () => {
  it("writes the map as a readable file that lists back the same", () => {
    const dir = folder();
    const result = saveMap(dir, "river-crossing", JSON.stringify(sample));
    expect(result.ok).toBe(true);
    expect(readFileSync(join(dir, "river-crossing.map"), "utf8")).toBe(serializeMap(sample));
    expect(scanMaps(dir)["river-crossing"]).toEqual(sample);
  });

  it.each([
    ["a name with a slash", "../escape"],
    ["a name with capitals", "River"],
    ["an empty name", ""],
    ["a name with a dot", "a.b"],
  ])("refuses %s, writing nothing", (_, name) => {
    const dir = folder();
    expect(saveMap(dir, name, JSON.stringify(sample))).toMatchObject({ ok: false, status: 400 });
    expect(readdirSync(dir)).toEqual([]);
    expect(existsSync(join(dir, "..", "escape.map"))).toBe(false);
  });

  it("refuses something that isn't a map, or is too big", () => {
    const dir = folder();
    expect(saveMap(dir, "bad", "{ nope")).toMatchObject({ ok: false, error: "That isn't JSON" });
    expect(saveMap(dir, "bad", JSON.stringify({ format: "nope" }))).toMatchObject({
      ok: false,
      status: 400,
    });
    const huge = " ".repeat(MAP_EDITOR.maxFileBytes + 1);
    expect(saveMap(dir, "big", huge)).toMatchObject({ ok: false, status: 413 });
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("map names", () => {
  it.each([
    ["River Crossing!", "river-crossing"],
    ["  Two   spaces  ", "two-spaces"],
    ["Fjörd 2", "fjord-2"],
    ["!!!", "untitled"],
  ])("%s is saved as %s", (title, name) => {
    expect(mapName(title)).toBe(name);
  });
});

describe("the maps in the repo", () => {
  it("every one parses and has no errors", () => {
    const maps = scanMaps("maps", (w) => {
      throw new Error(w);
    });
    expect(Object.keys(maps).length).toBeGreaterThan(0);
    for (const [name, map] of Object.entries(maps)) {
      expect(parseMap(JSON.parse(serializeMap(map))), name).toEqual({ map });
      expect(validateMap(map).errors, name).toEqual([]);
    }
  });
});

describe("the plugin", () => {
  it("serves the maps as virtual:maps", () => {
    const dir = folder();
    writeFileSync(join(dir, "alpha.map"), serializeMap(sample));
    const plugin = mapsPlugin(dir);
    const resolve = plugin.resolveId as (id: string) => string | undefined;
    const load = plugin.load as (id: string) => string | undefined;
    const id = resolve("virtual:maps")!;
    expect(resolve("something-else")).toBeUndefined();
    const code = load(id)!;
    expect(JSON.parse(code.replace(/^export default /, "").replace(/;$/, ""))).toEqual({
      alpha: sample,
    });
    expect(load("something-else")).toBeUndefined();
  });
});

describe("the dev server's endpoint", () => {
  /** A real HTTP server with the endpoint mounted at its root, as Vite mounts it at /__maps. */
  async function serve(dir: string): Promise<string> {
    server = createServer((req, res) => void serveMaps(dir, req, res));
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    const address = server.address() as { port: number };
    return `http://127.0.0.1:${address.port}`;
  }

  it("lists the maps on disk, and saves one", async () => {
    const dir = folder();
    const url = await serve(dir);
    expect(await (await fetch(`${url}/`)).json()).toEqual({});
    const saved = await fetch(`${url}/river-crossing`, {
      method: "POST",
      body: serializeMap(sample),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ saved: "river-crossing.map" });
    expect(await (await fetch(`${url}/`)).json()).toEqual({ "river-crossing": sample });
  });

  it("refuses other methods, bad names and oversize bodies, writing nothing", async () => {
    const dir = folder();
    const url = await serve(dir);
    expect((await fetch(`${url}/x`, { method: "PUT", body: "{}" })).status).toBe(405);
    const badName = await fetch(`${url}/Bad%20Name`, {
      method: "POST",
      body: serializeMap(sample),
    });
    expect(badName.status).toBe(400);
    expect((await badName.json()).error).toContain("isn't a map name");
    const huge = await fetch(`${url}/big`, {
      method: "POST",
      body: " ".repeat(MAP_EDITOR.maxFileBytes + 1),
    });
    expect(huge.status).toBe(413);
    expect(readdirSync(dir)).toEqual([]);
  });
});
