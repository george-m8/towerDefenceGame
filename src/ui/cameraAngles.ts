// The camera angle sliders (Debug menu), for the 3D view: Turn spins the view round the map,
// Tilt leans it from low over the ground up to straight down. Reset goes back to the default
// (from the south, 75° up, like the flat map). Only the drawing changes; the game doesn't know.
import { ISO, type Camera } from "./camera";
import type { UiState } from "./state";

const DEGREES = 180 / Math.PI;

/** The Turn slider's label: which way the camera looks from, as a compass point's degrees. */
export function turnLabel(yaw: number): string {
  return `Turn ${Math.round(yaw * DEGREES)}°`;
}

/** The Tilt slider's label: how far above the horizon the camera looks down from. */
export function tiltLabel(pitch: number): string {
  return `Tilt ${Math.round(pitch * DEGREES)}°`;
}

/** Puts the camera back to the default angles (see ISO). */
export function resetAngles(cam: Camera) {
  cam.yaw = ISO.yaw;
  cam.pitch = ISO.pitch;
}

export function createCameraAngles(root: HTMLElement, ui: UiState) {
  const minTilt = Math.round(ISO.minPitch * DEGREES);
  root.innerHTML = `
    <label class="slider"><span data-label="yaw"></span><input type="range" min="-180" max="180" step="1" data-angle="yaw" title="Which way the camera looks at the map from: 0° from the south, 45° the south-east" /></label>
    <label class="slider"><span data-label="pitch"></span><input type="range" min="${minTilt}" max="90" step="1" data-angle="pitch" title="How high the camera looks down from: 90° straight down, like the flat map" /></label>
    <button class="button" data-action="reset-angles" title="Back to the default: from the south, 75° up">Reset</button>
  `;
  const inputs = [...root.querySelectorAll<HTMLInputElement>("[data-angle]")];
  const label = (key: "yaw" | "pitch") => root.querySelector<HTMLElement>(`[data-label="${key}"]`)!;
  /** Shown while switched on, at the camera's angles. */
  const sync = () => {
    root.hidden = !ui.showCameraAngles;
    for (const input of inputs) {
      input.value = String(Math.round(ui.camera[input.dataset.angle as "yaw" | "pitch"] * DEGREES));
    }
    label("yaw").textContent = turnLabel(ui.camera.yaw);
    label("pitch").textContent = tiltLabel(ui.camera.pitch);
  };
  for (const input of inputs) {
    input.addEventListener("input", () => {
      ui.camera[input.dataset.angle as "yaw" | "pitch"] = Number(input.value) / DEGREES;
      sync();
    });
    // Hand the arrow keys back to the map once the slider is let go.
    input.addEventListener("change", () => input.blur());
  }
  root
    .querySelector<HTMLButtonElement>('[data-action="reset-angles"]')!
    .addEventListener("click", (e) => {
      resetAngles(ui.camera);
      sync();
      (e.currentTarget as HTMLElement).blur();
    });
  sync();
  return { sync };
}
