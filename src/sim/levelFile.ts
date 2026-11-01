// `.level` files: how a campaign level is played, beside its map and items in a folder in levels/
// (see tools/levels.ts). For now that's its name, its icon, its game mode, what it takes to win
// and how many stars, fog of war, and when enemies come; more will follow. Plain data, no DOM, like the map and items files.
import { ENEMY_KIND_ORDER, KEEP_SIZE, type MapSize } from "./config";
import type { ItemsFile } from "./itemsFile";
import { mapHeight, mapWidth, terrainOf, type MapFile } from "./mapFile";
import type { EnemiesCome, GameMode, Terrain } from "./types";

export const LEVEL_FORMAT = "keep-defence-level";
export const LEVEL_VERSION = 1;

export interface LevelFile {
  format: typeof LEVEL_FORMAT;
  version: number;
  /** The level's name on the level select screen, once it's unlocked. */
  title: string;
  /**
   * Its picture on the level select screen: the map simplified to a square of tiles (picture
   * tile ids, row by row; see mapIcon), or null if none is saved yet.
   */
  icon: LevelIcon | null;
  /** The game mode it's played as (Endless unless the file says otherwise); its map has none. */
  mode: GameMode;
  /** What it takes to win, and how well: see LevelWin. */
  win: LevelWin;
  /** Fog of war (on unless the file says otherwise). */
  fog: boolean;
  /** The day and night: when enemies come (all the time unless the file says otherwise). */
  dayNight: { enemiesCome: EnemiesCome };
  /** Fields this version doesn't know, kept as they are. */
  [extra: string]: unknown;
}

/** A whole campaign level, as the game gets it: its .level file, its map, and any build limits. */
export interface Level {
  level: LevelFile;
  map: MapFile;
  items?: ItemsFile;
}

/**
 * Winning a level: beat its first `waves` waves with the keep standing. Stars go by how much of
 * its health the keep has left then, as a percentage: at least `stars[3]` is 3 stars, at least
 * `stars[2]` is 2, and anything less (but standing) is 1.
 */
export interface LevelWin {
  waves: number;
  stars: { 3: number; 2: number };
}

/** Five waves; 3 stars with the keep untouched, 2 with it at half health or more. */
export const DEFAULT_WIN: LevelWin = { waves: 5, stars: { 3: 100, 2: 50 } };

/** The stars a level won with the keep at this health earns (1 to 3). */
export function starsFor(win: LevelWin, keep: { hp: number; maxHp: number }): number {
  const health = (keep.hp / keep.maxHp) * 100;
  if (health >= win.stars[3]) return 3;
  return health >= win.stars[2] ? 2 : 1;
}

/** A level's icon: rows of picture tile ids ("land:sea", "keep", "enemy:goblin"), as many as wide. */
export type LevelIcon = string[][];

/** How many tiles across (and down) a map's icon is: more for bigger maps. */
export const ICON_SIDES: Record<MapSize, number> = { XXS: 3, XS: 4, S: 5, M: 6, L: 7, XL: 8 };

const KNOWN_KEYS = [
  "format",
  "version",
  "title",
  "icon",
  "mode",
  "win",
  "fog",
  "dayNight",
] as const;
const MODES: GameMode[] = ["endless", "pvp"];
const ENEMIES_COME: EnemiesCome[] = ["always", "night"];

/** A level with the defaults: fog on, enemies all the time. */
export function newLevel(title: string): LevelFile {
  return {
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    title,
    icon: null,
    mode: "endless",
    win: DEFAULT_WIN,
    fog: true,
    dayNight: { enemiesCome: "always" },
  };
}

/** Checks a parsed JSON value is a level file this game can use; missing settings get defaults. */
export function parseLevel(json: unknown): { level: LevelFile } | { error: string } {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { error: "it isn't a level file (not a JSON object)" };
  }
  const raw = json as Record<string, unknown>;
  if (raw.format !== LEVEL_FORMAT)
    return { error: `it isn't a level file (format "${raw.format}")` };
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) {
    return { error: "its version is missing" };
  }
  if (raw.version > LEVEL_VERSION) {
    return { error: `it's version ${raw.version}, newer than this game reads (${LEVEL_VERSION})` };
  }
  if (typeof raw.title !== "string" || raw.title.trim() === "") {
    return { error: "its title is missing" };
  }
  const icon = raw.icon ?? null;
  if (icon !== null && !isIcon(icon)) {
    return { error: "its icon isn't a square of tile names (rows of strings, as many as wide)" };
  }
  const mode = raw.mode ?? "endless";
  if (!MODES.includes(mode as GameMode)) return { error: `mode isn't one of ${MODES.join(", ")}` };
  const win = readWin(raw.win ?? DEFAULT_WIN);
  if ("error" in win) return win;
  if (raw.fog !== undefined && typeof raw.fog !== "boolean") {
    return { error: "fog isn't true or false" };
  }
  const dayNight = raw.dayNight ?? {};
  if (typeof dayNight !== "object" || dayNight === null || Array.isArray(dayNight)) {
    return { error: "dayNight isn't an object" };
  }
  const enemiesCome = (dayNight as Record<string, unknown>).enemiesCome ?? "always";
  if (!ENEMIES_COME.includes(enemiesCome as EnemiesCome)) {
    return { error: `dayNight.enemiesCome isn't one of ${ENEMIES_COME.join(", ")}` };
  }
  const extra = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !(KNOWN_KEYS as readonly string[]).includes(key)),
  );
  return {
    level: {
      ...extra,
      format: LEVEL_FORMAT,
      version: raw.version,
      title: raw.title,
      icon,
      mode: mode as GameMode,
      win: win.win,
      fog: raw.fog ?? true,
      dayNight: { ...dayNight, enemiesCome: enemiesCome as EnemiesCome },
    },
  };
}

