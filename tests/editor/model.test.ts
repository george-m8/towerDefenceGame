import { describe, expect, it } from "vitest";
import { KEEP_SIZE, MAP_EDITOR, MAP_SIZES } from "../../src/sim/config";
import { createGame } from "../../src/sim/game";
import {
  MAP_FORMAT,
  MAP_VERSION,
  mapFromGame,
  spawnTiles,
  terrainOf,
  validateMap,
  type MapFile,
} from "../../src/sim/mapFile";
import {
  History,
  addSpawn,
  brushTiles,
  erase,
  moveKeep,
  paintTerrain,
  placeChest,
  placeKeep,
  placeRuin,
  placeStructure,
  rebuildKeepWalls,
  rectTiles,
} from "../../src/editor/model";

const { width, height } = MAP_SIZES.XS;

/** An open XS map: a keep at (30, 20), a spawn strip down the left edge. */
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

const wall = (x: number, y: number) => ({
  kind: "wall" as const,
  x,
  y,
  facing: "N" as const,
  keep: 0,
});

describe("brushes", () => {
  it.each(MAP_EDITOR.brushSizes)(
    "a size %i brush covers that square, trimmed at the edge",
    (size) => {
      const map = openMap();
      expect(brushTiles(map, { x: 10, y: 10 }, size)).toHaveLength(size * size);
      const r = Math.floor(size / 2);
      expect(brushTiles(map, { x: 0, y: 0 }, size)).toHaveLength((r + 1) * (r + 1));
    },
  );

  it("a rectangle covers every tile between its corners, either way round", () => {
    expect(rectTiles(openMap(), { x: 5, y: 6 }, { x: 2, y: 4 })).toHaveLength(4 * 3);
  });
});

describe("painting terrain", () => {
  it("paints the tiles, but never under a keep", () => {
    const { map } = paintTerrain(
      openMap(),
      rectTiles(openMap(), { x: 29, y: 19 }, { x: 31, y: 21 }),
      "tree",
    );
    expect(terrainOf(map, 29, 19)).toBe("tree");
    expect(terrainOf(map, 31, 21)).toBe("ground"); // keep tile
  });

  it("removes what can't stand on the new terrain, and says so", () => {
    const start = openMap({
      structures: [wall(10, 10), { kind: "archer", x: 10, y: 10, facing: "E", keep: 0 }],
      ruins: [{ x: 11, y: 10, hp: 0.6 }],
      chests: [{ x: 12, y: 10, gold: 50 }],
    });
    const { map, note } = paintTerrain(
      start,
      rectTiles(start, { x: 10, y: 10 }, { x: 12, y: 10 }),
      "sea",
    );
    expect(map.structures).toEqual([]);
    expect(map.ruins).toEqual([]);
    expect(map.chests).toEqual([]);
    expect(note).toBe("Removed a wall, an archer, a ruin and a chest that couldn't stand there");
  });

  it("a bridge goes when its river is filled in, and a tower on it with it", () => {
    let map = paintTerrain(openMap(), [{ x: 10, y: 10 }], "river").map;
    map = placeStructure(map, "bridge", { x: 10, y: 10 }, "N").map;
    expect(map.structures).toHaveLength(1);
    map = paintTerrain(map, [{ x: 10, y: 10 }], "ground").map;
    expect(map.structures).toEqual([]);
  });

  it("a spawn tile goes when it can't be walked on", () => {
    const start = openMap();
    const { map } = paintTerrain(start, [{ x: 0, y: 15 }], "rock");
    expect(spawnTiles(map)).toHaveLength(spawnTiles(start).length - 1);
  });

  it("painting the same terrain changes nothing", () => {
    const start = openMap();
    expect(paintTerrain(start, [{ x: 5, y: 5 }], "ground").map).toBe(start);
  });
});

