import { networkInterfaces } from "node:os";
import { createGame, tick } from "../src/sim/game";
import { DEFAULT_HOST, DEFAULT_PORT, DEV_CLIENT_PORT, ROOM_TIMER_MS, WS_PATH } from "./config";
import { createHub, handleConnection } from "./connection";
import { advanceAll } from "./rooms";
import { startServer } from "./server";

const host = process.env.HOST ?? DEFAULT_HOST;
const port = Number(process.env.PORT ?? DEFAULT_PORT);

/** The first non-internal IPv4 address, i.e. what other machines on the network use. */
function lanAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return "localhost";
}

// Prove the simulation runs under Node before accepting players.
const check = createGame(Date.now() >>> 0);
tick(check);

const hub = createHub();
const server = await startServer(host, port, (socket) => handleConnection(hub, socket));

// The only real clock: every room advances by the actual time elapsed.
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  advanceAll(hub.registry, now - last);
  last = now;
}, ROOM_TIMER_MS);

const lan = lanAddress();
console.log(`Game server listening on ws://${host}:${server.port}${WS_PATH}`);
console.log(`Simulation OK (${check.width}x${check.height} map)`);
console.log(
  `Players on your network open: http://${lan}:${DEV_CLIENT_PORT} (with npm run dev -- --host)`,
);