/** A level's win, checked: a number of waves, and star thresholds from 0 to 100, 3's the higher. */
function readWin(raw: unknown): { win: LevelWin } | { error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "win isn't an object" };
  }
  const { waves, stars, ...extra } = raw as Record<string, unknown>;
  if (typeof waves !== "number" || !Number.isInteger(waves) || waves < 1) {
    return { error: "win.waves isn't a whole number of waves, 1 or more" };
  }
  const thresholds = (stars ?? DEFAULT_WIN.stars) as Record<string, unknown>;
  const percent = (n: unknown) => typeof n === "number" && n >= 0 && n <= 100;
  if (typeof thresholds !== "object" || !percent(thresholds[3]) || !percent(thresholds[2])) {
    return { error: 'win.stars needs "3" and "2": keep health percentages, 0 to 100' };
  }
  const [three, two] = [thresholds[3] as number, thresholds[2] as number];
  if (three < two) return { error: 'win.stars "3" is less than "2"' };
  return { win: { ...extra, waves, stars: { 3: three, 2: two } } };
}

function isIcon(icon: unknown): icon is LevelIcon {
  return (
    Array.isArray(icon) &&
    icon.length > 0 &&
    icon.every(
      (row) =>
        Array.isArray(row) &&
        row.length === icon.length &&
        row.every((id) => typeof id === "string"),
    )
  );
}

/**
 * The map simplified to an icon, ICON_SIDES[size] tiles square: the map is cut into that many
 * blocks each way, and each block shows the keep if it holds the keep's middle, an enemy if it
 * holds a spawn zone's middle, and otherwise the terrain other than open ground there's most of,
 * once there's at least a line of it across the block (as many tiles as the block is short):
 * most of a map is ground, and this way a river or the coast still shows. Otherwise it's ground.
 */
export function mapIcon(map: MapFile): LevelIcon {
  const side = ICON_SIDES[map.size];
  const width = mapWidth(map);
  const height = mapHeight(map);
  const block = (x: number, y: number) =>
    Math.min(side - 1, Math.floor((y * side) / height)) * side +
    Math.min(side - 1, Math.floor((x * side) / width));
  const counts = Array.from({ length: side * side }, () => new Map<Terrain, number>());
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tally = counts[block(x, y)];
      const terrain = terrainOf(map, x, y);
      if (terrain !== "ground") tally.set(terrain, (tally.get(terrain) ?? 0) + 1);
    }
  }
  const line = Math.floor(Math.min(width, height) / side);
  const icon = counts.map((tally) => {
    let most: Terrain = "ground";
    let count = line - 1;
    for (const [terrain, n] of tally) {
      if (n > count) [most, count] = [terrain, n];
    }
    return `land:${most}`;
  });
  for (const zone of map.spawns) {
    icon[block(zone.x + Math.floor(zone.width / 2), zone.y + Math.floor(zone.height / 2))] =
      `enemy:${ENEMY_KIND_ORDER[0]}`;
  }
  const middle = Math.floor(KEEP_SIZE / 2);
  for (const keep of map.keeps) icon[block(keep.x + middle, keep.y + middle)] = "keep";
  return Array.from({ length: side }, (_, row) => icon.slice(row * side, (row + 1) * side));
}

/** The file's text: known keys first, extra fields after; each row of the icon on one line. */
export function serializeLevel(level: LevelFile): string {
  const extra = Object.fromEntries(
    Object.entries(level).filter(([key]) => !(KNOWN_KEYS as readonly string[]).includes(key)),
  );
  const ordered = {
    format: level.format,
    version: level.version,
    title: level.title,
    icon: level.icon,
    mode: level.mode,
    win: level.win,
    fog: level.fog,
    dayNight: level.dayNight,
    ...extra,
  };
  // Arrays of plain strings (the icon's rows) go on one line each, so the icon reads as a grid.
  const text = JSON.stringify(ordered, null, 2).replace(
    /\[\s*("[^"\\]*"(?:,\s*"[^"\\]*")*)\s*\]/g,
    (_, ids: string) => `[${ids.split(/",\s*"/).join('", "')}]`,
  );
  return `${text}\n`;
}
