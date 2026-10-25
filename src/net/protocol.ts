// The messages between browser and game server. Shared by both, so no Node or DOM APIs here.
import { STRUCTURES, type StructureStats } from "../sim/config";
import type {
  Command,
  CommandResult,
  Enemy,
  Facing,
  GameState,
  PlayerId,
  Structure,
  StructureKind,
} from "../sim/types";

/** Room codes avoid letters that look like digits (I, O). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 16;
const MAX_TOKEN_LENGTH = 64;
/** Coordinates are checked against the map by the sim; this only bounds the numbers. */
const MAX_COORDINATE = 4096;

/** Commands a player may send online (no debug commands). */
export type OnlineCommand = Exclude<Command, { type: "debugSpawn" }>;

export type ClientMessage =
  | { type: "create"; name: string }
  | { type: "join"; room: string; name: string }
  | { type: "rejoin"; room: string; token: string }
  | { type: "command"; seq: number; command: OnlineCommand }
  | { type: "restart" }
  /** Host only: leave the waiting room and start the game. */
  | { type: "start" };

/** The waiting room: whether the game has started, and who can start it. */
export interface LobbyInfo {
  started: boolean;
  /** The connected player with the lowest id; null while nobody is connected. */
  host: PlayerId | null;
}

/** The enemy fields a client draws with. Positions are rounded to 2 decimals. */
export type ClientEnemy = Pick<Enemy, "id" | "x" | "y" | "hp" | "maxHp">;
/** Structures without their firing cooldown, which only the server needs. */
export type ClientStructure = Omit<Structure, "cooldown">;

/**
 * Everything a client needs to draw the game. `flow` is rebuilt lazily, `rngState` stays on
 * the server, and enemies and structures carry only the fields a client uses.
 */
export type ClientState = Omit<GameState, "flow" | "rngState" | "enemies" | "structures"> & {
  enemies: ClientEnemy[];
  structures: Record<number, ClientStructure>;
};

type GridFields = "terrain" | "base" | "mount" | "features";
type DynamicFields =
  | "tick"
  | "gridVersion"
  | "enemies"
  | "effects"
  | "cues"
  | "structures"
  | "players"
  | "wave"
  | "keep"
  | "paused"
  | "speed"
  | "gameOver";

/** Sent every few ticks. The grid fields are only present when the grid changed. */
export type StateUpdate = Pick<ClientState, DynamicFields> & Partial<Pick<ClientState, GridFields>>;

export type ServerMessage =
  | {
      type: "welcome";
      room: string;
      playerId: PlayerId;
      token: string;
      state: ClientState;
      lobby: LobbyInfo;
    }
  | { type: "update"; update: StateUpdate; lobby: LobbyInfo }
  | { type: "result"; seq: number; result: CommandResult }
  | { type: "error"; reason: string };

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; error: string };

/** Turns raw socket text into a valid message, or an error. Never throws. */
export function parseClientMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail("Not JSON");
  }
  if (!isRecord(data)) return fail("Not a message");
  switch (data.type) {
    case "create": {
      const name = parseName(data.name);
      return name === null ? fail("Bad name") : ok({ type: "create", name });
    }
    case "join": {
      const name = parseName(data.name);
      if (!isRoomCode(data.room)) return fail("Bad room code");
      return name === null ? fail("Bad name") : ok({ type: "join", room: data.room, name });
    }
    case "rejoin": {
      if (!isRoomCode(data.room)) return fail("Bad room code");
      const token = data.token;
      if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
        return fail("Bad token");
      }
      return ok({ type: "rejoin", room: data.room, token });
    }
    case "command": {
      if (!isInt(data.seq, 0, Number.MAX_SAFE_INTEGER)) return fail("Bad seq");
      const command = parseCommand(data.command);
      return command ? ok({ type: "command", seq: data.seq, command }) : fail("Bad command");
    }
    case "restart":
      return ok({ type: "restart" });
    case "start":
      return ok({ type: "start" });
    default:
      return fail("Unknown message type");
  }
}

function parseCommand(data: unknown): OnlineCommand | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "togglePause":
    case "toggleFastForward":
    case "sendWave":
      return { type: data.type };
    case "sell":
      return isCoordinate(data.x) && isCoordinate(data.y)
        ? { type: "sell", x: data.x, y: data.y }
        : null;
    case "build": {
      if (!isBuildableKind(data.kind) || !isCoordinate(data.x) || !isCoordinate(data.y)) {
        return null;
      }
      if (data.facing === undefined)
        return { type: "build", kind: data.kind, x: data.x, y: data.y };
      if (!isFacing(data.facing)) return null;
      return { type: "build", kind: data.kind, x: data.x, y: data.y, facing: data.facing };
    }
    default:
      return null;
  }
}

/** A duplicate name gets " 2", " 3"... added. */
export function uniqueName(existing: string[], name: string): string {
  if (!existing.includes(name)) return name;
  let n = 2;
  while (existing.includes(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function isRoomCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === ROOM_CODE_LENGTH &&
    [...value].every((c) => ROOM_CODE_ALPHABET.includes(c))
  );
}

function isBuildableKind(value: unknown): value is StructureKind {
  if (typeof value !== "string" || !Object.hasOwn(STRUCTURES, value)) return false;
  const stats: StructureStats = STRUCTURES[value as StructureKind];
  return stats.buildable !== false;
}

function isFacing(value: unknown): value is Facing {
  return value === "N" || value === "E" || value === "S" || value === "W";
}

function isCoordinate(value: unknown): value is number {
  return isInt(value, 0, MAX_COORDINATE);
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ok(message: ClientMessage): ParseResult {
  return { ok: true, message };
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}
