// What this device shows (SPEC-beginner-help.md): which side panels are open (View menu) and which
// stats the HUD shows. New players get the Info box and their income without opening a menu;
// whatever a player changes is remembered here and used next time. Storage can be missing or
// blocked, so every read and write is guarded, as in journal.ts.
import type { StatId } from "./stats";

export type PanelId = "map" | "info" | "keys";

export interface ViewPrefs {
  panels: Record<PanelId, boolean>;
  /** Never empty. */
  hudStats: StatId[];
}

export function defaultViewPrefs(): ViewPrefs {
  return { panels: { map: true, info: true, keys: false }, hudStats: ["gold", "income"] };
}

const KEY = "keep-view";
const PANELS: PanelId[] = ["map", "info", "keys"];
const STATS: StatId[] = ["gold", "income", "keep", "wave", "next", "rival", "mode", "seed"];

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** The saved choices, with the defaults for anything missing or not understood. */
export function loadViewPrefs(storage: Storage | null): ViewPrefs {
  const prefs = defaultViewPrefs();
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? "null") as Partial<{
      panels: Record<string, unknown>;
      hudStats: unknown;
    }> | null;
    for (const id of PANELS) {
      const shown = saved?.panels?.[id];
      if (typeof shown === "boolean") prefs.panels[id] = shown;
    }
    const stats = saved?.hudStats;
    if (Array.isArray(stats)) {
      const known = STATS.filter((id) => stats.includes(id));
      if (known.length > 0) prefs.hudStats = known;
    }
  } catch {
    // Unreadable: the defaults.
  }
  return prefs;
}

export function saveViewPrefs(storage: Storage | null, prefs: ViewPrefs): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Not remembered this time; harmless.
  }
}
