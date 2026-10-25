import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { musicPacks, scanMusicPacks } from "../../tools/musicPacks";

let root = "";
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

/** Makes a temporary packs folder holding `files` (paths relative to it). */
function packsFolder(files: string[]): string {
  root = mkdtempSync(join(tmpdir(), "music-packs-"));
  for (const file of files) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), "");
  }
  return root;
}

describe("scanMusicPacks", () => {
  it("lists each pack's MIDI files by category, sorted", () => {
    const dir = packsFolder([
      "pack-1/in-play/b song.mid",
      "pack-1/in-play/A song.MID",
      "pack-1/intro/theme.mid",
      "pack-2/menu/loop.mid",
    ]);
    expect(scanMusicPacks(dir)).toEqual({
      "pack-1": { intro: ["theme.mid"], "in-play": ["A song.MID", "b song.mid"] },
      "pack-2": { menu: ["loop.mid"] },
    });
  });

  it("ignores other files, unknown categories, empty folders and loose files", () => {
    const dir = packsFolder([
      ".gitkeep",
      "pack-1/intro/notes.txt",
      "pack-1/intro/.DS_Store",
      "pack-1/credits/song.mid",
      "pack-1/readme.md",
      "pack-1/menu/.gitkeep",
    ]);
    expect(scanMusicPacks(dir)).toEqual({ "pack-1": {} });
  });

  it("gives no packs when the folder doesn't exist", () => {
    expect(scanMusicPacks(join(tmpdir(), "no-such-music-packs-folder"))).toEqual({});
  });
});

describe("the music-packs Vite plugin", () => {
  it("serves the scan as virtual:music-packs", () => {
    const dir = packsFolder(["pack-1/intro/theme.mid"]);
    const plugin = musicPacks(dir);
    const resolveId = plugin.resolveId as (id: string) => string | undefined;
    const load = plugin.load as (id: string) => string | undefined;
    const id = resolveId("virtual:music-packs")!;
    expect(resolveId("./other")).toBeUndefined();
    expect(load(id)).toBe(`export default {"pack-1":{"intro":["theme.mid"]}};`);
    expect(load("/src/main.ts")).toBeUndefined();
  });
});
