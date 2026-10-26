// When a health bar shows: while its tile is hovered, or for a moment after it loses health,
// then fading out. Something that starts out damaged (a ruin) shows nothing until one of those
// happens. The renderer keeps one tracker, fed what it draws each frame.

/** How long a bar stays after a hit, then how long it takes to fade (ms). */
export const HP_BAR_SHOW_MS = 1200;
export const HP_BAR_FADE_MS = 400;

export interface HpBarTracker {
  /**
   * How opaque the bar for `key` (something with health) should be now, 0 to 1. Notes a hit
   * if its health has dropped since the last frame.
   */
  alpha(key: string, hp: number, now: number, hovered: boolean): number;
  /** Forgets everything not asked about since the last call (gone, or off screen). */
  endFrame(): void;
}

export function createHpBarTracker(): HpBarTracker {
  let seen = new Map<string, { hp: number; hitAt: number }>();
  let next = new Map<string, { hp: number; hitAt: number }>();
  return {
    alpha(key, hp, now, hovered) {
      const before = seen.get(key) ?? next.get(key);
      const hitAt = before && hp < before.hp ? now : (before?.hitAt ?? -Infinity);
      next.set(key, { hp, hitAt });
      if (hovered) return 1;
      const since = now - hitAt;
      if (since <= HP_BAR_SHOW_MS) return 1;
      return Math.max(0, 1 - (since - HP_BAR_SHOW_MS) / HP_BAR_FADE_MS);
    },
    endFrame() {
      seen = next;
      next = new Map();
    },
  };
}
