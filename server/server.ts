import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { MAX_MESSAGE_BYTES, WS_PATH } from "./config";

export interface GameServer {
  http: Server;
  wss: WebSocketServer;
  /** The port actually bound (useful when started on port 0). */
  port: number;
  close(): Promise<void>;
}

/** Starts the HTTP server with the WebSocket endpoint at WS_PATH. */
export async function startServer(
  host: string,
  port: number,
  onConnection: (socket: WebSocket) => void = () => {},
): Promise<GameServer> {
  const http = createServer((_req, res) => {
    res.writeHead(404).end();
  });
  // Larger messages close the connection (code 1009) before they reach our code.
  const wss = new WebSocketServer({ server: http, path: WS_PATH, maxPayload: MAX_MESSAGE_BYTES });
  wss.on("connection", onConnection);
  await new Promise<void>((resolve) => http.listen(port, host, resolve));
  return {
    http,
    wss,
    port: (http.address() as AddressInfo).port,
    close: async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
