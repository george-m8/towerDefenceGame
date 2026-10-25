// The monster journal: which kinds of enemy this device has seen, and the words for each entry.
// Pure (no DOM); the window lives in journalView.ts. Storage can be missing or blocked, so every
// read and write is guarded, as in audio/settings.ts.
import { ENEMY_KIND_ORDER, ENEMY_KINDS, type EnemyKindId, type EnemyVariant } from "../sim/config";
import { canSeeEnemiesAt } from "../sim/fog";
import type { GameState, PlayerId } from "../sim/types";

export interface Journal {
  /** Kinds found, with the wave each was first seen on. */
  found: Partial<Record<EnemyKindId, { firstSeenWave: number }>>;
}

const KEY = "keep-journal";

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function emptyJournal(): Journal {
  return { found: {} };
}

export function loadJournal(storage: Storage | null): Journal {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    const found = (saved as { found?: unknown } | null)?.found;
    if (!found || typeof found !== "object") return emptyJournal();
    const journal = emptyJournal();
    for (const kind of ENEMY_KIND_ORDER) {
      const wave = (found as Record<string, { firstSeenWave?: unknown } | undefined>)[kind]
        ?.firstSeenWave;
      if (typeof wave === "number" && Number.isFinite(wave))
        journal.found[kind] = { firstSeenWave: wave };
    }
    return journal;
  } catch {
    return emptyJournal();
  }
}

export function saveJournal(storage: Storage | null, journal: Journal): void {
  try {
    storage?.setItem(KEY, JSON.stringify(journal));
  } catch {
    // Not remembered this time; harmless.
  }
}

/** Unlocks kinds the viewer can see now; returns the newly found ones, in roster order. */
export function discover(journal: Journal, state: GameState, viewer: PlayerId): EnemyKindId[] {
  const found = new Set<EnemyKindId>();
  for (const enemy of state.enemies) {
    if (journal.found[enemy.kind] || found.has(enemy.kind)) continue;
    if (canSeeEnemiesAt(state, enemy.x, enemy.y, viewer)) found.add(enemy.kind);
  }
  for (const kind of found) journal.found[kind] = { firstSeenWave: Math.max(1, state.wave.number) };
  return ENEMY_KIND_ORDER.filter((kind) => found.has(kind));
}

/** A variant in words, from its multipliers: "runt (small): weaker, faster, hits softer". */
export function variantSummary(variant: EnemyVariant): string {
  const traits = [
    compare(variant.hp, "tougher", "weaker"),
    compare(variant.speed, "faster", "slower"),
    compare(variant.damage, "hits harder", "hits softer"),
  ].filter((t) => t !== null);
  const size = variant.size === "normal" ? "" : ` (${variant.size})`;
  return `${variant.name}${size}: ${traits.length > 0 ? traits.join(", ") : "the standard one"}`;
}

function compare(multiplier: number, more: string, less: string): string | null {
  return multiplier > 1 ? more : multiplier < 1 ? less : null;
}

/** The text of one journal entry: details once found, only a hint while locked. */
export function entryLines(kindId: EnemyKindId, journal: Journal): string[] {
  const kind = ENEMY_KINDS[kindId];
  const appears = `Appears from wave ${kind.firstWave}`;
  const found = journal.found[kindId];
  if (!found) return ["???", appears];
  const lines = [
    `${kind.name} (${kind.glyph})`,
    kind.description,
    `HP ${kind.hp} · speed ${kind.speed} · hits ${kind.damage} every ${kind.attackInterval}s · bounty ${kind.bounty}`,
    `${appears} · first seen on wave ${found.firstSeenWave}`,
  ];
  if (kind.variants.length > 1) lines.push(...kind.variants.map(variantSummary));
  return lines;
}

export function foundCount(journal: Journal): string {
  const found = ENEMY_KIND_ORDER.filter((kind) => journal.found[kind]).length;
  return `${found} of ${ENEMY_KIND_ORDER.length} found`;
}

const NOTICE_MS = 4000;

/** "New in the journal" notices, one per kind, shown one after another. */
export interface NoticeQueue {
  kinds: EnemyKindId[];
  /** When the front notice first showed; null until it does. */
  shownSince: number | null;
}

export function createNoticeQueue(): NoticeQueue {
  return { kinds: [], shownSince: null };
}

export function pushNotices(queue: NoticeQueue, kinds: EnemyKindId[]): void {
  queue.kinds.push(...kinds);
}

/** The notice to show at `now` (ms), or null. A notice's time starts when it first shows. */
export function currentNotice(queue: NoticeQueue, now: number): string | null {
  if (queue.kinds.length === 0) return null;
  queue.shownSince ??= now;
  while (now - queue.shownSince >= NOTICE_MS) {
    queue.kinds.shift();
    queue.shownSince += NOTICE_MS;
    if (queue.kinds.length === 0) {
      queue.shownSince = null;
      return null;
    }
  }
  return `New in the journal: ${ENEMY_KINDS[queue.kinds[0]].name} (J to open)`;
}
