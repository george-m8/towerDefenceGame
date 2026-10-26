import { describe, expect, it } from "vitest";
import { readMapText } from "../../src/editor/files";
import { mapFromGenerated } from "../../src/sim/game";
import { serializeMap } from "../../src/sim/mapFile";

describe("opening a map file from disk", () => {
  it("reads a .map file's text", () => {
    const map = mapFromGenerated("From disk", "endless", "XS", 2);
    expect(readMapText(serializeMap(map))).toEqual({ map });
  });

  it("says why something isn't a map", () => {
    expect(readMapText("not json")).toEqual({ error: "it isn't a map file (not JSON)" });
    expect(readMapText(JSON.stringify({ format: "nope" }))).toMatchObject({
      error: expect.stringContaining("Not a map file"),
    });
  });
});
