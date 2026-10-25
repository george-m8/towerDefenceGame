import { describe, expect, it } from "vitest";
import type { PackFiles } from "../../src/audio/places";
import { BUILT_IN, activePack, pickSong, songsFor } from "../../src/audio/playlist";
import { SONGS, type SongEntry } from "../../src/audio/songs";

const packs: PackFiles = {
  "pack-b": { menu: ["loop.mid"] },
  "pack-a": { intro: ["Theme's #1.mid"], "in-play": ["one.mid", "two.mid"] },
};

const builtIn = (id: string, plays: SongEntry["plays"]): SongEntry => ({
  id,
  title: id,
  plays,
  loop: true,
  source: "test",
  licence: "test",
  file: `${id}.mid`,
});
const defaults = [builtIn("default-intro", ["intro"]), builtIn("default-menu", ["menu"])];

describe("activePack", () => {
  it("uses the chosen pack, or the first pack when nothing (or a missing pack) is chosen", () => {
    expect(activePack(packs, "pack-b")).toBe("pack-b");
    expect(activePack(packs, null)).toBe("pack-a");
    expect(activePack(packs, "deleted-pack")).toBe("pack-a");
  });

  it("uses no pack for Built-in, or when there are no packs", () => {
    expect(activePack(packs, BUILT_IN)).toBeNull();
    expect(activePack({}, null)).toBeNull();
  });
});

describe("songsFor", () => {
  it("gives the pack's songs for a place, fetched from its folder", () => {
    const [song] = songsFor("intro", "pack-a", packs, defaults);
    expect(song.title).toBe("Theme's #1");
    expect(song.plays).toEqual(["intro"]);
    expect(song.loop).toBe(false);
    expect(song.file).toBe("music-packs/pack-a/intro/Theme's%20%231.mid");
    expect(song.source.length).toBeGreaterThan(0);
    expect(song.licence.length).toBeGreaterThan(0);
  });

  it("falls back to the built-in songs for a place the pack has nothing for", () => {
    expect(songsFor("menu", "pack-a", packs, defaults).map((s) => s.id)).toEqual(["default-menu"]);
    expect(songsFor("intro", null, packs, defaults).map((s) => s.id)).toEqual(["default-intro"]);
    expect(songsFor("game-over", "pack-a", packs, defaults)).toEqual([]);
  });

  it("built in: Baston plays once for the intro, the placeholder loops in the menu", () => {
    const [intro] = songsFor("intro", null, {}, SONGS);
    expect(intro.id).toBe("concertino-in-d-john-baston");
    expect(intro.loop).toBe(false);
    const [menu] = songsFor("menu", null, {}, SONGS);
    expect(menu.id).toBe("placeholder-theme");
    expect(menu.loop).toBe(true);
  });
});

describe("pickSong", () => {
  const songs = songsFor("in-play", "pack-a", packs, defaults);

  it("picks at random, never the song that just played when there's a choice", () => {
    expect(pickSong(songs, null, () => 0)!.title).toBe("one");
    expect(pickSong(songs, null, () => 0.99)!.title).toBe("two");
    expect(pickSong(songs, songs[0].id, () => 0)!.title).toBe("two");
    expect(pickSong(songs, songs[1].id, () => 0.99)!.title).toBe("one");
  });

  it("repeats a lone song, and gives nothing for an empty list", () => {
    expect(pickSong(songs.slice(0, 1), songs[0].id, () => 0)!.title).toBe("one");
    expect(pickSong([], null, () => 0)).toBeNull();
  });
});
