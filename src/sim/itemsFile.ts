// `.items` files: which structures a game lets players build, and how many of each a player can
// have standing at once (SPEC-items-editor.md). A kind that isn't listed has no limit; 0 means
// it can't be built at all. Plain data, no DOM, so the game server can read them too.
import { STRUCTURES, type StructureStats } from "./config";
import { MAP_NAME_PATTERN, mapName } from "./mapFile";
import type { BuildLimits, StructureKind } from "./types";

export const ITEMS_FORMAT = "keep-defence-items";
export const ITEMS_VERSION = 1;

/** The most a limit can be: past this it may as well have none. */
export const MAX_ITEM_LIMIT = 999;

export interface ItemsFile {
  format: typeof ITEMS_FORMAT;
  version: number;
  title: string;
  limits: BuildLimits;
  /** Fields this version doesn't know, kept as they are. */
  [extra: string]: unknown;
}

const KNOWN_KEYS = ["format", "version", "title", "limits"] as const;

/** An items file's name follows the same rules as a map's. */
export const ITEMS_NAME_PATTERN = MAP_NAME_PATTERN;
export const itemsName = mapName;

/** Everything a player can build, in the config's order: what an items file can limit. */
export const BUILDABLE_KINDS: StructureKind[] = (Object.keys(STRUCTURES) as StructureKind[]).filter(
  (kind) => (STRUCTURES[kind] as StructureStats).buildable !== false,
);

/** An items file with no limits: everything can be built, as many as you like. */
export function newItems(title: string): ItemsFile {
  return { format: ITEMS_FORMAT, version: ITEMS_VERSION, title, limits: {} };
}

/** Checks a parsed JSON value is an items file this game can use. */
export function parseItems(json: unknown): { items: ItemsFile } | { error: string } {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { error: "it isn't an items file (not a JSON object)" };
  }
  const raw = json as Record<string, unknown>;
  if (raw.format !== ITEMS_FORMAT)
    return { error: `it isn't an items file (format "${raw.format}")` };
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) {
    return { error: "its version is missing" };
  }
  if (raw.version > ITEMS_VERSION) {
    return { error: `it's version ${raw.version}, newer than this game reads (${ITEMS_VERSION})` };
  }
  if (typeof raw.title !== "string") return { error: "its title is missing" };
  const rawLimits = raw.limits;
  if (typeof rawLimits !== "object" || rawLimits === null || Array.isArray(rawLimits)) {
    return { error: "its limits are missing" };
  }
  const limits: BuildLimits = {};
  for (const [kind, limit] of Object.entries(rawLimits)) {
    if (!BUILDABLE_KINDS.includes(kind as StructureKind)) {
      return { error: `"${kind}" isn't something players can build` };
    }
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > MAX_ITEM_LIMIT
    ) {
      return { error: `the limit for ${kind} isn't a whole number from 0 to ${MAX_ITEM_LIMIT}` };
    }
    limits[kind as StructureKind] = limit;
  }
  const extra = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !(KNOWN_KEYS as readonly string[]).includes(key)),
  );
  return {
    items: { ...extra, format: ITEMS_FORMAT, version: raw.version, title: raw.title, limits },
  };
}

/** The file's text: known keys first, limits in the config's order, extra fields after. */
export function serializeItems(items: ItemsFile): string {
  const limits = Object.fromEntries(
    BUILDABLE_KINDS.filter((kind) => items.limits[kind] !== undefined).map((kind) => [
      kind,
      items.limits[kind],
    ]),
  );
  const extra = Object.fromEntries(
    Object.entries(items).filter(([key]) => !(KNOWN_KEYS as readonly string[]).includes(key)),
  );
  const ordered = {
    format: items.format,
    version: items.version,
    title: items.title,
    limits,
    ...extra,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** The items file with one kind's limit changed (undefined: no limit). */
export function withLimit(
  items: ItemsFile,
  kind: StructureKind,
  limit: number | undefined,
): ItemsFile {
  const limits = { ...items.limits };
  if (limit === undefined) delete limits[kind];
  else limits[kind] = Math.max(0, Math.min(MAX_ITEM_LIMIT, Math.round(limit)));
  return { ...items, limits };
}
