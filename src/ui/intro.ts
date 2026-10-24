// The title splash shown before the start screen: name, a random tagline, any key to go on.

export const TAGLINES = ["Build and fight with friends", "Keep it together", "Keep on trucking"];

/** One tagline at random. `random` is injectable so tests can pick a specific one. */
export function pickTagline(random: () => number = Math.random): string {
  return TAGLINES[Math.min(TAGLINES.length - 1, Math.floor(random() * TAGLINES.length))];
}

/** Shows the intro in `root` until the player clicks or presses a key, then calls `onContinue`. */
export function showIntro(root: HTMLElement, onContinue: () => void) {
  root.innerHTML = `
    <div class="window intro-window" role="dialog" aria-labelledby="intro-title">
      <header class="title-bar"></header>
      <div class="intro-body">
        <h1 class="intro-title" id="intro-title">For Keep's Sake</h1>
        <p class="intro-tagline">${pickTagline()}</p>
        <p class="intro-prompt">Click or press any key</p>
      </div>
    </div>
  `;
  root.hidden = false;

  const dismiss = (e: Event) => {
    e.preventDefault();
    window.removeEventListener("keydown", dismiss, true);
    root.removeEventListener("click", dismiss);
    root.hidden = true;
    onContinue();
  };
  // Capture phase, so the key that dismisses the intro never reaches the game's shortcuts.
  window.addEventListener("keydown", dismiss, true);
  root.addEventListener("click", dismiss);
}
