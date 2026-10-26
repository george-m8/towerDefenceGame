import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newItems, parseItems, serializeItems, withLimit } from "../../src/sim/itemsFile";
import { items as itemsPlugin, saveItems, scanItems } from "../../tools/items";

let root = "";
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function folder(): string {
  root = mkdtempSync(join(tmpdir(), "items-"));
  return root;
}

const sample = withLimit(newItems("Sample"), "cannon", 2);

describe("scanItems", () => {
  it("lists each .items file by name, parsed, and skips broken ones", () => {
    const dir = folder();
    writeFileSync(join(dir, "towers.items"), serializeItems(sample));
    writeFileSync(join(dir, "broken.items"), "{ nope");
    writeFileSync(join(dir, "level.map"), "{}");
    const warnings: string[] = [];
    expect(scanItems(dir, (w) => warnings.push(w))).toEqual({ towers: sample });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("broken.items");
  });
});

describe("saveItems", () => {
  it("writes a readable file", () => {
    const dir = folder();
    expect(saveItems(dir, "towers", JSON.stringify(sample)).ok).toBe(true);
    expect(readFileSync(join(dir, "towers.items"), "utf8")).toBe(serializeItems(sample));
  });

  it("refuses bad names and bad files, writing nothing", () => {
    const dir = folder();
    expect(saveItems(dir, "../escape", JSON.stringify(sample))).toMatchObject({
      ok: false,
      error: expect.stringContaining("isn't an items file name"),
    });
    expect(saveItems(dir, "bad", JSON.stringify({ format: "nope" }))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("the plugin", () => {
  it("serves the files as virtual:items", () => {
    const dir = folder();
    writeFileSync(join(dir, "towers.items"), serializeItems(sample));
    const plugin = itemsPlugin(dir);
    const resolve = plugin.resolveId as (id: string) => string | undefined;
    const load = plugin.load as (id: string) => string | undefined;
    const code = load(resolve("virtual:items")!)!;
    expect(JSON.parse(code.replace(/^export default /, "").replace(/;$/, ""))).toEqual({
      towers: sample,
    });
  });
});

describe("the items files in the repo", () => {
  it("every one parses", () => {
    const files = scanItems("items", (w) => {
      throw new Error(w);
    });
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const [name, file] of Object.entries(files)) {
      expect(parseItems(JSON.parse(serializeItems(file))), name).toEqual({ items: file });
    }
  });
});
