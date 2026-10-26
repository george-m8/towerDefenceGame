import { describe, expect, it } from "vitest";
import { KEEP_SIZE, MAP_EDITOR, MAP_SIZES } from "../../src/sim/config";
import {
  MAP_FORMAT,
  MAP_VERSION,
  TERRAIN_CHARS,
  parseMap,
  serializeMap,
  spawnTiles,
  validateMap,
  type MapFile,
} from "../../src/sim/mapFile";
import type { Terrain } from "../../src/sim/types";

const { width, height } = MAP_SIZES.XS;

/** An open XS map: a keep in the middle, a spawn strip down the left edge. */
function openMap(overrides: Partial<MapFile> = {}): MapFile {
  return {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    title: "Test",
    mode: "endless",
    size: "XS",
    seed: 1,
    terrain: Array.from({ length: height }, () => ".".repeat(width)),
    keeps: [{ x: 30, y: 20 }],
    spawns: [{ x: 0, y: 15, width: 2, height: 10 }],
    ruins: [],
    chests: [],
    structures: [],
    ...overrides,
  };
}

/** The map with terrain painted on some tiles. */
function paint(map: MapFile, terrain: Terrain, tiles: { x: number; y: number }[]): MapFile {
  const rows = map.terrain.map((row) => [...row]);
  for (const t of tiles) rows[t.y][t.x] = TERRAIN_CHARS[terrain];
  return { ...map, terrain: rows.map((r) => r.join("")) };
}

/** Every tile of column x. */
function column(x: number) {
  return Array.from({ length: height }, (_, y) => ({ x, y }));
}

const roundTrip = (map: MapFile) => parseMap(JSON.parse(serializeMap(map)));

describe("the .map format", () => {
  it("serializes and parses back to the same map, unknown fields included", () => {
    const map = openMap({
      ruins: [{ x: 10, y: 10, hp: 0.6 }],
      chests: [{ x: 12, y: 10, gold: 75 }],
      structures: [{ kind: "archer", x: 30, y: 18, facing: "E", keep: 0 }],
      waves: "from a later module",
    });
    expect(roundTrip(map)).toEqual({ map });
  });

  it("writes terrain one row per line, so a diff shows the row that changed", () => {
    const text = serializeMap(openMap());
    expect(text.split("\n").filter((line) => line.startsWith('    ".'))).toHaveLength(height);
  });

  it.each([
    ["wrong format", { format: "something-else" }, "Not a map file"],
    ["newer version", { version: MAP_VERSION + 1 }, `reads up to version ${MAP_VERSION}`],
    ["bad mode", { mode: "ramparts" }, "mode must be"],
    ["bad size", { size: "XXL" }, "size must be one of"],
    ["missing row", { terrain: Array(height - 1).fill(".".repeat(width)) }, "rows"],
    [
      "short row",
      { terrain: [".", ...Array(height - 1).fill(".".repeat(width))] },
      "row 0 is 1 long",
    ],
    [
      "unknown terrain",
      { terrain: ["?" + ".".repeat(width - 1), ...Array(height - 1).fill(".".repeat(width))] },
      'Unknown terrain "?" at 0,0',
    ],
    [
      "unknown structure",
      { structures: [{ kind: "moat", x: 1, y: 1, facing: "N", keep: 0 }] },
      'Unknown structure "moat"',
    ],
    [
      "a ruin as a structure",
      { structures: [{ kind: "ruin", x: 1, y: 1, facing: "N", keep: 0 }] },
      "use ruins",
    ],
    [
      "a structure for a keep that isn't there",
      { structures: [{ kind: "wall", x: 1, y: 1, facing: "N", keep: 3 }] },
      "keep's number",
    ],
    ["a ruin with no HP", { ruins: [{ x: 1, y: 1, hp: 0 }] }, "ruins[0].hp"],
  ])("refuses a file with %s, saying what's wrong", (_, change, message) => {
    const result = parseMap({ ...openMap(), ...change });
    expect("error" in result && result.error).toContain(message);
  });

  it("lists every spawn tile once, however the zones overlap", () => {
    const tiles = spawnTiles({
      spawns: [
        { x: 0, y: 0, width: 2, height: 2 },
        { x: 1, y: 1, width: 2, height: 1 },
      ],
    });
    expect(tiles).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });
});

