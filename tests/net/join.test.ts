import { describe, expect, it } from "vitest";
import { fogFromUrl, inviteLink, readJoinIntent, serverUrl } from "../../src/net/join";

describe("readJoinIntent", () => {
  it("opens the start screen without a room, a create or a name", () => {
    expect(readJoinIntent("")).toEqual({ mode: "menu" });
    expect(readJoinIntent("?name=Ann")).toEqual({ mode: "menu" });
    expect(readJoinIntent("?create")).toEqual({ mode: "menu" });
    expect(readJoinIntent("?solo&size=xl")).toEqual({ mode: "offline", size: "XL" });
    expect(readJoinIntent("?solo&size=huge")).toEqual({ mode: "offline" });
    expect(readJoinIntent("?solo&map=river-crossing")).toEqual({
      mode: "offline",
      map: "river-crossing",
    });
    expect(readJoinIntent("?solo&map=../secret")).toEqual({ mode: "offline" });
    expect(readJoinIntent("?create&name=Ann&size=S")).toEqual({
      mode: "create",
      name: "Ann",
      size: "S",
    });
    expect(readJoinIntent("?create&name=Ann&game=pvp")).toEqual({
      mode: "create",
      name: "Ann",
      game: "pvp",
    });
    expect(readJoinIntent("?create&name=  ")).toEqual({ mode: "menu" });
  });

  it("fills in the room code from an invite link", () => {
    expect(readJoinIntent("?room=abcd")).toEqual({ mode: "menu", room: "ABCD" });
  });

  it("goes straight in with a name, so old links keep working", () => {
    expect(readJoinIntent("?create&name=Ann")).toEqual({ mode: "create", name: "Ann" });
    expect(readJoinIntent("?room=abcd&name=Bo")).toEqual({
      mode: "join",
      room: "ABCD",
      name: "Bo",
    });
  });

  it("plays solo with ?solo", () => {
    expect(readJoinIntent("?solo")).toEqual({ mode: "offline" });
  });

  it("trims long names to the server's limit", () => {
    expect(readJoinIntent(`?create&name=${"x".repeat(30)}`)).toEqual({
      mode: "create",
      name: "x".repeat(16),
    });
  });
});

describe("links", () => {
  it("builds an invite link from the page origin", () => {
    expect(inviteLink("http://192.168.1.20:5173", "ABCD")).toBe(
      "http://192.168.1.20:5173/?room=ABCD",
    );
  });

  it("connects to /ws on the page's own host, securely on https", () => {
    expect(serverUrl({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws");
    expect(serverUrl({ protocol: "https:", host: "td.example" })).toBe("wss://td.example/ws");
  });
});

describe("fogFromUrl", () => {
  it("is on unless the address says ?fog=off", () => {
    expect(fogFromUrl("")).toBe(true);
    expect(fogFromUrl("?solo")).toBe(true);
    expect(fogFromUrl("?solo&fog=off")).toBe(false);
    expect(fogFromUrl("?create&name=Ann&fog=off")).toBe(false);
  });
});
