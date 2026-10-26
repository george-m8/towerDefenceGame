// The sun slider (Debug menu): sets the time of day that shadows are drawn for, from sunrise to
// sunset, while it's shown over the map. Only the drawing changes; the game doesn't know.
import { DEFAULT_SUN } from "../render/sun";
import type { UiState } from "./state";

/** Shows or hides the slider. Hiding it puts the sun back where it was. */
export function toggleSun(ui: UiState) {
  ui.showSun = !ui.showSun;
  if (!ui.showSun) ui.sun = DEFAULT_SUN;
}

/** The slider's label: the time of day, 0 (sunrise) to 1 (sunset). */
export function sunLabel(sun: number): string {
  return `Sun ${sun.toFixed(2)}`;
}

export function createSunSlider(root: HTMLElement, ui: UiState) {
  root.innerHTML = `
    <label class="slider"><span data-field="sun"></span><input type="range" min="0" max="1" step="0.01" title="Sunrise to sunset" /></label>
  `;
  const label = root.querySelector<HTMLElement>('[data-field="sun"]')!;
  const input = root.querySelector<HTMLInputElement>("input")!;
  /** Shown while it's switched on, at the sun's time of day. */
  const sync = () => {
    root.hidden = !ui.showSun;
    input.value = String(ui.sun);
    label.textContent = sunLabel(ui.sun);
  };
  input.addEventListener("input", () => {
    ui.sun = Number(input.value);
    sync();
  });
  // Hand the arrow keys back to the map once the slider is let go.
  input.addEventListener("change", () => input.blur());
  sync();
  return { sync };
}
