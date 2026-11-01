import { describe, expect, it } from "vitest";
import { editorKey } from "../../src/editor/keys";
import { KEYBOARD } from "../../src/ui/controls";

const press = (code: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}) =>
  editorKey({
    code,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
  });

describe("the editor's keys", () => {
  it("4 opens the Map tab; [ and ] change the brush or amount; P plays", () => {
    expect(press("Digit4")).toEqual({ type: "mapTab" });
    expect(press("BracketLeft")).toEqual({ type: "smaller" });
    expect(press("BracketRight")).toEqual({ type: "bigger" });
    expect(press("KeyP")).toEqual({ type: "play" });
  });

  it("undo and redo with Ctrl or Cmd", () => {
    expect(press("KeyZ", { ctrl: true })).toEqual({ type: "undo" });
    expect(press("KeyZ", { meta: true })).toEqual({ type: "undo" });
    expect(press("KeyZ", { ctrl: true, shift: true })).toEqual({ type: "redo" });
    expect(press("KeyY", { ctrl: true })).toEqual({ type: "redo" });
  });

  it("leaves other browser shortcuts alone", () => {
    expect(press("KeyP", { ctrl: true })).toBeNull();
    expect(press("KeyS", { meta: true })).toBeNull();
  });

  it("never takes a key the game uses, so no game key means something else here", () => {
    const gameKeys = Object.values(KEYBOARD.bindings).flat();
    expect(gameKeys).toContain("KeyR");
    for (const code of gameKeys) expect(press(code), code).toBeNull();
  });
});
