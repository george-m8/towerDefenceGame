// How a page joins a game: offline, or a room on the game server.

/** Where a tab keeps its rejoin token for a room (sessionStorage, so each tab is its own player). */
export function tokenKey(room: string): string {
  return `keep-defence-token-${room}`;
}
