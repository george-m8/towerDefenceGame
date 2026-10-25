// Sound on/off and the two volume sliders in the side panel.
import type { AudioSettings } from "../audio/settings";

type Volume = "music" | "sfx";

export function createSoundControls(
  root: HTMLElement,
  initial: AudioSettings,
  onChange: (settings: AudioSettings) => void,
) {
  root.innerHTML = `
    <h2 class="section">Sound</h2>
    <button class="button sound-toggle" data-action="mute"></button>
    <label class="slider"><span>Music</span><input type="range" min="0" max="100" data-volume="music" /></label>
    <label class="slider"><span>Effects</span><input type="range" min="0" max="100" data-volume="sfx" /></label>
  `;
  let settings = { ...initial };
  const toggle = root.querySelector<HTMLButtonElement>('[data-action="mute"]')!;
  const sliders = [...root.querySelectorAll<HTMLInputElement>("[data-volume]")];

  const show = () => {
    toggle.textContent = settings.muted ? "Sound: off" : "Sound: on";
    toggle.setAttribute("aria-pressed", String(!settings.muted));
    for (const slider of sliders) {
      slider.value = String(Math.round(settings[slider.dataset.volume as Volume] * 100));
      slider.disabled = settings.muted;
    }
  };
  const change = (next: AudioSettings) => {
    settings = next;
    show();
    onChange(settings);
  };

  toggle.addEventListener("click", () => {
    toggle.blur(); // so Space keeps meaning pause
    change({ ...settings, muted: !settings.muted });
  });
  for (const slider of sliders) {
    slider.addEventListener("input", () => {
      change({ ...settings, [slider.dataset.volume as Volume]: Number(slider.value) / 100 });
    });
    // Hand the arrow keys back to the map once the slider is let go.
    slider.addEventListener("change", () => slider.blur());
  }
  show();
}
