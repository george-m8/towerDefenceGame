import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createHub, handleConnection, type Hub } from "../../server/connection";
import { advanceAll } from "../../server/rooms";
import { startServer, type GameServer } from "../../server/server";
import { EMPTY } from "../../src/sim/grid";
import type { CommandResult, GameState } from "../../src/sim/types";
import { tokenKey } from "../../src/net/join";
import {
  createNetworkSession,
  type JoinIntent,
  type NetworkDeps,
  type NetworkSession,
} from "../../src/net/networkSession";

let server: GameServer;
let hub: Hub;
const sessions: NetworkSession[] = [];

beforeEach(async () => {
  hub = createHub();
  server = await startServer("127.0.0.1", 0, (socket) => handleConnection(hub, socket));
});

afterEach(async () => {
  for (const s of sessions.splice(0)) s.close();
  await server.close();
});

/** A per-tab storage, like sessionStorage. */
function memoryStorage(): NetworkDeps["storage"] {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function open(intent: JoinIntent, storage = memoryStorage()): NetworkSession {
  const session = createNetworkSession(`ws://127.0.0.1:${server.port}/ws`, intent, {
    WebSocket: WebSocket as unknown as NetworkDeps["WebSocket"],
    storage,
    now: () => performance.now(),
  });
  sessions.push(session);
  return session;
}

async function waitFor<T>(
  check: () => T | null | undefined | false,
  what = "condition",
): Promise<T> {
  const start = performance.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (performance.now() - start > 2000) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

function openTile(state: GameState) {
  for (let i = 0; i < state.terrain.length; i++) {
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    const spawn = state.spawnTiles.some((p) => p.x === x && p.y === y);
    if (state.terrain[i] === "ground" && state.base[i] === EMPTY && !spawn) return { x, y };
  }
  throw new Error("No open tile");
}

async function twoSessions() {
  const a = open({ mode: "create", name: "Ann" });
  await waitFor(() => a.state, "A's welcome");
  const bStorage = memoryStorage();
  const b = open({ mode: "join", room: a.room!, name: "Bo" }, bStorage);
  await waitFor(() => b.state, "B's welcome");
  a.start(); // A created the room, so A is the host
  await waitFor(() => a.lobby?.started && b.lobby?.started, "the game to start");
  return { a, b, bStorage };
}

describe("NetworkSession", () => {
  it("is connecting until welcomed, then shows the room", async () => {
    const a = open({ mode: "create", name: "Ann" });
    expect(a.status).toBe("Connecting...");
    expect(a.state).toBeNull();
    await waitFor(() => a.state);
    expect(a.status).toBe(`Room ${a.room}`);
    expect(a.playerId).toBe(1);
  });

  it("create and join give both sessions the same game", async () => {
    const { a, b } = await twoSessions();
    expect(b.playerId).toBe(2);
    expect(b.state!.seed).toBe(a.state!.seed);
    await waitFor(() => a.state!.players[2]?.name === "Bo", "A to see Bo");
  });

  it("B's build shows up in both games as B's", async () => {
    const { a, b } = await twoSessions();
    const results: CommandResult[] = [];
    b.onResult = (r) => results.push(r);
    const { x, y } = openTile(b.state!);
    b.send({ type: "build", kind: "wall", x, y });
    await waitFor(() => results.length > 0, "B's result");
    expect(results).toEqual([{ ok: true }]);
    const owned = (s: NetworkSession) =>
      Object.values(s.state!.structures).some((st) => st.x === x && st.y === y && st.owner === 2);
    await waitFor(() => owned(a), "A to see B's wall");
    await waitFor(() => owned(b), "B to see its wall");
  });

  it("reports a refused command's reason", async () => {
    const { b } = await twoSessions();
    const results: CommandResult[] = [];
    b.onResult = (r) => results.push(r);
    const { keep } = b.state!; // maps are random, but the keep can never be sold
    b.send({ type: "sell", x: keep.x, y: keep.y });
    await waitFor(() => results.length > 0);
    expect(results[0]).toEqual({ ok: false, reason: "Can't sell the keep" });
  });

  it("keeps the token for the room, and a new session with it rejoins as the same player", async () => {
    const { a, b, bStorage } = await twoSessions();
    expect(bStorage.getItem(tokenKey(a.room!))).toMatch(/^[0-9a-f]{32}$/);
    b.close();
    await waitFor(() => a.state!.players[2]?.connected === false, "B to drop");
    const again = open({ mode: "join", room: a.room!, name: "Someone else" }, bStorage);
    await waitFor(() => again.state);
    expect(again.playerId).toBe(2);
    expect(again.state!.players[2].name).toBe("Bo");
  });

  it("joins as a new player when the stored token is stale", async () => {
    const { a } = await twoSessions();
    const storage = memoryStorage();
    storage.setItem(tokenKey(a.room!), "f".repeat(32));
    const c = open({ mode: "join", room: a.room!, name: "Cy" }, storage);
    await waitFor(() => c.state);
    expect(c.playerId).toBe(3);
  });

  it("reports an unknown room", async () => {
    const errors: string[] = [];
    const c = open({ mode: "join", room: "ZZZZ", name: "Cy" });
    c.onError = (reason) => errors.push(reason);
    await waitFor(() => errors.length > 0);
    expect(errors).toEqual(["No room with that code"]);
  });

  it("never sends debug commands, and refuses commands before the welcome", async () => {
    const results: CommandResult[] = [];
    const a = open({ mode: "create", name: "Ann" });
    a.onResult = (r) => results.push(r);
    a.send({ type: "togglePause" });
    expect(results).toEqual([{ ok: false, reason: "Not connected" }]);
    await waitFor(() => a.state);
    a.send({ type: "debugSpawn", count: 5 });
    await new Promise((r) => setTimeout(r, 50));
    expect(results).toHaveLength(1);
  });
});

describe("feel", () => {
  it("shows a build as pending until the server's update has it", async () => {
    const { b } = await twoSessions();
    const { x, y } = openTile(b.state!);
    b.send({ type: "build", kind: "wall", x, y });
    expect(b.pending).toEqual([{ kind: "wall", x, y, facing: undefined, confirmed: false }]);
    await waitFor(() => b.pending.length === 0, "pending to clear");
    expect(Object.values(b.state!.structures).some((s) => s.x === x && s.y === y)).toBe(true);
  });

  it("drops a refused build from pending", async () => {
    const { b } = await twoSessions();
    const { keep } = b.state!;
    b.send({ type: "build", kind: "wall", x: keep.x, y: keep.y });
    expect(b.pending).toHaveLength(1);
    await waitFor(() => b.pending.length === 0, "pending to clear");
  });

  it("smooths enemies between the last two ticks it heard about", async () => {
    const { a } = await twoSessions();
    a.send({ type: "sendWave" });
    // Advance the room by hand (tests run no room timer): 2 ticks per call.
    for (let i = 1; i <= 8; i++) {
      advanceAll(hub.registry, 100);
      await waitFor(() => a.state!.tick >= i * 2, `tick ${i * 2}`);
    }
    await waitFor(() => a.state!.enemies.length > 0, "enemies");
    const positions = () => a.state!.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y }));
    const newest = positions(); // what the latest update said
    a.frame(Number.NEGATIVE_INFINITY); // as the newest update arrived: still the previous tick
    const earlier = positions();
    a.frame(Number.POSITIVE_INFINITY); // a full interval later: the newest tick
    expect(positions()).toEqual(newest);
    expect(earlier).not.toEqual(newest);
  });
});

