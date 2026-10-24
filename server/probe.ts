// Checks a game server is reachable: creates a room and prints updates for a few seconds.
// Usage: npm run server:probe -- [host[:port]] [seconds]
import { WebSocket } from "ws";
import type { ServerMessage } from "../src/net/protocol";
import { DEFAULT_PORT, WS_PATH } from "./config";

const [target = "localhost", seconds = "5"] = process.argv.slice(2);
const address = target.includes(":") ? target : `${target}:${DEFAULT_PORT}`;
const url = `ws://${address}${WS_PATH}`;

console.log(`Connecting to ${url} ...`);
const socket = new WebSocket(url);

socket.on("error", (error) => {
  console.error(`Could not connect: ${error.message}`);
  console.error("Is the server running, and is the port open in the host's firewall?");
  process.exit(1);
});

socket.on("open", () => {
  console.log("Connected. Creating a room...");
  socket.send(JSON.stringify({ type: "create", name: "Probe" }));
  setTimeout(
    () => {
      console.log("Probe finished: the server is reachable.");
      socket.close();
      process.exit(0);
    },
    Number(seconds) * 1000,
  );
});

socket.on("message", (data) => {
  const message: ServerMessage = JSON.parse(data.toString());
  if (message.type === "welcome") {
    const { width, height, seed } = message.state;
    console.log(
      `Welcome: room ${message.room}, player ${message.playerId}, ${width}x${height} map, seed ${seed}`,
    );
  } else if (message.type === "update") {
    const { tick, enemies, players, wave } = message.update;
    console.log(
      `tick ${tick}  wave ${wave.number}  enemies ${enemies.length}  players ${Object.keys(players).length}`,
    );
  } else {
    console.log(message);
  }
});
