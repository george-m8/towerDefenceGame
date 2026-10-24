// A test WebSocket client that collects server messages and waits for them by type.
import { WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "../../src/net/protocol";

export interface TestClient {
  socket: WebSocket;
  messages: ServerMessage[];
  send(message: ClientMessage | string): void;
  /** Resolves with the first message of `type` received after `from` (default: any so far). */
  next<T extends ServerMessage["type"]>(
    type: T,
    match?: (m: Extract<ServerMessage, { type: T }>) => boolean,
  ): Promise<Extract<ServerMessage, { type: T }>>;
  close(): Promise<void>;
}

export function connectClient(port: number): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: ServerMessage[] = [];
    const waiters: (() => void)[] = [];
    let seen = 0;
    socket.on("message", (data) => {
      messages.push(JSON.parse(data.toString()));
      for (const w of [...waiters]) w();
    });
    socket.once("error", reject);
    socket.once("open", () =>
      resolve({
        socket,
        messages,
        send: (m) => socket.send(typeof m === "string" ? m : JSON.stringify(m)),
        next: (type, match = () => true) =>
          new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`No ${type} message`)), 2000);
            const check = () => {
              for (; seen < messages.length; seen++) {
                const m = messages[seen];
                if (m.type === type && match(m as never)) {
                  seen++;
                  clearTimeout(timer);
                  waiters.splice(waiters.indexOf(check), 1);
                  done(m as never);
                  return;
                }
              }
            };
            waiters.push(check);
            check();
          }),
        close: () =>
          new Promise((done) => {
            if (socket.readyState === WebSocket.CLOSED) return done();
            socket.once("close", () => done());
            socket.close();
          }),
      }),
    );
  });
}
