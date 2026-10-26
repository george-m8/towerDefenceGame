import { describe, expect, it } from "vitest";
import {
  MAX_PLAYERS,
  loadPlayers,
  putPlayer,
  removePlayer,
  savePlayers,
  type Profile,
} from "../../src/ui/profiles";
import { randomPicture } from "../../src/ui/picture";

function memory(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const player = (name: string): Profile => ({ name, picture: randomPicture(name) });

describe("saved players", () => {
  it("starts empty, or with the one name saved before there was a list", () => {
    expect(loadPlayers(memory())).toEqual([]);
    expect(loadPlayers(null)).toEqual([]);
    expect(loadPlayers(memory({ "keep-defence-name": "Ann" }))).toEqual([player("Ann")]);
  });

  it("gives players saved before pictures (plain names) one made from their name", () => {
    const storage = memory({ "keep-defence-players": '["Ann", "Bo"]' });
    expect(loadPlayers(storage)).toEqual([player("Ann"), player("Bo")]);
  });

  it("saves pictures, and lists the player picked last first", () => {
    const storage = memory();
    const bo = { name: "Bo", picture: Array<string>(9).fill("keep") };
    savePlayers(storage, [player("Ann"), bo, player("Cy")], "Bo");
    expect(loadPlayers(storage)).toEqual([bo, player("Ann"), player("Cy")]);
  });

  it("shrugs off a garbled list, and mends a picture with unknown tiles", () => {
    expect(loadPlayers(memory({ "keep-defence-players": "{nope" }))).toEqual([]);
    const odd = JSON.stringify([
      3,
      { name: "  " },
      { name: "Ann", picture: ["dragon", ...Array(8).fill("keep")] },
    ]);
    const [ann] = loadPlayers(memory({ "keep-defence-players": odd }));
    expect(ann.name).toBe("Ann");
    expect(ann.picture[0]).toBe("land:ground");
    expect(ann.picture[1]).toBe("keep");
  });

  it("adds a new player first, refusing blanks, repeats and too many", () => {
    const bo = { name: "  Bo ", picture: randomPicture("x") };
    expect(putPlayer([player("Ann")], bo)).toEqual({
      players: [{ name: "Bo", picture: bo.picture }, player("Ann")],
    });
    expect(putPlayer([player("Ann")], player("   "))).toEqual({ error: "Type a name" });
    expect(putPlayer([player("Ann")], player("ann"))).toEqual({ error: "ann is already here" });
    const full = Array.from({ length: MAX_PLAYERS }, (_, i) => player(`P${i}`));
    expect(putPlayer(full, player("New"))).toMatchObject({
      error: expect.stringContaining("at most"),
    });
  });

  it("changes a player's name and picture in place of the old one", () => {
    const changed = { name: "Annie", picture: Array<string>(9).fill("keep") };
    expect(putPlayer([player("Ann"), player("Bo")], changed, "Ann")).toEqual({
      players: [changed, player("Bo")],
    });
    // Keeping the same name is fine; taking someone else's isn't.
    expect(putPlayer([player("Ann"), player("Bo")], player("Ann"), "Ann")).toMatchObject({
      players: expect.any(Array),
    });
    expect(putPlayer([player("Ann"), player("Bo")], player("Bo"), "Ann")).toEqual({
      error: "Bo is already here",
    });
  });

  it("removes a player", () => {
    expect(removePlayer([player("Ann"), player("Bo")], "Ann")).toEqual([player("Bo")]);
  });
});
