// Shows the right button for the device in use (SPEC-controllers.md). Markup names an action, not
// a key: <kbd data-action="rotate"></kbd> shows "R" on a keyboard, □ on a PlayStation pad and Y on
// a Switch pad, and hides when the device has nothing bound to it.
import { actionFace, type Action } from "./controls";
import type { UiState } from "./state";

/** The text for an action on the device in use, e.g. "Space" or "Menu", or "" if unbound. */
export function keyText(ui: UiState, action: Action): string {
  return actionFace(ui.schemes[ui.device], action)?.text ?? "";
}

/** Keeps the <kbd data-action> in `root` showing the device in use; cheap to call each frame. */
export function createKeyLabels(root: ParentNode) {
  let shown: { device: UiState["device"]; schemes: UiState["schemes"] } | null = null;
  return {
    /** Relabels when the device (or its bindings) changed, or `force` after new markup. */
    sync(ui: UiState, force = false) {
      if (!force && shown?.device === ui.device && shown.schemes === ui.schemes) return;
      shown = { device: ui.device, schemes: ui.schemes };
      for (const kbd of root.querySelectorAll<HTMLElement>("kbd[data-action]")) {
        const face = actionFace(ui.schemes[ui.device], kbd.dataset.action as Action);
        kbd.textContent = face?.text ?? "";
        kbd.title = face?.name ?? "";
        kbd.style.color = face?.color ?? "";
        kbd.hidden = face === null;
      }
    },
  };
}
