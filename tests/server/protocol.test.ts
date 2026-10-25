import { describe, expect, it } from "vitest";
import { parseClientMessage, uniqueName, type ClientMessage } from "../../src/net/protocol";

function parses(message: ClientMessage) {
  expect(parseClientMessage(JSON.stringify(message))).toEqual({ ok: true, message });
}

function rejects(raw: unknown) {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const result = parseClientMessage(text);
  expect(result.ok, text).toBe(false);
}

describe("parseClientMessage", () => {
  it("accepts every valid message form", () => {
    parses({ type: "create", name: "Ann" });
    parses({ type: "create", name: "Ann", mode: "pvp" });
    parses({ type: "create", name: "Ann", mode: "endless" });
    parses({ type: "create", name: "Ann", size: "XS" });
    parses({ type: "create", name: "Ann", mode: "pvp", size: "XL" });
    parses({ type: "join", room: "ABCD", name: "Bo" });
    parses({ type: "rejoin", room: "WXYZ", token: "a".repeat(32) });
    parses({ type: "restart" });
    parses({ type: "start" });
    parses({ type: "start", fog: false });
    parses({ type: "command", seq: 0, command: { type: "togglePause" } });
    parses({ type: "command", seq: 1, command: { type: "toggleFastForward" } });
    parses({ type: "command", seq: 2, command: { type: "sendWave" } });
    parses({ type: "command", seq: 3, command: { type: "sell", x: 0, y: 31 } });
    parses({ type: "command", seq: 4, command: { type: "build", kind: "wall", x: 5, y: 6 } });
    parses({
      type: "command",
      seq: 5,
      command: { type: "build", kind: "wallSpikes", x: 5, y: 6, facing: "W" },
    });
  });

  it("trims names", () => {
    expect(parseClientMessage(JSON.stringify({ type: "create", name: "  Ann " }))).toEqual({
      ok: true,
      message: { type: "create", name: "Ann" },
    });
  });

  it("drops unknown extra fields", () => {
    const raw = JSON.stringify({ type: "restart", playerId: 2 });
    expect(parseClientMessage(raw)).toEqual({ ok: true, message: { type: "restart" } });
  });

  it("rejects malformed input without throwing", () => {
    rejects("not json");
    rejects({ type: "create", name: "Ann", size: "XXL" });
    rejects({ type: "create", name: "Ann", mode: "chess" });
    rejects("null");
    rejects([]);
    rejects({});
    rejects({ type: "dance" });
    rejects({ type: "create" });
    rejects({ type: "create", name: "" });
    rejects({ type: "create", name: "   " });
    rejects({ type: "create", name: "x".repeat(17) });
    rejects({ type: "create", name: "bad\nname" });
    rejects({ type: "create", name: 7 });
    rejects({ type: "join", room: "abcd", name: "Bo" });
    rejects({ type: "join", room: "ABCDE", name: "Bo" });
    rejects({ type: "join", room: "AB0D", name: "Bo" });
    rejects({ type: "join", room: "ABOD", name: "Bo" }); // O looks like 0, so it isn't used
    rejects({ type: "rejoin", room: "ABCD", token: "" });
    rejects({ type: "rejoin", room: "ABCD", token: "x".repeat(65) });
  });

  it("rejects bad commands", () => {
    const command = (c: unknown, seq: unknown = 1) => rejects({ type: "command", seq, command: c });
    command({ type: "togglePause" }, -1);
    command({ type: "togglePause" }, 1.5);
    command({ type: "togglePause" }, "1");
    command(undefined);
    command({ type: "debugSpawn", count: 200 });
    command({ type: "build", kind: "dragon", x: 1, y: 1 });
    command({ type: "build", kind: "ruin", x: 1, y: 1 }); // ruins can't be built
    command({ type: "build", kind: "wall", x: 1.5, y: 1 });
    command({ type: "build", kind: "wall", x: -1, y: 1 });
    command({ type: "build", kind: "wall", x: 1, y: 100_000 });
    command({ type: "build", kind: "wall", x: "1", y: 1 });
    command({ type: "build", kind: "wallSpikes", x: 1, y: 1, facing: "NE" });
    command({ type: "sell", x: 1 });
  });
});

describe("uniqueName", () => {
  it("leaves a new name alone and numbers duplicates", () => {
    expect(uniqueName(["Ann"], "Bo")).toBe("Bo");
    expect(uniqueName(["Ann"], "Ann")).toBe("Ann 2");
    expect(uniqueName(["Ann", "Ann 2"], "Ann")).toBe("Ann 3");
  });
});
