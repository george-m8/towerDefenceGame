// Dev-only page (?soundtest) to hear and tune every sound effect without playing a game.
import { playSoundEffect } from "../audio/cues";
import type { AudioEngine } from "../audio/engine";
import { SOUNDS, type CueKind } from "../audio/sounds";
import { liveVoiceCount } from "../audio/synth";

export function showSoundTest(root: HTMLElement, engine: AudioEngine) {
  const kinds = Object.keys(SOUNDS) as CueKind[];
  root.innerHTML = `
    <div class="window intro-window">
      <header class="title-bar"><span class="title">Sound test</span></header>
      <div class="sound-test">
        <p>Click to play. Tune them in <code>src/audio/sounds.ts</code>.</p>
        <div class="sound-test-buttons">
          ${kinds.map((kind) => `<button class="button" data-sound="${kind}">${kind}</button>`).join("")}
        </div>
        <p>Live voices: <span data-field="voices">0</span></p>
      </div>
    </div>
  `;
  root.style.cursor = "default";
  root.hidden = false;
  root.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-sound]");
    if (!button) return;
    engine.unlock();
    playSoundEffect(engine, button.dataset.sound as CueKind);
  });
  const voices = root.querySelector<HTMLElement>('[data-field="voices"]')!;
  setInterval(() => (voices.textContent = String(liveVoiceCount())), 100);
}
