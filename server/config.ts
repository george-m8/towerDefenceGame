// Server tunables. Gameplay numbers stay in src/sim/config.ts.

export const DEFAULT_HOST = "0.0.0.0"; // all interfaces, so other machines on the network can connect
export const DEFAULT_PORT = 8787;
export const WS_PATH = "/ws";
/** The Vite dev server's port, for the address printed on start. */
export const DEV_CLIENT_PORT = 5173;

export const MAX_PLAYERS = 4;
/** How often the server advances every room (they tick by elapsed time, not by this). */
export const ROOM_TIMER_MS = 25;
export const UPDATE_EVERY_TICKS = 2; // 20 Hz sim -> 10 Hz updates
/** Catch-up cap per advance at normal speed, as in main.ts. */
export const MAX_TICKS_PER_ADVANCE = 5;
export const MAX_MESSAGE_BYTES = 4096;
export const MAX_MESSAGES_PER_SECOND = 40;
export const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
