import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEMES, PAD, SWITCH, XBOX } from "../../src/ui/controls";
import {
  createGamepads,
  createStepState,
  glide,
  readPad,
  stepStick,
  type PadSnapshot,
} from "../../src/ui/gamepad";
import { noPadHint, padTestCells } from "../../src/ui/padTest";

/** A standard-mapping pad with the given buttons held (index or [index, value]) and axes. */
function pad(
  held: (number | [number, number])[] = [],
  axes: number[] = [0, 0, 0, 0],
  id = "Xbox Wireless Controller",
): PadSnapshot {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const h of held) {
    const [i, value] = Array.isArray(h) ? h : [h, 1];
    buttons[i] = { pressed: value >= 1, value };
  }
  return { id, mapping: "standard", buttons, axes };
}

describe("readPad", () => {
  it("fires an action once, when its button goes down", () => {
    const first = readPad(XBOX, pad([PAD.north]), []);
    expect(first.pressed).toEqual(["menu"]);
    const down: boolean[] = [];
    down[PAD.north] = true;
    expect(readPad(XBOX, pad([PAD.north]), down).pressed).toEqual([]);
  });

  it("reads a Switch pad's buttons by label: A (0) places, B (1) cancels", () => {
    expect(readPad(SWITCH, pad([0]), []).pressed).toEqual(["place"]);
    expect(readPad(SWITCH, pad([1]), []).pressed).toEqual(["cancel"]);
  });

  it("reads the d-pad apart from the pointer stick, never as a press", () => {
    const frame = readPad(SWITCH, pad([PAD.left, PAD.down]), []);
    expect(frame.dpad).toEqual({ x: -1, y: 1 });
    expect(frame.cursor).toEqual({ x: 0, y: 0 });
    expect(frame.pressed).toEqual([]);
    const stick = readPad(SWITCH, pad([], [0.9, 0, 0, 0]), []);
    expect(stick.cursor.x).toBeGreaterThan(0.5);
    expect(stick.dpad).toEqual({ x: 0, y: 0 });
  });

  it("turns with L and R, and pauses and fast-forwards with − and +", () => {
    expect(readPad(SWITCH, pad([PAD.leftBumper]), []).pressed).toEqual(["rotateBack"]);
    expect(readPad(SWITCH, pad([PAD.rightBumper]), []).pressed).toEqual(["rotate"]);
    expect(readPad(SWITCH, pad([PAD.select]), []).pressed).toEqual(["pause"]);
    expect(readPad(SWITCH, pad([PAD.start]), []).pressed).toEqual(["fastForward"]);
  });

  it("zooms by how far the triggers are pulled, never as a press", () => {
    const frame = readPad(XBOX, pad([[PAD.rightTrigger, 0.6]]), []);
    expect(frame.zoom).toBeCloseTo(0.6);
    expect(frame.pressed).toEqual([]);
    expect(readPad(XBOX, pad([[PAD.leftTrigger, 1]]), []).zoom).toBe(-1);
  });

  it("points with the left stick and pans with the right, shaped by the feel", () => {
    const frame = readPad(XBOX, pad([], [1, 0, 0, -1]), []);
    expect(frame.cursor.x).toBeCloseTo(1);
    expect(frame.pan.y).toBeCloseTo(-1);
    expect(frame.active).toBe(true);
    const lefty = {
      ...XBOX,
      feel: { ...XBOX.feel, cursorStick: "right" as const, panStick: "left" as const },
    };
    expect(readPad(lefty, pad([], [1, 0, 0, 0]), []).pan.x).toBeCloseTo(1);
  });

  it("isn't active while it rests, so a resting pad doesn't take over the HUD", () => {
    expect(readPad(XBOX, pad([], [0.05, -0.08, 0.02, 0]), []).active).toBe(false);
  });
});

describe("createGamepads", () => {
  it("uses each pad's own family and skips pads without the standard mapping", () => {
    const pads: (PadSnapshot | null)[] = [
      pad([PAD.north], undefined, "DualSense Wireless Controller"),
      null,
      { ...pad([PAD.north]), mapping: "" },
    ];
    const frames = createGamepads(
      () => DEFAULT_SCHEMES,
      () => pads,
    ).poll();
    expect(frames).toHaveLength(1);
    expect(frames[0].scheme.device).toBe("playstation");
    expect(frames[0].pressed).toEqual(["menu"]);
  });

  it("remembers what was down between frames", () => {
    const pads = [pad([PAD.west])];
    const gamepads = createGamepads(
      () => DEFAULT_SCHEMES,
      () => pads,
    );
    expect(gamepads.poll()[0].pressed).toEqual(["toggleSell"]);
    expect(gamepads.poll()[0].pressed).toEqual([]);
    pads[0] = pad();
    gamepads.poll();
    pads[0] = pad([PAD.west]);
    expect(gamepads.poll()[0].pressed).toEqual(["toggleSell"]);
  });
});

