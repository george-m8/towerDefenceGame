import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHub, handleConnection, type Hub } from "../../server/connection";
import { advanceAll } from "../../server/rooms";
import { startServer, type GameServer } from "../../server/server";
import { EMPTY } from "../../src/sim/grid";
import type { ClientState } from "../../src/net/protocol";
import { connectClient, type TestClient } from "./client";

let hub: Hub;
let server: GameServer;
const clients: TestClient[] = [];

beforeEach(async () => {
  hub = createHub();
  server = await startServer("127.0.0.1", 0, (socket) => handleConnection(hub, socket));
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server.close();
});

async function client(): Promise<TestClient> {
  const c = await connectClient(server.port);
  clients.push(c);
  return c;
}

/** An open ground tile outside the spawn zone (rooms have random seeds, so maps vary). */
function openTile(state: ClientState) {
  for (let i = 0; i < state.terrain.length; i++) {
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    const spawn = state.spawnTiles.some((p) => p.x === x && p.y === y);
    const open = state.terrain[i] === "ground" && state.base[i] === EMPTY && !spawn;
    if (open && state.explored[i] === 1) return { x, y }; // through the fog: seen land only
  }
  throw new Error("No open tile");
}

/** A creates a room, B joins it. */
async function twoInARoom() {
  const a = await client();
  a.send({ type: "create", name: "Ann" });
  const aWelcome = await a.next("welcome");
  const b = await client();
  b.send({ type: "join", room: aWelcome.room, name: "Bo" });
  const bWelcome = await b.next("welcome");
  a.send({ type: "start" }); // A created the room, so A is the host
  await b.next("update", (m) => m.lobby.started);
  return { a, b, aWelcome, bWelcome, room: aWelcome.room };
}

describe("over sockets", () => {
  it("A creates a room and B joins it; both are welcomed with the same game", async () => {
    const { aWelcome, bWelcome, a } = await twoInARoom();
    expect(aWelcome.room).toMatch(/^[A-Z]{4}$/);
    expect(aWelcome.playerId).toBe(1);
    expect(bWelcome.playerId).toBe(2);
    expect(bWelcome.state.seed).toBe(aWelcome.state.seed);
    expect(bWelcome.state.terrain).toEqual(aWelcome.state.terrain);
    const update = await a.next("update", (m) => m.update.players[2]?.name === "Bo");
    expect(update.update.players[2].connected).toBe(true);
  });

  it("B's build is owned by B, and A sees it", async () => {
    const { a, b, bWelcome } = await twoInARoom();
    const { x, y } = openTile(bWelcome.state);
    b.send({ type: "command", seq: 7, command: { type: "build", kind: "wall", x, y } });
    const result = await b.next("result");
    expect(result).toEqual({ type: "result", seq: 7, result: { ok: true } });
    const update = await a.next("update", (m) =>
      (m.update.structures ?? []).some((s) => s.kind === "wall" && s.owner === 2),
    );
    expect(update.update.tiles?.base).toBeDefined();
  });

  it("updates keep coming as the rooms advance", async () => {
    const { a } = await twoInARoom();
    advanceAll(hub.registry, 100); // 2 ticks
    const update = await a.next("update", (m) => m.update.tick === 2);
    expect(update.update.enemies).toBeDefined();
  });

  it("closing B's socket marks B disconnected for A", async () => {
    const { a, b } = await twoInARoom();
    await b.close();
    const update = await a.next("update", (m) => m.update.players[2]?.connected === false);
    expect(update.update.players[2].name).toBe("Bo");
  });

  it("B can rejoin with the token and is the same player", async () => {
    const { b, bWelcome, room } = await twoInARoom();
    await b.close();
    const again = await client();
    again.send({ type: "rejoin", room, token: bWelcome.token });
    const welcome = await again.next("welcome");
    expect(welcome.playerId).toBe(2);
  });

  it("answers bad messages with an error and keeps the connection", async () => {
    const a = await client();
    a.send("not json");
    expect(await a.next("error")).toEqual({ type: "error", reason: "Not JSON" });
    a.send({ type: "command", seq: 1, command: { type: "togglePause" } });
    expect(await a.next("error")).toEqual({ type: "error", reason: "Join a room first" });
    a.send({ type: "join", room: "ZZZZ", name: "Ann" });
    expect(await a.next("error")).toEqual({ type: "error", reason: "No room with that code" });
    a.send({ type: "create", name: "Ann" });
    await a.next("welcome");
  });
});

describe("hardening", () => {
  it("closes a connection that sends an oversized message", async () => {
    const a = await client();
    const closed = new Promise<number>((resolve) => a.socket.once("close", resolve));
    a.send(JSON.stringify({ type: "create", name: "x".repeat(5000) }));
    expect(await closed).toBe(1009); // "message too big"
  });

  it("drops a flood beyond the rate limit, with one error, and keeps working", async () => {
    const { a } = await twoInARoom();
    for (let seq = 0; seq < 100; seq++) {
      a.send({ type: "command", seq, command: { type: "sendWave" } });
    }
    a.send({ type: "command", seq: 999, command: { type: "togglePause" } });
    await a.next("error", (m) => m.reason === "Too many messages");
    // Give the server a moment to process everything it accepted.
    await new Promise((r) => setTimeout(r, 100));
    const results = a.messages.filter((m) => m.type === "result");
    expect(results.length).toBeGreaterThanOrEqual(38); // 40 per burst, two spent on "create" and "start"
    expect(results.length).toBeLessThan(50);
    expect(a.messages.filter((m) => m.type === "error")).toHaveLength(1);
  });

  it("rejects a rejoin with the wrong token", async () => {
    const { room } = await twoInARoom();
    const c = await client();
    c.send({ type: "rejoin", room, token: "f".repeat(32) });
    expect(await c.next("error")).toEqual({ type: "error", reason: "Unknown player" });
  });

  it("a second connection with the same token replaces the first", async () => {
    const { a, b, bWelcome, room } = await twoInARoom();
    const oldClosed = new Promise<void>((resolve) => b.socket.once("close", () => resolve()));
    const again = await client();
    again.send({ type: "rejoin", room, token: bWelcome.token });
    expect((await again.next("welcome")).playerId).toBe(2);
    await oldClosed;
    // The old socket closing must not mark B as gone.
    again.send({ type: "command", seq: 1, command: { type: "togglePause" } });
    await again.next("result");
    const update = await a.next("update", (m) => m.update.players[2]?.votes.pause === true);
    expect(update.update.players[2].connected).toBe(true);
  });

  it("refuses to join a full room", async () => {
    const { room } = await twoInARoom();
    for (const name of ["Cy", "Di"]) {
      const c = await client();
      c.send({ type: "join", room, name });
      await c.next("welcome");
    }
    const late = await client();
    late.send({ type: "join", room, name: "Ed" });
    expect(await late.next("error")).toEqual({ type: "error", reason: "Room is full" });
  });
});

describe("waiting room over sockets", () => {
  it("refuses a start from anyone but the host", async () => {
    const a = await client();
    a.send({ type: "create", name: "Ann" });
    const { room } = await a.next("welcome");
    const b = await client();
    b.send({ type: "join", room, name: "Bo" });
    expect((await b.next("welcome")).lobby).toEqual({ started: false, host: 1, mode: "endless" });
    b.send({ type: "start" });
    expect(await b.next("error")).toEqual({ type: "error", reason: "Only the host can start" });
  });
});
