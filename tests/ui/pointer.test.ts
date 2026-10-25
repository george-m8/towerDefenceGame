import { describe, expect, it } from "vitest";
import {
  DEFAULT_POINTER_SETTINGS,
  POINTER_MIN_OPACITY,
  POINTER_SIZES,
  loadPointerSettings,
  pointerCursor,
  pointerSvg,
  savePointerSettings,
} from "../../src/ui/pointer";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("pointer settings", () => {
  it("round-trips colour, opacity and size through storage", () => {
    const storage = memoryStorage();
    const settings = { colour: "#ff8800", opacity: 0.5, size: 40 };
    savePointerSettings(storage, settings);
    expect(loadPointerSettings(storage)).toEqual(settings);
  });

  it("uses defaults when nothing is saved, the saved value is junk, or storage is blocked", () => {
    const storage = memoryStorage();
    expect(loadPointerSettings(storage)).toEqual(DEFAULT_POINTER_SETTINGS);
    storage.setItem("keep-pointer", "{not json");
    expect(loadPointerSettings(storage)).toEqual(DEFAULT_POINTER_SETTINGS);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadPointerSettings(blocked)).toEqual(DEFAULT_POINTER_SETTINGS);
    expect(() => savePointerSettings(blocked, DEFAULT_POINTER_SETTINGS)).not.toThrow();
  });

  it("clamps out-of-range values and ignores a colour that isn't #rrggbb", () => {
    const storage = memoryStorage();
    storage.setItem("keep-pointer", JSON.stringify({ colour: "red", opacity: 0, size: 500 }));
    expect(loadPointerSettings(storage)).toEqual({
      colour: DEFAULT_POINTER_SETTINGS.colour,
      opacity: POINTER_MIN_OPACITY,
      size: POINTER_SIZES.max,
    });
  });
});

describe("the pointer", () => {
  it("draws a crosshair in the chosen colour, size and opacity", () => {
    const svg = pointerSvg({ colour: "#ff8800", opacity: 0.5, size: 40 });
    expect(svg).toContain('width="40" height="40" opacity="0.5"');
    expect(svg).toContain('stroke="#ff8800"');
  });

  it("is a cursor with its hotspot in the middle, falling back to the plain crosshair", () => {
    const cursor = pointerCursor({ ...DEFAULT_POINTER_SETTINGS, size: 30 });
    expect(cursor).toMatch(/^url\("data:image\/svg\+xml,.*"\) 15 15, crosshair$/);
  });
});
