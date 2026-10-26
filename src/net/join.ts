// How a page joins a game: from the URL, or the start screen when the URL doesn't say.
import { MAP_SIZES, type MapSize } from "../sim/config";
import { MAP_NAME_PATTERN } from "../sim/mapFile";
import { MAX_NAME_LENGTH } from "./protocol";
import type { JoinIntent } from "./networkSession";

export type PageIntent =
  | { mode: "menu"; room?: string }
  /** `map`: a map in maps/ to play (by name), instead of a generated one. */
  | { mode: "offline"; size?: MapSize; map?: string }
  | JoinIntent;

/**
 * `?create&name=Ann` creates a room (`&game=pvp` for PvP) and `?room=ABCD&name=Bo` joins one;
 * `?solo` plays offline. `&size=L` picks the map size when playing solo or creating a room;
 * `&map=river-crossing` plays maps/river-crossing.map solo.
 * Anything else, or a missing name, opens the start screen (with the room code filled in).
 */
export function readJoinIntent(search: string): PageIntent {
  const params = new URLSearchParams(search);
  const sizeParam = params.get("size")?.toUpperCase();
  const size = sizeParam && Object.hasOwn(MAP_SIZES, sizeParam) ? (sizeParam as MapSize) : null;
  const map = params.get("map");
  if (params.has("solo")) {
    return {
      mode: "offline",
      ...(size ? { size } : {}),
      ...(map && MAP_NAME_PATTERN.test(map) ? { map } : {}),
    };
  }
  const room = params.get("room")?.toUpperCase();
  const name = cleanName(params.get("name"));
  if (room && name) return { mode: "join", room, name };
  if (params.has("create") && name) {
    return {
      mode: "create",
      name,
      ...(params.get("game") === "pvp" ? { game: "pvp" as const } : {}),
      ...(size ? { size } : {}),
    };
  }
  return room ? { mode: "menu", room } : { mode: "menu" };
}

/** The dev switch `?fog=off` turns fog of war off (for testing in the browser). */
export function fogFromUrl(search: string): boolean {
  return new URLSearchParams(search).get("fog") !== "off";
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

/** A usable player name, or null if there isn't one. */
export function cleanName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || null;
}