describe("validating a map", () => {
  it("finds nothing wrong with an open map", () => {
    expect(validateMap(openMap())).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ["no keep", { keeps: [] }, "need 1 keep"],
    [
      "two keeps in Endless",
      {
        keeps: [
          { x: 30, y: 20 },
          { x: 40, y: 20 },
        ],
      },
      "need 1 keep",
    ],
    ["one keep in PvP", { mode: "pvp" as const, spawns: [] }, "need 2 keeps"],
    ["a keep off the map", { keeps: [{ x: width - 1, y: 20 }] }, "off the map"],
    [
      "overlapping keeps",
      {
        mode: "pvp" as const,
        spawns: [],
        keeps: [
          { x: 30, y: 20 },
          { x: 31, y: 21 },
        ],
      },
      "overlaps another keep",
    ],
    ["no spawn in Endless", { spawns: [] }, "need a spawn zone"],
    ["a spawn off the map", { spawns: [{ x: -1, y: 0, width: 2, height: 2 }] }, "runs off the map"],
    [
      "a structure on a keep",
      { structures: [{ kind: "wall" as const, x: 31, y: 21, facing: "N" as const, keep: 0 }] },
      "on a keep or a spawn zone",
    ],
    [
      "two walls on one tile",
      {
        structures: [
          { kind: "wall" as const, x: 10, y: 10, facing: "N" as const, keep: 0 },
          { kind: "wall" as const, x: 10, y: 10, facing: "N" as const, keep: 0 },
        ],
      },
      "shares its tile",
    ],
    [
      "a bridge on dry land",
      { structures: [{ kind: "bridge" as const, x: 10, y: 10, facing: "N" as const, keep: 0 }] },
      "only goes over a river",
    ],
    [
      "a chest on a keep",
      { chests: [{ x: 31, y: 21, gold: 50 }] },
      "chest at 31,21 can't stand there",
    ],
  ])("errors on %s", (_, change, message) => {
    const { errors } = validateMap(openMap(change));
    expect(errors.join("\n")).toContain(message);
  });

  it("errors on a keep or spawn on terrain you can't walk on", () => {
    const keepOnRock = paint(openMap(), "rock", [{ x: 31, y: 21 }]);
    expect(validateMap(keepOnRock).errors).toContain("Keep 1 stands on terrain you can't walk on");
    const spawnInSea = paint(openMap(), "sea", [{ x: 0, y: 15 }]);
    expect(validateMap(spawnInSea).errors).toContain(
      "A spawn zone covers terrain you can't walk on",
    );
  });

  it("errors when the sea cuts the spawn off from the keep, but not across a ford", () => {
    const cut = paint(openMap(), "sea", column(10));
    expect(validateMap(cut).errors).toContain("Enemies have no way from the spawn to the keep");
    const forded = paint(cut, "ford", [{ x: 10, y: 5 }]);
    expect(validateMap(forded).errors).toEqual([]);
  });

  it("errors when nothing joins the two keeps of a PvP map", () => {
    const pvp = openMap({
      mode: "pvp",
      spawns: [],
      keeps: [
        { x: 10, y: 20 },
        { x: 50, y: 20 },
      ],
    });
    expect(validateMap(pvp).errors).toEqual([]);
    expect(validateMap(paint(pvp, "river", column(30))).errors).toContain(
      "There's no way between the two keeps",
    );
  });

  it("checks structures by the game's terrain and layer rules", () => {
    const river = paint(openMap(), "river", [{ x: 10, y: 10 }]);
    const on = (structures: MapFile["structures"]) => validateMap({ ...river, structures }).errors;
    const at = (kind: MapFile["structures"][number]["kind"], x = 10) => ({
      kind,
      x,
      y: 10,
      facing: "N" as const,
      keep: 0,
    });
    expect(on([at("bridge")])).toEqual([]);
    expect(on([at("wall")]).join()).toContain("needs a bridge");
    expect(on([at("wall", 11), at("archer", 11)])).toEqual([]); // a tower on a wall
    expect(on([at("bridge"), at("archer")]).join()).toContain("can't stand on a bridge");
    expect(on([at("archer", 11), at("cannon", 11)]).join()).toContain("another tower");
  });

  it("warns about a spawn close to the keep, and a chest out of reach", () => {
    const near = MAP_EDITOR.keepNearSpawnTiles;
    const close = openMap({ spawns: [{ x: 30 - near + 1, y: 20, width: 1, height: 1 }] });
    expect(validateMap(close).warnings).toContain(`A spawn zone is within ${near} tiles of a keep`);
    const walledIn = paint(openMap({ chests: [{ x: 5, y: 5, gold: 50 }] }), "rock", [
      { x: 4, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 4 },
      { x: 5, y: 6 },
    ]);
    const { errors, warnings } = validateMap(walledIn);
    expect(errors).toEqual([]);
    expect(warnings).toContain("The chest at 5,5 can't be reached from the keep");
  });

  it("keeps are KEEP_SIZE square", () => {
    // Right up against the edge fits; one more doesn't.
    expect(validateMap(openMap({ keeps: [{ x: width - KEEP_SIZE, y: 20 }] })).errors).toEqual([]);
  });
});
