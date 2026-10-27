// The campaign's progress on this device: the stars (1 to 3) each player has won on each level,
// saved in localStorage, and from them which levels are unlocked. The first level is always
// open; each one after opens once the one before has at least a star. The level select screen
// is a fixed grid, so slots past the last level made so far show as locked too.

const PROGRESS_KEY = "keep-defence-campaign";

/** The level select grid: columns by rows. */
export const LEVEL_GRID = { columns: 4, rows: 3 } as const;
export const LEVEL_SLOTS = LEVEL_GRID.columns * LEVEL_GRID.rows;
export const MAX_STARS = 3;

/** Stars won, by level (its folder name in levels/). */
export type Progress = Record<string, number>;

/** One square of the level select grid. */
export interface LevelSlot {
  /** The level's folder name, or null for a slot no level has yet. */
  name: string | null;
  unlocked: boolean;
  stars: number;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function loadAll(storage: Store | null): Record<string, Progress> {
  if (!storage) return {};
  try {
    const saved = JSON.parse(storage.getItem(PROGRESS_KEY) ?? "{}") as unknown;
    return typeof saved === "object" && saved !== null && !Array.isArray(saved)
      ? (saved as Record<string, Progress>)
      : {};
  } catch {
    return {}; // storage blocked or garbled: start afresh
  }
}

/** A player's stars on each level they've won; anything garbled counts as none. */
export function loadProgress(storage: Store | null, player: string): Progress {
  const raw = loadAll(storage)[player];
  if (typeof raw !== "object" || raw === null) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, stars]) => Number.isInteger(stars) && stars >= 1)
      .map(([level, stars]) => [level, Math.min(MAX_STARS, stars)]),
  );
}

/** Saves a level won with `stars`, keeping the player's best. Returns their progress after. */
export function recordStars(
  storage: Store | null,
  player: string,
  level: string,
  stars: number,
): Progress {
  const progress = loadProgress(storage, player);
  const won = Math.max(0, Math.min(MAX_STARS, Math.round(stars)));
  if (won > (progress[level] ?? 0)) progress[level] = won;
  if (storage) {
    try {
      storage.setItem(PROGRESS_KEY, JSON.stringify({ ...loadAll(storage), [player]: progress }));
    } catch {
      // storage full or blocked: the stars just aren't kept
    }
  }
  return progress;
}

/** The grid's slots: the levels in order, then empty locked slots to fill it. */
export function levelSlots(levels: string[], progress: Progress): LevelSlot[] {
  return Array.from({ length: Math.max(LEVEL_SLOTS, levels.length) }, (_, i) => {
    const name = levels[i] ?? null;
    const unlocked = name !== null && (i === 0 || (progress[levels[i - 1]] ?? 0) >= 1);
    return { name, unlocked, stars: name ? (progress[name] ?? 0) : 0 };
  });
}
