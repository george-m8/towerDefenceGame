import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAP_EDITOR } from "../../src/sim/config";
import { mapFromGenerated } from "../../src/sim/game";
import { mapName, parseMap, serializeMap, validateMap } from "../../src/sim/mapFile";
import { saveMap, scanMaps } from "../../tools/maps";

let root = "";
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

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
