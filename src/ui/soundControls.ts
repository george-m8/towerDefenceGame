// Sound on/off, the song playing (with Skip), the two volume sliders and the music pack, in
// the side panel.
import { BUILT_IN } from "../audio/playlist";
import type { AudioSettings } from "../audio/settings";

type Volume = "music" | "sfx";

/**
 * `packs` are the music packs found; `shownPack` is the one playing (null: built-in). The
 * Songs choice only appears when there is a pack to choose.
 */
export function createSoundControls(
  root: HTMLElement,
  initial: AudioSettings,
  packs: { names: string[]; shownPack: string | null },
  onChange: (settings: AudioSettings) => void,
  onSkip: () => void,
) {
  root.innerHTML = `
    <h2 class="section">Sound</h2>
    <button class="button sound-toggle" data-action="mute"></button>
    <div class="now-playing" data-field="now-playing" hidden>
      <span>Now playing</span>
      <button class="button" data-action="skip">Skip</button>
      <span class="song" data-field="song"></span>
    </div>
    <label class="slider"><span>Music</span><input type="range" min="0" max="100" data-volume="music" /></label>
    <label class="slider"><span>Effects</span><input type="range" min="0" max="100" data-volume="sfx" /></label>
    <label class="slider" data-field="pack-row"><span>Songs</span><select data-field="pack"></select></label>
  `;
  let settings = { ...initial };
  const toggle = root.querySelector<HTMLButtonElement>('[data-action="mute"]')!;
  const sliders = [...root.querySelectorAll<HTMLInputElement>("[data-volume]")];
  const pack = root.querySelector<HTMLSelectElement>('[data-field="pack"]')!;
  const nowPlaying = root.querySelector<HTMLElement>('[data-field="now-playing"]')!;
  const song = root.querySelector<HTMLElement>('[data-field="song"]')!;
  const skip = root.querySelector<HTMLButtonElement>('[data-action="skip"]')!;
  root.querySelector<HTMLElement>('[data-field="pack-row"]')!.hidden = packs.names.length === 0;
  pack.replaceChildren(
    ...[...packs.names, BUILT_IN].map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name === BUILT_IN ? "Built-in" : name;
      return option;
    }),
  );
  pack.value = packs.shownPack ?? BUILT_IN;

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
  skip.addEventListener("click", () => {
    skip.blur(); // so Space keeps meaning pause
    onSkip();
  });
  pack.addEventListener("change", () => {
    pack.blur(); // arrow keys go back to panning the map
    change({ ...settings, pack: pack.value });
  });
  show();

  return {
    /** Shows the song playing (null: nothing playing). */
    showSong(title: string | null) {
      nowPlaying.hidden = title === null;
      song.textContent = title ?? "";
      song.title = title ?? ""; // the whole name on hover when it's cut short
    },
  };
}
