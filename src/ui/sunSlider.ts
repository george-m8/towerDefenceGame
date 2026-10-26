// The sun sliders (Debug menu): where the sun is across the sky, and how high its arc rises,
// while they're shown over the map. Only the drawing changes; the game doesn't know.
import { DEFAULT_SUN, type Sun } from "../render/sun";
import { SUN } from "../render/palette";
import type { UiState } from "./state";

/** Shows or hides the sliders. Hiding them puts the sun back where it was. */
export function toggleSun(ui: UiState) {
  ui.showSun = !ui.showSun;
  if (!ui.showSun) ui.sun = { ...DEFAULT_SUN };
}

/** The Across slider's label: 0 at the left horizon, 1 at the right. */
export function acrossLabel(across: number): string {
  return `Across ${across.toFixed(2)}`;
}

/** The Arc slider's label: how far the sun's path tilts up from the horizon. */
export function arcLabel(arc: number): string {
  return `Arc ${Math.round(arc)}°`;
}

export function createSunSlider(root: HTMLElement, ui: UiState) {
  root.innerHTML = `
    <label class="slider"><span data-label="across"></span><input type="range" min="0" max="1" step="0.01" data-sun="across" title="Where the sun is, from the left horizon to the right" /></label>
    <label class="slider"><span data-label="arc"></span><input type="range" min="${SUN.arcMin}" max="${SUN.arcMax}" step="1" data-sun="arc" title="How the sun's path leans: up to 90° over the top of the sky (90°: straight overhead), past it over the bottom, so shadows fall behind" /></label>
  `;
  const inputs = [...root.querySelectorAll<HTMLInputElement>("[data-sun]")];
  const label = (key: keyof Sun) => root.querySelector<HTMLElement>(`[data-label="${key}"]`)!;
  /** Shown while switched on, at where the sun is. */
  const sync = () => {
    root.hidden = !ui.showSun;
    for (const input of inputs) input.value = String(ui.sun[input.dataset.sun as keyof Sun]);
    label("across").textContent = acrossLabel(ui.sun.across);
    label("arc").textContent = arcLabel(ui.sun.arc);
  };
  for (const input of inputs) {
    input.addEventListener("input", () => {
      ui.sun = { ...ui.sun, [input.dataset.sun as keyof Sun]: Number(input.value) };
      sync();
    });
    // Hand the arrow keys back to the map once the slider is let go.
    input.addEventListener("change", () => input.blur());
  }
  sync();
  return { sync };
}
