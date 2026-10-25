// The mouse pointer's colour, opacity and size, in the settings window, with a preview (the
// window covers the map, so the pointer itself can't be seen while tweaking it).
import { POINTER_MIN_OPACITY, POINTER_SIZES, pointerImage, type PointerSettings } from "./pointer";

export function createPointerControls(
  root: HTMLElement,
  initial: PointerSettings,
  onChange: (settings: PointerSettings) => void,
) {
  root.innerHTML = `
    <h2 class="section">Pointer</h2>
    <div class="pointer-preview" data-field="preview"></div>
    <label class="slider"><span>Colour</span><input type="color" data-field="colour" /></label>
    <label class="slider"><span>Opacity</span><input type="range" min="${POINTER_MIN_OPACITY * 100}" max="100" data-field="opacity" /></label>
    <label class="slider"><span>Size</span><input type="range" min="${POINTER_SIZES.min}" max="${POINTER_SIZES.max}" data-field="size" /></label>
  `;
  const field = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-field="${name}"]`)!;
  const preview = field("preview");
  const colour = field<HTMLInputElement>("colour");
  const opacity = field<HTMLInputElement>("opacity");
  const size = field<HTMLInputElement>("size");
  let settings = { ...initial };

  const show = () => {
    colour.value = settings.colour;
    opacity.value = String(Math.round(settings.opacity * 100));
    size.value = String(settings.size);
    preview.style.backgroundImage = pointerImage(settings);
  };
  const read = () => {
    settings = {
      colour: colour.value,
      opacity: Number(opacity.value) / 100,
      size: Number(size.value),
    };
    show();
    onChange(settings);
  };
  for (const input of [colour, opacity, size]) {
    input.addEventListener("input", read);
    // Hand the keys back to the map once it's let go.
    input.addEventListener("change", () => input.blur());
  }
  show();
}
