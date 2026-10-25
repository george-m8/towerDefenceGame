// The map's mouse pointer: a crosshair drawn to the player's taste (colour, opacity, size), set
// in the settings window and remembered per device. Storage can be missing or blocked, so every
// read and write is guarded and falls back to defaults.

export interface PointerSettings {
  /** "#rrggbb" */
  colour: string;
  /** 0-1 */
  opacity: number;
  /** Width and height in pixels. */
  size: number;
}

/** Sizes the size slider allows. Browsers ignore cursor images bigger than 128px. */
export const POINTER_SIZES = { min: 12, max: 64 };
/** The faintest it goes, so it can't be lost altogether. */
export const POINTER_MIN_OPACITY = 0.1;

export const DEFAULT_POINTER_SETTINGS: PointerSettings = {
  colour: "#e6e1c1",
  opacity: 0.86,
  size: 32,
};

const KEY = "keep-pointer";

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function loadPointerSettings(storage: Storage | null): PointerSettings {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (!saved || typeof saved !== "object") return { ...DEFAULT_POINTER_SETTINGS };
    const s = saved as Record<string, unknown>;
    const d = DEFAULT_POINTER_SETTINGS;
    return {
      colour:
        typeof s.colour === "string" && /^#[0-9a-f]{6}$/i.test(s.colour) ? s.colour : d.colour,
      opacity: within(s.opacity, POINTER_MIN_OPACITY, 1, d.opacity),
      size: Math.round(within(s.size, POINTER_SIZES.min, POINTER_SIZES.max, d.size)),
    };
  } catch {
    return { ...DEFAULT_POINTER_SETTINGS };
  }
}

export function savePointerSettings(storage: Storage | null, settings: PointerSettings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not remembered this time; harmless.
  }
}

function within(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/**
 * The crosshair as an SVG image: lines in the chosen colour with a thin dark edge, so it shows
 * on any ground, and a gap in the middle so the tile under it stays visible.
 */
export function pointerSvg({ colour, opacity, size }: PointerSettings): string {
  const c = size / 2;
  const gap = Math.max(2, size / 8);
  const lines = `M${c} 0V${c - gap}M${c} ${c + gap}V${size}M0 ${c}H${c - gap}M${c + gap} ${c}H${size}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" opacity="${opacity}">` +
    `<path d="${lines}" stroke="#000" stroke-width="3.5"/>` +
    `<path d="${lines}" stroke="${colour}" stroke-width="1.5"/></svg>`
  );
}

/** The SVG as a URL for CSS (a cursor or a background). */
export function pointerImage(settings: PointerSettings): string {
  return `url("data:image/svg+xml,${encodeURIComponent(pointerSvg(settings))}")`;
}

/** The CSS cursor: the crosshair image with its hotspot in the middle, or the plain one. */
export function pointerCursor(settings: PointerSettings): string {
  const c = Math.floor(settings.size / 2);
  return `${pointerImage(settings)} ${c} ${c}, crosshair`;
}
