import { describe, expect, it } from "vitest";
import { joinRoom, leaveRoom } from "../../server/room";
import { advanceAll, createRegistry, findRoom, openRoom } from "../../server/rooms";
import { EMPTY_ROOM_TTL_MS } from "../../server/config";

describe("room registry", () => {
  it("gives rooms unique 4-letter codes", () => {
    const registry = createRegistry(() => {});
    const codes = new Set(Array.from({ length: 50 }, () => openRoom(registry).code));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
  });

  it("deletes a room once nobody has been connected for the expiry time", () => {
    const registry = createRegistry(() => {});
    const room = openRoom(registry);
    const joined = joinRoom(room, "Ann");
    if (!joined.ok) throw new Error();
    leaveRoom(room, joined.playerId);
    advanceAll(registry, EMPTY_ROOM_TTL_MS - 1);
    expect(findRoom(registry, room.code)).toBe(room);
    advanceAll(registry, 1);
    expect(findRoom(registry, room.code)).toBeUndefined();
  });

  it("never deletes a room while someone is connected, and resets the clock on rejoin", () => {
    const registry = createRegistry(() => {});
    const room = openRoom(registry);
    const joined = joinRoom(room, "Ann");
    if (!joined.ok) throw new Error();
    advanceAll(registry, EMPTY_ROOM_TTL_MS * 3);
    expect(findRoom(registry, room.code)).toBe(room);
    leaveRoom(room, joined.playerId);
    advanceAll(registry, EMPTY_ROOM_TTL_MS - 10);
    joinRoom(room, "Bo");
    advanceAll(registry, 20);
    expect(findRoom(registry, room.code)).toBe(room);
  });
});
