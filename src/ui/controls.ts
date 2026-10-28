// What the player's buttons do, on whatever they play with (SPEC-controllers.md). Every key and
// pad button is bound to an Action; the game only ever acts on Actions, and the HUD shows the
// face of whatever is bound on the device in use ("1" on a keyboard, △ on a PlayStation pad, X
// on a Switch pad). Each device has its own scheme: its bindings, its button faces and its feel
// (how fast a stick pans compared with held keys). Pure: no DOM.

export type Action =
  | "pause"
  | "fastForward"
  | "rotate"
  /** Turns the structure being placed anticlockwise (rotate turns it clockwise). */
  | "rotateBack"
  | "flipView"
  | "journal"
  | "cancel"
  | "sell"
  /** Sell in hand, or back to what was in hand before it. */
  | "toggleSell"
  | "buildTowers"
  | "buildUnits"
  | "buildCivic"
  | "zoomIn"
  | "zoomOut"
  | "panLeft"
  | "panRight"
  | "panUp"
  | "panDown"
  | "debugMenu"
  | "debugEnemy"
  | "debugUnit"
  | "debugSwarm"
  /**
   * A pad's click: picks what's chosen in the open build menu, else uses the tool on the tile
   * under the pointer (the mouse button does this on a keyboard).
   */
  | "place"
  /** Opens or closes the build menu on its current tab. */
  | "menu"
  /**
   * A pad's d-pad: a tile at a time (the pointer hides), or with the build menu open, its items
   * (up and down) and tabs (left and right).
   */
  | "stepLeft"
  | "stepRight"
  | "stepUp"
  | "stepDown"
  /** Step through the build tools on the open tab, and through the tabs. */
  | "prevTool"
  | "nextTool"
  | "prevTab"
  | "nextTab";

export const ACTIONS: Action[] = [
  "pause",
  "fastForward",
  "rotate",
  "rotateBack",
  "flipView",
  "journal",
  "cancel",
  "sell",
  "toggleSell",
  "buildTowers",
  "buildUnits",
  "buildCivic",
  "zoomIn",
  "zoomOut",
  "panLeft",
  "panRight",
  "panUp",
  "panDown",
  "debugMenu",
  "debugEnemy",
  "debugUnit",
  "debugSwarm",
  "place",
  "menu",
  "stepLeft",
  "stepRight",
  "stepUp",
  "stepDown",
  "prevTool",
  "nextTool",
  "prevTab",
  "nextTab",
];

/** Actions that act on a running game, so they do nothing in the map editor. */
export const GAME_ONLY_ACTIONS: Action[] = [
  "pause",
  "fastForward",
  "journal",
  "debugEnemy",
  "debugUnit",
  "debugSwarm",
  "flipView",
];

/** Actions that last while held rather than firing once (a pad's triggers zoom by how far they're pulled). */
export const HELD_ACTIONS: Action[] = [
  "panLeft",
  "panRight",
  "panUp",
  "panDown",
  "stepLeft",
  "stepRight",
  "stepUp",
  "stepDown",
];

export type Device = "keyboard" | "xbox" | "playstation" | "switch";
export type PadDevice = Exclude<Device, "keyboard">;

/** How a key or button is shown: its text (or symbol), full name, and colour if it has one. */
export interface ButtonFace {
  text: string;
  name: string;
  color?: string;
}

export interface KeyboardScheme {
  device: "keyboard";
  name: string;
  /** KeyboardEvent.code values; the first is the one shown. */
  bindings: Partial<Record<Action, string[]>>;
  feel: { panPixelsPerSecond: number };
}

/** Sticks on a pad in the standard mapping: axes 0, 1 (left) and 2, 3 (right). */
export type Stick = "left" | "right";

export interface PadFeel {
  /** Full tilt of the pan stick moves the view this fast; less tilt, slower (see curve). */
  panPixelsPerSecond: number;
  /** Full tilt of the pointer stick moves the pointer this fast across the screen. */
  cursorPixelsPerSecond: number;
  /**
   * Momentum: the pointer and the view take about this long to catch up with a stick, and
   * glide this long once it's let go. 0 follows the stick exactly.
   */
  momentumSeconds: number;
  /** Holding the d-pad (or, in the menu, the stick) steps once, then again after this long... */
  stepDelaySeconds: number;
  /** ...then a tile every this long while it's held. */
  stepRepeatSeconds: number;
  /** Tilt below this (0..1) counts as none, so a resting stick doesn't drift. */
  deadzone: number;
  /** Tilt is raised to this power past the deadzone: above 1 gives finer control near centre. */
  curve: number;
  /** A fully pulled zoom trigger zooms by this factor a second. */
  zoomPerSecond: number;
  /** Within this many pixels (or a tile, if more) of the view's edge, the pointer pushes the view. */
  edgePixels: number;
  cursorStick: Stick;
  panStick: Stick;
}

export interface PadScheme {
  device: PadDevice;
  name: string;
  /** Button indices in the standard gamepad mapping; the first is the one shown. */
  bindings: Partial<Record<Action, number[]>>;
  /** Faces by button index, in the standard mapping's positions. */
  faces: ButtonFace[];
  feel: PadFeel;
}

