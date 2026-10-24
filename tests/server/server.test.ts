import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startServer, type GameServer } from "../../server/server";

let server: GameServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

describe("server", () => {
  it("accepts WebSocket connections on /ws", async () => {
    let connections = 0;
    server = await startServer("127.0.0.1", 0, () => connections++);
    const socket = await connect(`ws://127.0.0.1:${server.port}/ws`);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
    expect(connections).toBe(1);
  });

  it("refuses WebSocket connections on other paths", async () => {
    server = await startServer("127.0.0.1", 0);
    await expect(connect(`ws://127.0.0.1:${server.port}/other`)).rejects.toThrow();
  });
});