describe("the controller test", () => {
  it("shows a Switch pad's own faces, lit while held, with what each does", () => {
    const cells = padTestCells(SWITCH, pad([0, [PAD.rightTrigger, 0.3]]));
    expect(cells[0]).toMatchObject({ text: "A", down: true, actions: ["place"] });
    expect(cells[1]).toMatchObject({ text: "B", down: false, actions: ["cancel"] });
    expect(cells[2].text).toBe("X");
    expect(cells[PAD.rightTrigger]).toMatchObject({ text: "ZR", down: false, value: 0.3 });
    expect(cells[PAD.home]).toMatchObject({ text: "Home", actions: [] });
  });

  it("draws a Switch pad's A on the right and B at the bottom, where they are", () => {
    const [a, b] = padTestCells(SWITCH, pad());
    expect([a.row, a.column]).toEqual([3, 7]);
    expect([b.row, b.column]).toEqual([4, 6]);
  });

  it("puts every button in its own place in the picture", () => {
    const places = padTestCells(SWITCH, pad()).map((c) => `${c.row},${c.column}`);
    expect(new Set(places).size).toBe(17);
  });
});

describe("noPadHint", () => {
  it("says pads need a secure page, or a button press after each reload", () => {
    expect(noPadHint(false, "")).toContain("https or localhost");
    expect(noPadHint(true, "")).toContain("press a button with this tab focused");
    expect(noPadHint(true, "disconnected Pro Controller")).toContain("last: disconnected");
  });
});

describe("stepStick", () => {
  const feel = { stepDelaySeconds: 0.3, stepRepeatSeconds: 0.1 };

  it("steps one tile as soon as the stick is pushed, and no more on a quick flick", () => {
    const state = createStepState();
    expect(stepStick(state, { x: 1, y: 0 }, 0.016, feel)).toEqual({ x: 1, y: 0 });
    expect(stepStick(state, { x: 1, y: 0 }, 0.1, feel)).toBeNull();
    expect(stepStick(state, { x: 0, y: 0 }, 0.016, feel)).toBeNull();
    expect(stepStick(state, { x: 0, y: -0.9 }, 0.016, feel)).toEqual({ x: 0, y: -1 });
  });

  it("repeats while held: after the delay, then every repeat", () => {
    const state = createStepState();
    const held = { x: -0.8, y: 0 };
    let steps = stepStick(state, held, 0, feel) ? 1 : 0;
    for (let t = 0; t < 60; t++) if (stepStick(state, held, 0.01, feel)) steps++; // 0.6s
    expect(steps).toBe(1 + 1 + 3); // the push, at 0.3s, then 0.4, 0.5, 0.6
  });

  it("ignores a light tilt, and steps diagonally when pushed that way", () => {
    expect(stepStick(createStepState(), { x: 0.3, y: 0 }, 0.016, feel)).toBeNull();
    expect(stepStick(createStepState(), { x: 0.7, y: 0.7 }, 0.016, feel)).toEqual({ x: 1, y: 1 });
  });
});

describe("glide", () => {
  it("catches up with the stick over the momentum time, not at once", () => {
    let v = { x: 0, y: 0 };
    v = glide(v, { x: 1, y: 0 }, 0.016, 0.1);
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(0.3);
    for (let i = 0; i < 60; i++) v = glide(v, { x: 1, y: 0 }, 0.016, 0.1);
    expect(v.x).toBeCloseTo(1, 2);
  });

  it("glides on after the stick is let go, then stops dead", () => {
    let v = glide({ x: 1, y: -1 }, { x: 0, y: 0 }, 0.016, 0.1);
    expect(v.x).toBeGreaterThan(0.5);
    expect(v.y).toBeLessThan(-0.5);
    for (let i = 0; i < 60; i++) v = glide(v, { x: 0, y: 0 }, 0.016, 0.1);
    expect(v).toEqual({ x: 0, y: 0 });
  });

  it("follows the stick exactly with no momentum", () => {
    expect(glide({ x: 0, y: 0 }, { x: 0.4, y: -1 }, 0.016, 0)).toEqual({ x: 0.4, y: -1 });
  });
});