export type Scheme = KeyboardScheme | PadScheme;
export type Schemes = { keyboard: KeyboardScheme } & Record<PadDevice, PadScheme>;

/** Standard gamepad mapping button indices, by position (the same on every pad). */
export const PAD = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  select: 8,
  start: 9,
  leftStick: 10,
  rightStick: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  home: 16,
} as const;

export const KEYBOARD: KeyboardScheme = {
  device: "keyboard",
  name: "Keyboard and mouse",
  bindings: {
    pause: ["Space"],
    fastForward: ["KeyF"],
    rotate: ["KeyR"],
    flipView: ["KeyQ"],
    journal: ["KeyJ"],
    cancel: ["Escape"],
    sell: ["KeyX"],
    buildTowers: ["Digit1"],
    buildUnits: ["Digit2"],
    buildCivic: ["Digit3"],
    zoomIn: ["Equal", "NumpadAdd"],
    zoomOut: ["Minus", "NumpadSubtract"],
    panLeft: ["KeyA", "ArrowLeft"],
    panRight: ["KeyD", "ArrowRight"],
    panUp: ["KeyW", "ArrowUp"],
    panDown: ["KeyS", "ArrowDown"],
    debugMenu: ["Backquote"],
    debugEnemy: ["KeyE"],
    debugUnit: ["KeyU"],
    debugSwarm: ["KeyM"],
  },
  feel: { panPixelsPerSecond: 900 },
};

/**
 * The pad layout every family shares, by position; families differ in faces (and the Switch in
 * which face button is which). Laid out on a Switch pad: A place or pick, B back, Y sell (and
 * back), X the build menu, L and R rotate, the left stick points and the d-pad steps a tile (or
 * through the open menu), − pause, + fast forward, ZL and ZR zoom.
 */
const PAD_BINDINGS: PadScheme["bindings"] = {
  place: [PAD.south],
  cancel: [PAD.east],
  rotate: [PAD.rightBumper],
  rotateBack: [PAD.leftBumper],
  toggleSell: [PAD.west],
  menu: [PAD.north],
  stepUp: [PAD.up],
  stepDown: [PAD.down],
  stepLeft: [PAD.left],
  stepRight: [PAD.right],
  zoomOut: [PAD.leftTrigger],
  zoomIn: [PAD.rightTrigger],
  pause: [PAD.select],
  fastForward: [PAD.start],
};

const PAD_FEEL: PadFeel = {
  panPixelsPerSecond: 1100,
  cursorPixelsPerSecond: 1200,
  momentumSeconds: 0.1,
  stepDelaySeconds: 0.3,
  stepRepeatSeconds: 0.09,
  deadzone: 0.15,
  curve: 2,
  zoomPerSecond: 2.5,
  edgePixels: 48,
  cursorStick: "left",
  panStick: "right",
};

/**
 * The faces the families share past the four face buttons (buttons 0-3: south, east, west and
 * north on most pads; A, B, X, Y on a Switch pad) and the shoulders.
 */
function padFaces(
  button0: ButtonFace,
  button1: ButtonFace,
  button2: ButtonFace,
  button3: ButtonFace,
  shoulders: [string, string, string, string],
  select: string,
  start: string,
  home: string,
): ButtonFace[] {
  const [lb, rb, lt, rt] = shoulders;
  return [
    button0,
    button1,
    button2,
    button3,
    { text: lb, name: lb },
    { text: rb, name: rb },
    { text: lt, name: lt },
    { text: rt, name: rt },
    { text: select, name: select },
    { text: start, name: start },
    { text: "L3", name: "Left stick press" },
    { text: "R3", name: "Right stick press" },
    { text: "D↑", name: "D-pad up" },
    { text: "D↓", name: "D-pad down" },
    { text: "D←", name: "D-pad left" },
    { text: "D→", name: "D-pad right" },
    { text: home, name: home },
  ];
}

export const XBOX: PadScheme = {
  device: "xbox",
  name: "Xbox controller",
  bindings: PAD_BINDINGS,
  faces: padFaces(
    { text: "A", name: "A", color: "#5dbb4a" },
    { text: "B", name: "B", color: "#e2483d" },
    { text: "X", name: "X", color: "#3c8fe0" },
    { text: "Y", name: "Y", color: "#f2c230" },
    ["LB", "RB", "LT", "RT"],
    "View",
    "Menu",
    "Xbox",
  ),
  feel: PAD_FEEL,
};

export const PLAYSTATION: PadScheme = {
  device: "playstation",
  name: "PlayStation controller",
  bindings: PAD_BINDINGS,
  faces: padFaces(
    { text: "✕", name: "Cross", color: "#7c9ee6" },
    { text: "○", name: "Circle", color: "#e8636f" },
    { text: "□", name: "Square", color: "#d68ac5" },
    { text: "△", name: "Triangle", color: "#46c3a5" },
    ["L1", "R1", "L2", "R2"],
    "Create",
    "Options",
    "PS",
  ),
  // DualShock and DualSense sticks rest close to centre.
  feel: { ...PAD_FEEL, deadzone: 0.1 },
};