describe("connection", () => {
  it("reconnects after a drop and rejoins as the same players", async () => {
    const { a, b } = await twoSessions();
    for (const client of server.wss.clients) client.terminate();
    await waitFor(() => a.status === "Reconnecting...", "A to notice the drop");
    await waitFor(
      () => a.status === `Room ${a.room}` && b.status === `Room ${b.room}`,
      "both back",
    );
    expect(a.playerId).toBe(1);
    expect(b.playerId).toBe(2);
    await waitFor(() => a.state!.players[2]?.connected === true, "B connected again");
  });

  it("stops when the same player opens another tab", async () => {
    const { b, bStorage, a } = await twoSessions();
    const other = open({ mode: "join", room: a.room!, name: "Bo" }, bStorage);
    await waitFor(() => other.state);
    await waitFor(() => b.status === "Opened in another tab", "B to be replaced");
    await new Promise((r) => setTimeout(r, 700)); // longer than the first reconnect delay
    expect(b.status).toBe("Opened in another tab");
    expect(other.playerId).toBe(2);
    expect(a.state!.players[2].connected).toBe(true);
  });
});

describe("lobby", () => {
  it("both sessions see the waiting room, then the host's start", async () => {
    const a = open({ mode: "create", name: "Ann" });
    await waitFor(() => a.state);
    const b = open({ mode: "join", room: a.room!, name: "Bo" });
    await waitFor(() => b.state);
    expect(b.lobby).toEqual({ started: false, host: 1 });
    a.start();
    await waitFor(() => b.lobby?.started, "B to see the start");
    expect(a.lobby).toEqual({ started: true, host: 1 });
  });
});
