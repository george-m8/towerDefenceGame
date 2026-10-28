import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  DEFAULT_SCHEMES,
  KEYBOARD,
  PAD,
  PLAYSTATION,
  SWITCH,
  XBOX,
  actionFace,
  buttonActions,
  keyAction,
  loadRemaps,
  padDevice,
  saveRemaps,
  shapeStick,
  withRemaps,
} from "../../src/ui/controls";
import { createUiState } from "../../src/ui/state";
import { keyText } from "../../src/ui/keyLabels";
import { helpLine } from "../../src/ui/panel";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("controls", () => {
  it("binds the keyboard's keys to actions", () => {
    expect(keyAction(KEYBOARD, "Space")).toBe("pause");
    expect(keyAction(KEYBOARD, "Digit1")).toBe("buildTowers");
    expect(keyAction(KEYBOARD, "ArrowLeft")).toBe("panLeft");
    expect(keyAction(KEYBOARD, "KeyA")).toBe("panLeft");
    expect(keyAction(KEYBOARD, "KeyZ")).toBeUndefined();
  });

  it("never binds one key to two actions", () => {
    const codes = Object.values(KEYBOARD.bindings).flat();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("shows the same action by each device's own face: R, Y, △, X", () => {
    const faces = [KEYBOARD, XBOX, PLAYSTATION, SWITCH].map((s) => actionFace(s, "menu")?.text);
    expect(faces).toEqual([undefined, "Y", "△", "X"]);
    const rotate = [KEYBOARD, XBOX, PLAYSTATION, SWITCH].map((s) => actionFace(s, "rotate")?.text);
    expect(rotate).toEqual(["R", "RB", "R1", "R"]);
    const sell = [XBOX, PLAYSTATION, SWITCH].map((s) => actionFace(s, "toggleSell")?.text);
    expect(sell).toEqual(["X", "□", "Y"]);
  });

  it("lays a Switch pad out as asked", () => {
    const face = (action: Parameters<typeof actionFace>[1]) => actionFace(SWITCH, action)?.text;
    expect(face("menu")).toBe("X");
    expect([face("rotateBack"), face("rotate")]).toEqual(["L", "R"]);
    expect(face("toggleSell")).toBe("Y");
    expect([face("stepUp"), face("stepDown"), face("stepLeft"), face("stepRight")]).toEqual([
      "D↑",
      "D↓",
      "D←",
      "D→",
    ]);
    expect([face("zoomOut"), face("zoomIn")]).toEqual(["ZL", "ZR"]);
    expect([face("pause"), face("fastForward")]).toEqual(["−", "+"]);
    expect(face("journal")).toBeUndefined(); // nothing else, for now
  });

  it("gives PlayStation and Xbox faces their colours, and names symbols in full", () => {
    expect(actionFace(PLAYSTATION, "menu")).toMatchObject({ name: "Triangle" });
    expect(actionFace(XBOX, "place")?.color).toBeTruthy();
  });

  it("confirms with A on every pad; a Switch pad reports its buttons by label (0 is A)", () => {
    expect(actionFace(XBOX, "place")?.text).toBe("A");
    expect(actionFace(SWITCH, "place")?.text).toBe("A");
    expect(actionFace(SWITCH, "cancel")?.text).toBe("B");
    expect(buttonActions(SWITCH, 0)).toEqual(["place"]);
    expect(buttonActions(SWITCH, 1)).toEqual(["cancel"]);
    expect(buttonActions(SWITCH, 2)).toEqual(["menu"]);
    expect(buttonActions(SWITCH, 3)).toEqual(["toggleSell"]);
  });

  it("shows nothing for an action a device doesn't bind", () => {
    expect(actionFace(XBOX, "debugMenu")).toBeNull();
    expect(actionFace(KEYBOARD, "place")).toBeNull();
  });

  it("knows a pad's family from its id", () => {
    expect(padDevice("054c-0ce6-DualSense Wireless Controller")).toBe("playstation");
    expect(padDevice("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toBe(
      "switch",
    );
    expect(padDevice("Xbox Wireless Controller (STANDARD GAMEPAD)")).toBe("xbox");
    expect(padDevice("Some Generic Pad")).toBe("xbox");
  });

  describe("shapeStick", () => {
    const feel = XBOX.feel;

    it("ignores tilt inside the deadzone", () => {
      expect(shapeStick(0.1, 0.05, feel)).toEqual({ x: 0, y: 0 });
    });

    it("reaches full speed at full tilt, keeping the direction", () => {
      const s = shapeStick(1, 0, feel);
      expect(s.x).toBeCloseTo(1);
      expect(s.y).toBeCloseTo(0);
      const diagonal = shapeStick(-Math.SQRT1_2, Math.SQRT1_2, feel);
      expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
      expect(diagonal.x).toBeLessThan(0);
    });

    it("is gentler than linear part way, so small moves are fine", () => {
      expect(shapeStick(0.5, 0, feel).x).toBeLessThan(0.5);
    });

    it("differs by device: the Switch's wider deadzone ignores what the PlayStation's doesn't", () => {
      expect(shapeStick(0.17, 0, PLAYSTATION.feel).x).toBeGreaterThan(0);
      expect(shapeStick(0.17, 0, SWITCH.feel).x).toBe(0);
    });
  });

  describe("remaps", () => {
    it("rebind an action on one device only", () => {
      const schemes = withRemaps({ keyboard: { pause: ["KeyP"] }, xbox: { journal: [PAD.home] } });
      expect(actionFace(XBOX, "journal")).toBeNull();
      expect(keyAction(schemes.keyboard, "KeyP")).toBe("pause");
      expect(keyAction(schemes.keyboard, "Space")).toBeUndefined();
      expect(actionFace(schemes.xbox, "journal")?.text).toBe("Xbox");
      expect(schemes.playstation).toBe(PLAYSTATION);
      expect(DEFAULT_SCHEMES.keyboard.bindings.pause).toEqual(["Space"]); // defaults untouched
    });

    it("ignore bindings of the wrong kind and unknown actions", () => {
      const schemes = withRemaps({
        keyboard: { pause: [3] },
        xbox: { pause: ["Space"], nonsense: [1] } as never,
      });
      expect(schemes.keyboard.bindings.pause).toEqual(["Space"]);
      expect(schemes.xbox.bindings.pause).toEqual([PAD.select]);
      expect(Object.keys(schemes.xbox.bindings).every((a) => ACTIONS.includes(a as never))).toBe(
        true,
      );
    });

    it("are remembered, and junk or missing storage means none", () => {
      const storage = memoryStorage();
      saveRemaps(storage, { keyboard: { rotate: ["KeyT"] } });
      expect(loadRemaps(storage)).toEqual({ keyboard: { rotate: ["KeyT"] } });
      storage.setItem("keep-controls", "{not json");
      expect(loadRemaps(storage)).toEqual({});
      expect(loadRemaps(null)).toEqual({});
    });
  });

  describe("on screen", () => {
    it("labels follow the device in use", () => {
      const ui = createUiState();
      expect(keyText(ui, "rotate")).toBe("R");
      ui.device = "playstation";
      expect(keyText(ui, "rotate")).toBe("R1");
    });

    it("the Keys panel describes the mouse or the sticks", () => {
      const ui = createUiState();
      expect(helpLine(ui)).toContain("Space pause");
      expect(helpLine(ui)).toContain("wheel or +/- zoom");
      expect(helpLine(ui)).toMatch(/^1-3 then 1-0 build · /);
      ui.device = "switch";
      const line = helpLine(ui);
      expect(line).toContain("A place or pick (hold to paint)");
      expect(line).toContain("B close menu / drop tool");
      expect(line).toContain("X build menu");
      expect(line).toContain("left stick point");
      expect(line).toContain("d-pad a tile at a time");
      expect(line).toContain("Y sell");
      expect(line).toContain("R rotate · L rotate back");
      expect(line).toContain("− pause · + fast");
      expect(line).not.toContain("debug"); // pads have no debug menu button
    });
  });
});