export const SWITCH: PadScheme = {
  device: "switch",
  name: "Switch controller",
  // Switch pads report their face buttons by label, not position: 0 is A (on the right), 1 B,
  // 2 X (on top) and 3 Y, as the controller test shows. So Y, not button 2, sells.
  bindings: { ...PAD_BINDINGS, toggleSell: [3], menu: [2] },
  faces: padFaces(
    { text: "A", name: "A" },
    { text: "B", name: "B" },
    { text: "X", name: "X" },
    { text: "Y", name: "Y" },
    ["L", "R", "ZL", "ZR"],
    "−",
    "+",
    "Home",
  ),
  // Switch sticks are small with a short throw: a wider deadzone and a gentler curve.
  feel: { ...PAD_FEEL, deadzone: 0.2, curve: 1.6 },
};

export const DEFAULT_SCHEMES: Schemes = {
  keyboard: KEYBOARD,
  xbox: XBOX,
  playstation: PLAYSTATION,
  switch: SWITCH,
};

/** Which family a pad is, from its Gamepad.id (USB vendor ids, then names); unknown: Xbox. */
export function padDevice(id: string): PadDevice {
  const lower = id.toLowerCase();
  if (/054c|playstation|dualshock|dualsense/.test(lower)) return "playstation";
  if (/057e|nintendo|switch|pro controller|joy-con/.test(lower)) return "switch";
  return "xbox";
}

/** The action a key (KeyboardEvent.code) is bound to, if any. */
export function keyAction(scheme: KeyboardScheme, code: string): Action | undefined {
  return ACTIONS.find((a) => scheme.bindings[a]?.includes(code));
}

/** The actions a pad button (standard mapping index) is bound to. */
export function buttonActions(scheme: PadScheme, button: number): Action[] {
  return ACTIONS.filter((a) => scheme.bindings[a]?.includes(button));
}

/** How a key is shown: Digit1 as "1", KeyX as "X", Escape as "Esc". */
export function keyFace(code: string): ButtonFace {
  const named: Record<string, string> = {
    Space: "Space",
    Escape: "Esc",
    Backquote: "`",
    Equal: "+",
    Minus: "-",
    NumpadAdd: "+",
    NumpadSubtract: "-",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    BracketLeft: "[",
    BracketRight: "]",
  };
  const text = named[code] ?? code.replace(/^(Key|Digit|Numpad)/, "");
  return { text, name: text };
}

/** How the button bound to an action is shown on a device, or null if nothing is bound. */
export function actionFace(scheme: Scheme, action: Action): ButtonFace | null {
  if (scheme.device === "keyboard") {
    const code = scheme.bindings[action]?.[0];
    return code === undefined ? null : keyFace(code);
  }
  const button = (scheme as PadScheme).bindings[action]?.[0];
  return button === undefined
    ? null
    : (scheme.faces[button] ?? { text: `#${button}`, name: `Button ${button}` });
}

/**
 * A stick's tilt with the deadzone taken out and the curve applied, keeping its direction:
 * nothing inside the deadzone, then 0..1 from its edge to full tilt.
 */
export function shapeStick(x: number, y: number, feel: PadFeel): { x: number; y: number } {
  const tilt = Math.hypot(x, y);
  if (tilt <= feel.deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (tilt - feel.deadzone) / (1 - feel.deadzone)) ** feel.curve;
  return { x: (x / tilt) * scaled, y: (y / tilt) * scaled };
}

/** A player's own bindings over a device's defaults, action by action. */
export type Remaps = Partial<Record<Device, Partial<Record<Action, (string | number)[]>>>>;

/** The default schemes with a player's remaps laid over them. */
export function withRemaps(remaps: Remaps, base: Schemes = DEFAULT_SCHEMES): Schemes {
  const schemes = { ...base };
  for (const device of Object.keys(base) as Device[]) {
    const own = remaps[device];
    if (!own) continue;
    const bindings: Record<string, (string | number)[]> = { ...base[device].bindings };
    for (const action of ACTIONS) {
      const bound = own[action];
      // Keys are codes (strings), pad buttons indices: anything else is ignored.
      const wanted = device === "keyboard" ? "string" : "number";
      if (Array.isArray(bound) && bound.every((b) => typeof b === wanted)) bindings[action] = bound;
    }
    schemes[device] = { ...base[device], bindings } as never;
  }
  return schemes;
}

const KEY = "keep-controls";

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** The player's saved remaps, or none if missing or unreadable (see withRemaps). */
export function loadRemaps(storage: Storage | null): Remaps {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? "null") as unknown;
    return saved && typeof saved === "object" ? (saved as Remaps) : {};
  } catch {
    return {};
  }
}

export function saveRemaps(storage: Storage | null, remaps: Remaps): void {
  try {
    storage?.setItem(KEY, JSON.stringify(remaps));
  } catch {
    // Not remembered this time; harmless.
  }
}
