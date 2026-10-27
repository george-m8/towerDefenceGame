// The day and night clock (Debug menu): a Time slider and a Play button, while it's shown over
// the map. Moving the clock moves the sun and the light. Only the drawing changes.
import { clockLabel, sunAt, wrapHour } from "../render/dayNight";
import { DAY_NIGHT } from "../render/palette";
import { DEFAULT_SUN } from "../render/sun";
import type { UiState } from "./state";

/** Turns the clock on (at the start hour, stopped) or off (the sun back to the default). */
export function toggleClock(ui: UiState) {
  if (ui.clock) {
    ui.clock = null;
    ui.sun = { ...DEFAULT_SUN };
  } else {
    ui.clock = { hour: DAY_NIGHT.startHour, playing: false };
    ui.sun = sunAt(DAY_NIGHT.startHour);
  }
}

/** Sets the clock, and the sun with it. */
export function setHour(ui: UiState, hour: number) {
  if (!ui.clock) return;
  ui.clock.hour = wrapHour(hour);
  ui.sun = sunAt(ui.clock.hour);
}

/** Runs a playing clock on by some seconds of real time (a whole day in DAY_NIGHT.secondsPerDay). */
export function advanceClock(ui: UiState, seconds: number) {
  if (ui.clock?.playing) setHour(ui, ui.clock.hour + (seconds * 24) / DAY_NIGHT.secondsPerDay);
}

/** `onChange` hears when the clock is set by hand, so other controls can follow the sun. */
export function createClockControls(root: HTMLElement, ui: UiState, onChange: () => void) {
  root.innerHTML = `
    <label class="slider"><span data-label="time"></span><input type="range" min="0" max="24" step="0.25" title="The time of day" /></label>
    <button class="button" data-action="play"></button>
  `;
  const label = root.querySelector<HTMLElement>('[data-label="time"]')!;
  const input = root.querySelector<HTMLInputElement>("input")!;
  const play = root.querySelector<HTMLButtonElement>('[data-action="play"]')!;
  /** Shown while the clock is on, at its time. */
  const sync = () => {
    root.hidden = !ui.clock;
    if (!ui.clock) return;
    input.value = String(ui.clock.hour);
    label.textContent = clockLabel(ui.clock.hour);
    play.textContent = ui.clock.playing ? "Pause" : "Play";
  };
  input.addEventListener("input", () => {
    setHour(ui, Number(input.value));
    sync();
    onChange();
  });
  // Hand the arrow keys back to the map once the slider is let go.
  input.addEventListener("change", () => input.blur());
  play.addEventListener("click", () => {
    if (ui.clock) ui.clock.playing = !ui.clock.playing;
    play.blur(); // so Space keeps meaning pause
    sync();
  });
  sync();
  return { sync };
}
