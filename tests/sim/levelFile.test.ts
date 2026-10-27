import { describe, expect, it } from "vitest";
import { MAP_SIZES } from "../../src/sim/config";
import { mapFromGenerated } from "../../src/sim/game";
import {
  DEFAULT_WIN,
  ICON_SIDES,
  mapIcon,
  newLevel,
  parseLevel,
  serializeLevel,
  starsFor,
} from "../../src/sim/levelFile";
import type { MapFile } from "../../src/sim/mapFile";

const base = { format: "keep-defence-level", version: 1, title: "Starter" };
const icon = [
  ["land:sea", "land:ground", "land:tree"],
  ["enemy:goblin", "land:ground", "keep"],
  ["land:sea", "land:sea", "land:sea"],
];

describe("parseLevel", () => {
  it("reads the icon, fog and when enemies come", () => {
    const win = { waves: 8, stars: { 3: 90, 2: 40 } };
    const json = {
      ...base,
      icon,
      mode: "pvp",
      win,
      fog: false,
      dayNight: { enemiesCome: "night" },
    };
    expect(parseLevel(json)).toEqual({ level: json });
  });

  it("fills in no icon, Endless, 5 waves to win, fog on and enemies all the time", () => {
    expect(parseLevel(base)).toEqual({ level: newLevel("Starter") });
  });

  it("keeps fields it doesn't know, at the top and in dayNight", () => {
    const json = { ...base, waves: 3, dayNight: { enemiesCome: "night", dayMinutes: 2 } };
    const result = parseLevel(json);
    expect(result).toEqual({
      level: { ...json, icon: null, mode: "endless", win: DEFAULT_WIN, fog: true },
    });
  });

  it("refuses files that aren't levels, or have bad settings", () => {
    const bad: [unknown, string][] = [
      [[], "not a JSON object"],
      [{ ...base, format: "keep-defence-map" }, "isn't a level file"],
      [{ ...base, version: 0 }, "version is missing"],
      [{ ...base, version: 2 }, "newer than this game reads"],
      [{ ...base, title: " " }, "title is missing"],
      [{ ...base, icon: [] }, "icon"],
      [{ ...base, icon: [["keep", "keep"]] }, "icon"],
      [{ ...base, icon: [[1]] }, "icon"],
      [{ ...base, mode: "campaign" }, "mode"],
      [{ ...base, win: 5 }, "win isn't an object"],
      [{ ...base, win: { waves: 0 } }, "win.waves"],
      [{ ...base, win: { waves: 5, stars: { 3: 100 } } }, "win.stars"],
      [{ ...base, win: { waves: 5, stars: { 3: 100, 2: 101 } } }, "win.stars"],
      [{ ...base, win: { waves: 5, stars: { 3: 40, 2: 50 } } }, 'less than "2"'],
      [{ ...base, fog: "yes" }, "fog"],
      [{ ...base, dayNight: [] }, "dayNight"],
      [{ ...base, dayNight: { enemiesCome: "dawn" } }, "enemiesCome"],
    ];
    for (const [json, error] of bad) {
      const result = parseLevel(json);
      expect("error" in result && result.error).toContain(error);
    }
  });
});

describe("serializeLevel", () => {
  it("writes known fields first, then extras, and reads back the same", () => {
    const level = { ...newLevel("Starter"), icon, waves: 3 };
    const text = serializeLevel(level);
    expect(Object.keys(JSON.parse(text))).toEqual([
      "format",
      "version",
      "title",
      "icon",
      "mode",
      "win",
      "fog",
      "dayNight",
      "waves",
    ]);
    expect(parseLevel(JSON.parse(text))).toEqual({ level });
  });

  it("writes each row of the icon on one line", () => {
    const text = serializeLevel({ ...newLevel("Starter"), icon });
    expect(text).toContain('    ["enemy:goblin", "land:ground", "keep"],\n');
  });
});

describe("starsFor", () => {
  const keep = (hp: number) => ({ hp, maxHp: 200 });

  it("gives 3 stars with the keep untouched, 2 at half health or more, 1 otherwise", () => {
    expect(DEFAULT_WIN).toEqual({ waves: 5, stars: { 3: 100, 2: 50 } });
    expect(starsFor(DEFAULT_WIN, keep(200))).toBe(3);
    expect(starsFor(DEFAULT_WIN, keep(199))).toBe(2);
    expect(starsFor(DEFAULT_WIN, keep(100))).toBe(2);
    expect(starsFor(DEFAULT_WIN, keep(99))).toBe(1);
    expect(starsFor(DEFAULT_WIN, keep(1))).toBe(1);
  });

  it("goes by the level's own thresholds", () => {
    const win = { waves: 3, stars: { 3: 75, 2: 25 } };
    expect(starsFor(win, keep(150))).toBe(3);
    expect(starsFor(win, keep(50))).toBe(2);
  });
});

describe("mapIcon", () => {
  /** A map of this size, all ground, with no keep or spawns, to draw on. */
  function blank(size: keyof typeof MAP_SIZES): MapFile {
    const { width, height } = MAP_SIZES[size];
    const map = mapFromGenerated("Blank", "endless", size, 1);
    return { ...map, terrain: Array(height).fill(".".repeat(width)), keeps: [], spawns: [] };
  }

  it("is 3 tiles square for an XXS map, up to 8 for XL", () => {
    expect(ICON_SIDES).toEqual({ XXS: 3, XS: 4, S: 5, M: 6, L: 7, XL: 8 });
    for (const size of Object.keys(MAP_SIZES) as (keyof typeof MAP_SIZES)[]) {
      const made = mapIcon(blank(size));
      expect(made).toHaveLength(ICON_SIDES[size]);
      expect(made.every((row) => row.length === ICON_SIDES[size])).toBe(true);
    }
  });

  it("shows each block's terrain, the keep, and enemies where they come from", () => {
    const map = blank("XXS"); // 42 x 28: blocks of 14 x 9 or 10
    // The top-left block part sea; a river down the top-middle block, a line across it (9
    // tiles); the top-right block only a few rocks, too few to show over the ground.
    map.terrain = map.terrain.map((row, y) =>
      y < 9
        ? "=".repeat(5) +
          row.slice(5, 14) +
          "~" +
          row.slice(15, 30) +
          (y < 8 ? "o" : ".") +
          row.slice(31)
        : row,
    );
    map.keeps = [{ x: 37, y: 13 }];
    map.spawns = [{ x: 0, y: 11, width: 2, height: 4 }];
    expect(mapIcon(map)).toEqual([
      ["land:sea", "land:river", "land:ground"],
      ["enemy:goblin", "land:ground", "keep"],
      ["land:ground", "land:ground", "land:ground"],
    ]);
  });
});
