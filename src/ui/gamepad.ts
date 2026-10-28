// Game pads (SPEC-controllers.md): read once a frame, since the Gamepad API has no events for
// buttons. Each pad is matched to its family's scheme by its id, and turned into a PadFrame: the
// actions pressed since last frame, how far the zoom triggers are pulled, and the two sticks
// shaped by the scheme's feel. input.ts decides what they do.
import {
  HELD_ACTIONS,
  buttonActions,
  padDevice,
  shapeStick,
  type Action,
  type PadFeel,
  type PadScheme,
  type Schemes,
} from "./controls";

/** The parts of a Gamepad read here, so tests can pass plain objects. */
export interface PadSnapshot {
  id: string;
  mapping: string;
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
}

export interface PadFrame {
  scheme: PadScheme;
  /** Actions whose button went down this frame. */
  pressed: Action[];
  /** Actions whose button is down now (held ones, such as place while painting). */
  held: Action[];
  /** Zoom trigger pull: in minus out, -1..1. */
  zoom: number;
  /** Shaped stick tilts, -1..1 each way (y down). */
  cursor: { x: number; y: number };
  /** The d-pad held: -1, 0 or 1 each way. */
  dpad: { x: number; y: number };
  pan: { x: number; y: number };
  /** The player touched this pad this frame: it becomes the device the HUD shows. */
  active: boolean;
}

/** A trigger pulled at least this far counts as pressed. */
const TRIGGER_PRESS = 0.5;
/** On a pad, zoom follows how far its buttons are pulled, so it never steps on a press. */
const SMOOTH: Action[] = [...HELD_ACTIONS, "zoomIn", "zoomOut"];

function stick(pad: PadSnapshot, which: "left" | "right"): [number, number] {
  const i = which === "left" ? 0 : 2;
  return [pad.axes[i] ?? 0, pad.axes[i + 1] ?? 0];
}

/** Which buttons are down: a button's own pressed flag, or a trigger pulled past halfway. */
export function buttonsDown(pad: PadSnapshot): boolean[] {
  return pad.buttons.map((b) => b.pressed || b.value >= TRIGGER_PRESS);
}

/** One pad's frame, given which of its buttons were down last frame. */
export function readPad(
  scheme: PadScheme,
  pad: PadSnapshot,
  wasDown: readonly boolean[],
): PadFrame {
  const down = buttonsDown(pad);
  const pressed: Action[] = [];
  const held: Action[] = [];
  down.forEach((isDown, i) => {
    if (!isDown) return;
    const actions = buttonActions(scheme, i);
    held.push(...actions);
    if (!wasDown[i]) pressed.push(...actions.filter((a) => !SMOOTH.includes(a)));
  });
  const pull = (action: Action) =>
    Math.max(0, ...(scheme.bindings[action] ?? []).map((b) => pad.buttons[b]?.value ?? 0));
  const zoom = pull("zoomIn") - pull("zoomOut");
  const [cx, cy] = stick(pad, scheme.feel.cursorStick);
  const [px, py] = stick(pad, scheme.feel.panStick);
  const way = (minus: Action, plus: Action) =>
    (held.includes(plus) ? 1 : 0) - (held.includes(minus) ? 1 : 0);
  const dpad = { x: way("stepLeft", "stepRight"), y: way("stepUp", "stepDown") };
  const cursor = shapeStick(cx, cy, scheme.feel);
  const pan = shapeStick(px, py, scheme.feel);
  const active =
    down.some((d) => d) || cursor.x !== 0 || cursor.y !== 0 || pan.x !== 0 || pan.y !== 0;
  return { scheme, pressed, held, zoom, cursor, dpad, pan, active };
}

/**
 * Reads every connected pad each frame. `pads` is navigator.getGamepads, or a stand-in in tests.
 * Pads without the standard mapping are skipped: their buttons could be anywhere.
 */
export function createGamepads(
  schemes: () => Schemes,
  pads: () => readonly (PadSnapshot | null)[] = () =>
    typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [],
) {
  const lastDown = new Map<number, boolean[]>();
  return {
    poll(): PadFrame[] {
      const frames: PadFrame[] = [];
      pads().forEach((pad, index) => {
        if (!pad || pad.mapping !== "standard") return lastDown.delete(index);
        const scheme = schemes()[padDevice(pad.id)];
        frames.push(readPad(scheme, pad, lastDown.get(index) ?? []));
        lastDown.set(index, buttonsDown(pad));
      });
      return frames;
    },
  };
}

/** A stick held over goes this far (shaped, 0..1) before it counts as pointing that way. */
const STEP_TILT = 0.4;

/** Where a stepping stick is: the way it points (-1, 0, 1 each) and how long until it steps again. */
export interface StepState {
  x: number;
  y: number;
  wait: number;
}

export function createStepState(): StepState {
  return { x: 0, y: 0, wait: 0 };
}

/**
 * Steps a pointer a tile at a time from a (shaped) stick: one step as soon as it's pushed over,
 * another after the feel's delay if it's still held, then one each repeat. Diagonals step both
 * ways. Returns the step to take this frame, or null.
 */
export function stepStick(
  state: StepState,
  stick: { x: number; y: number },
  seconds: number,
  feel: Pick<PadFeel, "stepDelaySeconds" | "stepRepeatSeconds">,
): { x: number; y: number } | null {
  const way = (v: number) => (Math.abs(v) >= STEP_TILT ? Math.sign(v) : 0);
  const x = way(stick.x);
  const y = way(stick.y);
  if (x === 0 && y === 0) {
    Object.assign(state, createStepState());
    return null;
  }
  if (x !== state.x || y !== state.y) {
    Object.assign(state, { x, y, wait: feel.stepDelaySeconds });
    return { x, y };
  }
  state.wait -= seconds;
  if (state.wait > 0) return null;
  state.wait += feel.stepRepeatSeconds;
  return { x, y };
}

/** Below this (in stick units, 0..1) a gliding velocity has stopped. */
const STILL = 0.01;

/**
 * Momentum for a stick: a velocity (-1..1 each way, like the stick) that eases towards where the
 * stick is, taking about `momentumSeconds` to catch up, so the pointer and the view speed up and
 * glide to a stop rather than jumping. Returns the new velocity.
 */
export function glide(
  velocity: { x: number; y: number },
  stick: { x: number; y: number },
  seconds: number,
  momentumSeconds: number,
): { x: number; y: number } {
  const t = momentumSeconds > 0 ? 1 - Math.exp(-seconds / momentumSeconds) : 1;
  const ease = (v: number, to: number) => {
    const next = v + (to - v) * t;
    return Math.abs(next) < STILL && to === 0 ? 0 : next;
  };
  return { x: ease(velocity.x, stick.x), y: ease(velocity.y, stick.y) };
}
