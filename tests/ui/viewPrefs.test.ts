import { describe, expect, it } from "vitest";
import { createUiState } from "../../src/ui/state";
import { defaultViewPrefs, loadViewPrefs, saveViewPrefs } from "../../src/ui/viewPrefs";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("view preferences", () => {
  it("shows the Info box and income by default", () => {
    const prefs = loadViewPrefs(null);
    expect(prefs.panels.info).toBe(true);
    expect(prefs.hudStats).toEqual(["gold", "income"]);
    expect(createUiState().hudStats).toEqual(defaultViewPrefs().hudStats);
  });

  it("remembers what the player changed", () => {
    const storage = memoryStorage();
    saveViewPrefs(storage, { panels: { map: true, info: false, keys: true }, hudStats: ["wave"] });
    expect(loadViewPrefs(storage)).toEqual({
      panels: { map: true, info: false, keys: true },
      hudStats: ["wave"],
    });
  });

  it("falls back to the defaults for junk, unknown stats and storage that throws", () => {
    const storage = memoryStorage();
    storage.setItem("keep-view", "{not json");
    expect(loadViewPrefs(storage)).toEqual(defaultViewPrefs());
    storage.setItem("keep-view", JSON.stringify({ panels: { info: "yes" }, hudStats: ["nope"] }));
    expect(loadViewPrefs(storage)).toEqual(defaultViewPrefs());
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadViewPrefs(broken)).toEqual(defaultViewPrefs());
    expect(() => saveViewPrefs(broken, defaultViewPrefs())).not.toThrow();
  });
});