describe("keeps", () => {
  it("in Endless, placing the keep moves it, centred on the tile", () => {
    const { map } = placeKeep(openMap(), { x: 50, y: 10 });
    expect(map.keeps).toEqual([
      { x: 50 - Math.floor(KEEP_SIZE / 2), y: 10 - Math.floor(KEEP_SIZE / 2) },
    ]);
  });

  it("in PvP, keeps are placed in order, then the nearer one moves", () => {
    let map = openMap({ mode: "pvp", spawns: [], keeps: [] });
    map = placeKeep(map, { x: 10, y: 20 }).map;
    map = placeKeep(map, { x: 50, y: 20 }).map;
    expect(map.keeps.map((k) => k.x)).toEqual([9, 49]);
    map = placeKeep(map, { x: 45, y: 30 }).map;
    expect(map.keeps).toEqual([
      { x: 9, y: 19 },
      { x: 44, y: 29 },
    ]);
    expect(moveKeep(map, 0, { x: 45, y: 29 }).note).toBe("Keeps can't overlap");
  });

  it("clears its ground: rough terrain becomes ground, and what was there goes", () => {
    let start = paintTerrain(openMap(), [{ x: 50, y: 10 }], "rock").map;
    start = { ...start, structures: [wall(51, 11)], chests: [{ x: 49, y: 9, gold: 50 }] };
    const { map } = placeKeep(start, { x: 50, y: 10 });
    expect(terrainOf(map, 50, 10)).toBe("ground");
    expect(map.structures).toEqual([]);
    expect(map.chests).toEqual([]);
  });

  it("stays on the map", () => {
    const { map } = placeKeep(openMap(), { x: 0, y: height - 1 });
    expect(map.keeps).toEqual([{ x: 0, y: height - KEEP_SIZE }]);
  });

  it("rebuilding the keep walls makes the ring a new game has, and doing it twice is the same", () => {
    const start = openMap();
    const { map } = rebuildKeepWalls(start);
    const game = createGame(1, { map: start, players: [] });
    const expected = mapFromGame(game, "", "XS");
    expect(map.structures.length).toBeGreaterThan(0);
    expect(map.structures.every((s) => s.kind === "wall" || s.kind === "gate")).toBe(true);
    expect(map.structures.filter((s) => s.kind === "gate")).toHaveLength(1);
    expect(expected.structures).toEqual([]); // the bare map had none
    expect(rebuildKeepWalls(map).map.structures).toEqual(map.structures);
    expect(validateMap(map).errors).toEqual([]);
  });
});

