import { networkInterfaces } from "node:os";
import { createGame, tick } from "../src/sim/game";
import { DEFAULT_HOST, DEFAULT_PORT, DEV_CLIENT_PORT, WS_PATH } from "./config";
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

const server = await startServer(host, port);
const lan = lanAddress();
console.log(`Game server listening on ws://${host}:${server.port}${WS_PATH}`);
console.log(`Simulation OK (${check.width}x${check.height} map)`);
console.log(
  `Players on your network open: http://${lan}:${DEV_CLIENT_PORT} (with npm run dev -- --host)`,
);
