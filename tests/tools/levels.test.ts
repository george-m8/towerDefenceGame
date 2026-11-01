import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mapFromGenerated } from "../../src/sim/game";
import { newItems, serializeItems, withLimit } from "../../src/sim/itemsFile";
import { mapIcon, newLevel, parseLevel, serializeLevel } from "../../src/sim/levelFile";
import { serializeMap } from "../../src/sim/mapFile";
import { levels as levelsPlugin, saveLevelIcons, scanLevels } from "../../tools/levels";

let root = "";
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const map = mapFromGenerated("Sample", "endless", "XS", 4);
const items = withLimit(newItems("Sample"), "cannon", 0);
const level = { ...newLevel("Starter"), icon: mapIcon(map) };

/** A levels folder with these level folders, each its files by name. */
function folder(levels: Record<string, Record<string, string>>): string {
  root = mkdtempSync(join(tmpdir(), "levels-"));
  for (const [name, files] of Object.entries(levels)) {
    mkdirSync(join(root, name));
    for (const [file, text] of Object.entries(files)) writeFileSync(join(root, name, file), text);
  }
  return root;
}

/** A level's map, as saved: without a mode (that's in the .level file). */
const { mode: _mode, ...modeless } = map;
const mapText = serializeMap(modeless);

const whole = {
  "a.level": serializeLevel(level),
  "a.map": mapText,
  "a.items": serializeItems(items),
};

describe("scanLevels", () => {
  it("reads each folder's level, map and items, in name order", () => {
    const { "a.items": _, ...noItems } = whole;
    const dir = folder({ "02-next": noItems, "01-starter": whole });
    writeFileSync(join(dir, "stray.level"), serializeLevel(level));
    const found = scanLevels(dir, () => {});
    expect(Object.keys(found)).toEqual(["01-starter", "02-next"]);
    expect(found["01-starter"]).toEqual({ level, map, items });
    expect(found["02-next"]).toEqual({ level, map });
  });

  it("skips folders that are missing files, have two of one, or have a bad file or name", () => {
    const { "a.level": _l, ...noLevel } = whole;
    const { "a.map": _m, ...noMap } = whole;
    const dir = folder({
      "no-level": noLevel,
      "no-map": noMap,
      "two-maps": { ...whole, "b.map": mapText },
      "map-with-mode": { ...whole, "a.map": serializeMap(map) },
      "bad-items": { ...whole, "a.items": "{ nope" },
      "bad-level": { ...whole, "a.level": "{}" },
      Capitals: whole,
      fine: whole,
    });
    const warnings: string[] = [];
    expect(Object.keys(scanLevels(dir, (w) => warnings.push(w)))).toEqual(["fine"]);
    const joined = warnings.join("\n");
    for (const expected of [
      "no-level: it has no .level file",
      "no-map: it has no .map file",
      "two-maps: it has 2 .map files",
      "map-with-mode: a.map: a level's map has no mode of its own",
      "bad-items: a.items",
      "bad-level: a.level",
      "Capitals: a level's folder name",
    ]) {
      expect(joined).toContain(expected);
    }
  });

  it("makes an icon from the map, with a warning, where none that fits is saved", () => {
    const wrongSize = { ...level, icon: [["keep"]] };
    const dir = folder({
      none: { ...whole, "a.level": serializeLevel(newLevel("Starter")) },
      "wrong-size": { ...whole, "a.level": serializeLevel(wrongSize) },
    });
    const warnings: string[] = [];
    const found = scanLevels(dir, (w) => warnings.push(w));
    expect(found.none.level).toEqual(level);
    expect(found["wrong-size"].level).toEqual(level);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("npm run level-icons");
  });

  it("finds no levels without a folder", () => {
    expect(scanLevels(join(tmpdir(), "no-such-levels-folder"))).toEqual({});
  });
});

describe("saveLevelIcons", () => {
  const saved = (dir: string, name: string) =>
    parseLevel(JSON.parse(readFileSync(join(dir, name, "a.level"), "utf8")));

  it("saves an icon into each .level file without one that fits, keeping a hand-made one", () => {
    const handMade = { ...level, icon: level.icon!.map((row) => row.map(() => "keep")) };
    const dir = folder({
      none: { ...whole, "a.level": serializeLevel(newLevel("Starter")) },
      "hand-made": { ...whole, "a.level": serializeLevel(handMade) },
      broken: { "a.level": "{}" },
    });
    const warnings: string[] = [];
    expect(saveLevelIcons(dir, { warn: (w) => warnings.push(w) })).toEqual(["none"]);
    expect(saved(dir, "none")).toEqual({ level });
    expect(saved(dir, "hand-made")).toEqual({ level: handMade });
    expect(warnings).toHaveLength(1);
    expect(saveLevelIcons(dir, { all: true, warn: () => {} })).toEqual(["hand-made", "none"]);
    expect(saved(dir, "hand-made")).toEqual({ level });
  });

  it("saves nothing without a folder", () => {
    expect(saveLevelIcons(join(tmpdir(), "no-such-levels-folder"))).toEqual([]);
  });
});

describe("the plugin", () => {
  it("serves the levels as virtual:levels", () => {
    const dir = folder({ "01-starter": whole });
    const plugin = levelsPlugin(dir);
    const resolve = plugin.resolveId as (id: string) => string | undefined;
    const load = plugin.load as (id: string) => string | undefined;
    const id = resolve("virtual:levels")!;
    const code = load(id)!;
    expect(JSON.parse(code.replace(/^export default |;$/g, ""))).toEqual({
      "01-starter": { level, map, items },
    });
    expect(resolve("something-else")).toBeUndefined();
    expect(load("something-else")).toBeUndefined();
  });
});

describe("levels/", () => {
  it("has a Starter level first, and every level in it reads", () => {
    const warnings: string[] = [];
    const found = scanLevels("levels", (w) => warnings.push(w));
    expect(warnings).toEqual([]);
    expect(Object.values(found)[0].level.title).toBe("Starter");
  });
});
