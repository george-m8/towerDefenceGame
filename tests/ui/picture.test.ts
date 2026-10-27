import { describe, expect, it } from "vitest";
import {
  PICTURE_CELLS,
  PICTURE_GROUPS,
  PICTURE_TILES,
  cleanPicture,
  pictureTile,
  randomPicture,
} from "../../src/ui/picture";
import { tileHeight } from "../../src/ui/pictureCanvas";

describe("player pictures", () => {
  it("offer land, buildings, enemies and units, each with its own id", () => {
    for (const group of PICTURE_GROUPS) {
      expect(
        PICTURE_TILES.some((t) => t.group === group),
        group,
      ).toBe(true);
    }
    expect(new Set(PICTURE_TILES.map((t) => t.id)).size).toBe(PICTURE_TILES.length);
    expect(pictureTile("keep").name).toBe("Keep");
    expect(pictureTile("land:tree").name).toBe("Tree");
  });

  it("random ones are 9 real tiles, the same for the same seed", () => {
    const picture = randomPicture("Ann");
    expect(picture).toHaveLength(PICTURE_CELLS);
    for (const id of picture) expect(PICTURE_TILES.map((t) => t.id)).toContain(id);
    expect(randomPicture("Ann")).toEqual(picture);
    expect(randomPicture("Bo")).not.toEqual(picture);
  });

  it("cleaning keeps a good picture, mends unknown tiles and makes up a missing one", () => {
    const good = randomPicture("x");
    expect(cleanPicture(good, "seed")).toEqual(good);
    expect(cleanPicture(["nope", ...good.slice(1)], "seed")[0]).toBe("land:ground");
    expect(cleanPicture(null, "Ann")).toEqual(randomPicture("Ann"));
    expect(cleanPicture(["keep"], "Ann")).toEqual(randomPicture("Ann"));
  });
});

describe("picture tile heights", () => {
  it("match the map: the keep tallest, then towers, trees, walls, rock, bushes; flat things flat", () => {
    expect(tileHeight("keep")).toBe(12);
    expect(tileHeight("building:archer")).toBe(8);
    expect(tileHeight("land:tree")).toBe(7);
    expect(tileHeight("building:wall")).toBe(6);
    expect(tileHeight("land:goldRock")).toBe(4);
    expect(tileHeight("land:berries")).toBe(2);
    for (const id of [
      "land:ground",
      "land:river",
      "building:farmland",
      "enemy:goblin",
      "unit:militia",
    ]) {
      expect(tileHeight(id), id).toBe(0);
    }
  });
});
