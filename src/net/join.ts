// How a page joins a game: offline, or a room on the game server, chosen by the URL.
// (A proper create/join screen comes with the lobby module.)
import { MAX_NAME_LENGTH } from "./protocol";
import type { JoinIntent } from "./networkSession";

export type PageIntent = { mode: "offline" } | JoinIntent;

const DEFAULT_NAME = "Player";

/**
 * `?create&name=Ann` creates a room, `?room=ABCD&name=Bo` joins one, anything else is offline.
 * A missing name is asked for with `ask` (window.prompt in the browser).
 */
export function readJoinIntent(
  search: string,
  ask: (question: string) => string | null,
): PageIntent {
  const params = new URLSearchParams(search);
  const room = params.get("room");
  if (!room && !params.has("create")) return { mode: "offline" };
  const name = cleanName(params.get("name") || ask("Your name?"));
  return room ? { mode: "join", room: room.toUpperCase(), name } : { mode: "create", name };
}

export function inviteLink(origin: string, room: string): string {
  return `${origin}/?room=${room}`;
}

/** The game server is always on the page's own host at /ws (Vite proxies it in dev). */
export function serverUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
}

/** Where a tab keeps its rejoin token for a room (sessionStorage, so each tab is its own player). */
export function tokenKey(room: string): string {
  return `keep-defence-token-${room}`;
}

function cleanName(name: string | null): string {
  const trimmed = (name ?? "").trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || DEFAULT_NAME;
}