describe("spawn zones", () => {
  it("adds a zone, merging into a strip, putting ground under it and clearing it", () => {
    let start = paintTerrain(openMap({ spawns: [] }), [{ x: 60, y: 6 }], "river").map;
    start = { ...start, ruins: [{ x: 60, y: 5, hp: 0.6 }] };
    let { map } = addSpawn(start, { x: 60, y: 5 }, { x: 61, y: 6 });
    map = addSpawn(map, { x: 60, y: 7 }, { x: 61, y: 8 }).map;
    expect(map.spawns).toEqual([{ x: 60, y: 5, width: 2, height: 4 }]);
    expect(terrainOf(map, 60, 6)).toBe("ground");
    expect(map.ruins).toEqual([]);
  });

  it("PvP maps have none", () => {
    const pvp = openMap({ mode: "pvp", spawns: [] });
    expect(addSpawn(pvp, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual({
      map: pvp,
      note: "PvP maps have no enemy spawns",
    });
  });
});

describe("ruins and chests", () => {
  it("place with an amount, and placing again on the same tile changes it", () => {
    let map = placeRuin(openMap(), { x: 10, y: 10 }, 0.4).map;
    map = placeRuin(map, { x: 10, y: 10 }, 1).map;
    expect(map.ruins).toEqual([{ x: 10, y: 10, hp: 1 }]);
    map = placeChest(map, { x: 12, y: 10 }).map;
    map = placeChest(map, { x: 12, y: 10 }, 150).map;
    expect(map.chests).toEqual([{ x: 12, y: 10, gold: 150 }]);
  });

  it("don't go on a keep, a spawn zone, or terrain they can't stand on", () => {
    const rocky = paintTerrain(openMap(), [{ x: 10, y: 10 }], "rock").map;
    expect(placeRuin(rocky, { x: 31, y: 21 }).note).toBe("Nothing can go on a keep");
    expect(placeChest(rocky, { x: 0, y: 15 }).note).toBe("Nothing can go in a spawn zone");
    expect(placeRuin(rocky, { x: 10, y: 10 }).note).toBe("A ruin can't stand there");
    expect(placeChest(rocky, { x: 10, y: 10 }).note).toBe("A chest can't go there");
  });
});

describe("structures", () => {
  it("follow the game's terrain and layer rules", () => {
    const river = paintTerrain(openMap(), [{ x: 10, y: 10 }], "river").map;
    expect(placeStructure(river, "wall", { x: 10, y: 10 }, "N").note).toBe(
      "A wall needs a bridge to stand on",
    );
    expect(placeStructure(river, "bridge", { x: 11, y: 10 }, "N").note).toBe(
      "A bridge only goes over a river",
    );
    let map = placeStructure(river, "wall", { x: 12, y: 10 }, "N").map;
    expect(placeStructure(map, "wall", { x: 12, y: 10 }, "N").note).toBe(
      "Something's already built there",
    );
    map = placeStructure(map, "archer", { x: 12, y: 10 }, "E").map;
    expect(placeStructure(map, "cannon", { x: 12, y: 10 }, "N").note).toBe(
      "A tower is already here",
    );
    expect(map.structures.map((s) => [s.kind, s.facing])).toEqual([
      ["wall", "N"],
      ["archer", "E"],
    ]);
  });

  it("belong to the nearest keep", () => {
    const pvp = openMap({
      mode: "pvp",
      spawns: [],
      keeps: [
        { x: 10, y: 20 },
        { x: 50, y: 20 },
      ],
    });
    const { map } = placeStructure(pvp, "wall", { x: 46, y: 21 }, "N");
    expect(map.structures[0].keep).toBe(1);
  });
});

describe("the eraser", () => {
  it("takes the top thing first: tower, its wall, ruin or chest, spawn tile, then terrain", () => {
    let map = openMap({
      structures: [wall(10, 10), { kind: "archer", x: 10, y: 10, facing: "E", keep: 0 }],
      ruins: [{ x: 11, y: 10, hp: 0.6 }],
    });
    map = erase(map, { x: 10, y: 10 }).map;
    expect(map.structures.map((s) => s.kind)).toEqual(["wall"]);
    map = erase(map, { x: 10, y: 10 }).map;
    expect(map.structures).toEqual([]);
    map = erase(map, { x: 11, y: 10 }).map;
    expect(map.ruins).toEqual([]);
    const spawned = spawnTiles(map).length;
    map = erase(map, { x: 0, y: 15 }).map;
    expect(spawnTiles(map)).toHaveLength(spawned - 1);
    map = paintTerrain(map, [{ x: 20, y: 5 }], "tree").map;
    map = erase(map, { x: 20, y: 5 }).map;
    expect(terrainOf(map, 20, 5)).toBe("ground");
  });

  it("leaves a keep alone", () => {
    const start = openMap();
    expect(erase(start, { x: 31, y: 21 }).map).toBe(start);
  });
});

describe("undo and redo", () => {
  const painted = (map: MapFile, x: number) => paintTerrain(map, [{ x, y: 5 }], "tree").map;

  it("a whole stroke is one step", () => {
    const start = openMap();
    const history = new History(start);
    history.begin();
    for (let x = 5; x < 10; x++) history.set(painted(history.map, x));
    history.end();
    expect(history.undo()).toBe(true);
    expect(history.map).toBe(start);
    expect(history.redo()).toBe(true);
    expect(terrainOf(history.map, 9, 5)).toBe("tree");
  });

  it("a step that changed nothing isn't kept, and a new step drops what could be redone", () => {
    const start = openMap();
    const history = new History(start);
    history.begin();
    history.end();
    expect(history.canUndo).toBe(false);
    history.apply(painted(start, 5));
    history.undo();
    expect(history.canRedo).toBe(true);
    history.apply(painted(history.map, 6));
    expect(history.canRedo).toBe(false);
  });

  it(`keeps the last ${MAP_EDITOR.undoSteps} steps`, () => {
    const history = new History(openMap());
    for (let i = 0; i < MAP_EDITOR.undoSteps + 5; i++) {
      history.apply(paintTerrain(history.map, [{ x: 5, y: 5 }], i % 2 ? "ground" : "tree").map);
    }
    let undone = 0;
    while (history.undo()) undone++;
    expect(undone).toBe(MAP_EDITOR.undoSteps);
  });
});
