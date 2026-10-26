// The map editor's own keys (SPEC-map-editor.md, "Keys and tools"). The keys it shares with the
// game (pan, zoom, 1-3, R, X, Esc) are the game's own handler (ui/input.ts); these are the ones
// the game doesn't use, so none of the game's keys means something different here.

export type EditorKeyAction =
  | { type: "mapTab" }
  | { type: "smaller" }
  | { type: "bigger" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "play" };

/** What a key press does in the editor, if anything (KeyboardEvent fields). */
export function editorKey(e: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): EditorKeyAction | null {
  const command = e.ctrlKey || e.metaKey;
  if (command && e.code === "KeyZ") return { type: e.shiftKey ? "redo" : "undo" };
  if (command && e.code === "KeyY") return { type: "redo" };
  if (command) return null; // leave the browser's own shortcuts alone
  if (e.code === "Digit4") return { type: "mapTab" };
  if (e.code === "BracketLeft") return { type: "smaller" };
  if (e.code === "BracketRight") return { type: "bigger" };
  if (e.code === "KeyP") return { type: "play" };
  return null;
}
