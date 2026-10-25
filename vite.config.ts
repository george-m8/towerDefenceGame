import { defineConfig } from "vitest/config";
import { DEFAULT_PORT, WS_PATH } from "./server/config";

const serverPort = Number(process.env.PORT ?? DEFAULT_PORT);

export default defineConfig({
  server: {
    // The browser always connects to its own origin; Vite forwards /ws to the game server.
    proxy: { [WS_PATH]: { target: `ws://localhost:${serverPort}`, ws: true } },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/sim/**/*.ts", "src/net/**/*.ts", "src/audio/**/*.ts", "server/**/*.ts"],
      // Entry points, and raw Web Audio wiring (synth.ts: checked by ear on ?soundtest).
      exclude: ["server/main.ts", "server/probe.ts", "src/audio/synth.ts"],
      reporter: ["text", "html"],
      thresholds: { lines: 80 },
    },
  },
});
