import { describe, expect, it } from "vitest";
import { inviteLink, readJoinIntent, serverUrl } from "../../src/net/join";

const never = () => {
  throw new Error("should not ask");
};

describe("readJoinIntent", () => {
  it("is offline without room or create", () => {
    expect(readJoinIntent("", never)).toEqual({ mode: "offline" });
    expect(readJoinIntent("?name=Ann", never)).toEqual({ mode: "offline" });
  });

  it("creates a room", () => {
    expect(readJoinIntent("?create&name=Ann", never)).toEqual({ mode: "create", name: "Ann" });
  });

  it("joins a room, upper-casing the code", () => {
    expect(readJoinIntent("?room=abcd&name=Bo", never)).toEqual({
      mode: "join",
      room: "ABCD",
      name: "Bo",
    });
  });

  it("asks for a missing name, falling back to Player", () => {
    expect(readJoinIntent("?room=ABCD", () => "  Cy ")).toEqual({
      mode: "join",
      room: "ABCD",
      name: "Cy",
    });
    expect(readJoinIntent("?create", () => null)).toEqual({ mode: "create", name: "Player" });
    expect(readJoinIntent("?create&name=", () => "")).toEqual({ mode: "create", name: "Player" });
  });

  it("trims long names to the server's limit", () => {
    const intent = readJoinIntent(`?create&name=${"x".repeat(30)}`, never);
    expect(intent).toEqual({ mode: "create", name: "x".repeat(16) });
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
