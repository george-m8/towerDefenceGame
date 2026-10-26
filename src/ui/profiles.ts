// The players this device knows, for the player select screen: each a name and a picture (see
// picture.ts), saved in localStorage, the one picked last first. The game only ever sees the
// picked name (as before); the list is just so nobody has to type theirs again.
import { cleanName } from "../net/join";
import { cleanPicture, type Picture } from "./picture";

const PLAYERS_KEY = "keep-defence-players";
/** The name picked last (the key from before there was a list, so it carries over). */
const NAME_KEY = "keep-defence-name";
/** Players a device keeps, at most. */
export const MAX_PLAYERS = 8;

export interface Profile {
  name: string;
  picture: Picture;
}

type Store = Pick<Storage, "getItem" | "setItem">;

/**
 * The saved players, the one picked last first. A name saved before there was a list counts
 * as one, and a player saved before pictures gets one made from their name.
 */
export function loadPlayers(storage: Store | null): Profile[] {
  if (!storage) return [];
  try {
    const last = cleanName(storage.getItem(NAME_KEY));
    const saved = JSON.parse(storage.getItem(PLAYERS_KEY) ?? "[]") as unknown;
    const players: Profile[] = [];
    for (const entry of Array.isArray(saved) ? saved : []) {
      const raw = typeof entry === "string" ? { name: entry } : (entry as Partial<Profile>);
      const name = cleanName(typeof raw?.name === "string" ? raw.name : null);
      if (name) players.push({ name, picture: cleanPicture(raw.picture, name) });
    }
    if (last && !players.some((p) => p.name === last)) {
      players.push({ name: last, picture: cleanPicture(null, last) });
    }
    return withFirst(players, last).slice(0, MAX_PLAYERS);
  } catch {
    return []; // storage blocked or garbled: start afresh
  }
}

/** Saves the list, and `picked` (if given) as the player picked last, moving it first. */
export function savePlayers(storage: Store | null, players: Profile[], picked?: string): Profile[] {
  const list = withFirst(players, picked ?? null).slice(0, MAX_PLAYERS);
  try {
    storage?.setItem(PLAYERS_KEY, JSON.stringify(list));
    if (picked) storage?.setItem(NAME_KEY, picked);
  } catch {
    // not saved; harmless
  }
  return list;
}

/**
 * The list with `player` added first, or `was` (an existing player's name) replaced by it,
 * or why not.
 */
export function putPlayer(
  players: Profile[],
  player: Profile,
  was?: string,
): { players: Profile[] } | { error: string } {
  const name = cleanName(player.name);
  if (!name) return { error: "Type a name" };
  const others = players.filter((p) => p.name !== was);
  if (others.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return { error: `${name} is already here` };
  }
  if (others.length >= MAX_PLAYERS) return { error: `${MAX_PLAYERS} players at most: remove one` };
  return { players: [{ name, picture: player.picture }, ...others] };
}

export function removePlayer(players: Profile[], name: string): Profile[] {
  return players.filter((p) => p.name !== name);
}

/** `players` with the one named `first` moved to the front, without repeated names. */
function withFirst(players: Profile[], first: string | null): Profile[] {
  const unique = players.filter((p, i) => players.findIndex((q) => q.name === p.name) === i);
  const lead = unique.filter((p) => p.name === first);
  return [...lead, ...unique.filter((p) => p.name !== first)];
}
