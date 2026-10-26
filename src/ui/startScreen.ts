// The start page: your name, then play solo, create a room, or join one by code. Playing solo
// or creating a room goes on to the game mode screen.
import { ROOM_CODE_LENGTH } from "../net/protocol";
import { cleanName } from "../net/join";
import type { PageIntent } from "../net/join";
import type { GameMode } from "../sim/types";
import { DEFAULT_MAP_SIZE, MAP_SIZES, type MapSize } from "../sim/config";

/** The game modes, as the mode screen offers them. */
export const GAME_MODES: { mode: GameMode; name: string; description: string; online: boolean }[] =
  [
    {
      mode: "endless",
      name: "Endless",
      description:
        "Hold your keep against endless waves of enemies, each bigger than the last. Solo, or co-op with friends.",
      online: false,
    },
    {
      mode: "pvp",
      name: "PvP",
      description:
        "Two players, a keep each. Build towers to tear down your rival's walls and keep. You only see your own land, and can't build inside their walls. Last keep standing wins.",
      online: true,
    },
  ];

const NAME_KEY = "keep-defence-name";

/** The name this device used last time, if any. */
export function rememberedName(): string | null {
  try {
    return cleanName(localStorage.getItem(NAME_KEY));
  } catch {
    return null; // storage blocked: just ask again
  }
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // not remembered; harmless
  }
}

/** A hand-made map Endless can be played on (from maps/), as the mode screen lists it. */
export interface MapChoice {
  name: string;
  title: string;
  size: MapSize;
}

/** Shows the start screen in `root` and calls `onChoose` once with the player's choice. */
export function showStartScreen(
  root: HTMLElement,
  options: {
    room?: string;
    /** Hand-made Endless maps to offer solo, besides a generated one. */
    maps?: MapChoice[];
    onChoose: (intent: Exclude<PageIntent, { mode: "menu" }>) => void;
  },
) {
  root.innerHTML = `
    <div class="window dialog-window start-window">
      <p class="dialog-title">Keep Defence</p>
      <label class="field">
        <span>Your name</span>
        <input name="name" maxlength="16" autocomplete="nickname" spellcheck="false" />
      </label>
      <div class="choices">
        <button class="button" data-action="solo">Play solo</button>
        <button class="button" data-action="create">Create room</button>
      </div>
      <form class="join-form">
        <label class="field">
          <span>Room code</span>
          <input name="room" maxlength="${ROOM_CODE_LENGTH}" autocomplete="off" spellcheck="false" placeholder="ABCD" />
        </label>
        <button class="button" type="submit">Join</button>
      </form>
    </div>
  `;
  const nameInput = root.querySelector<HTMLInputElement>('input[name="name"]')!;
  const roomInput = root.querySelector<HTMLInputElement>('input[name="room"]')!;
  const solo = root.querySelector<HTMLButtonElement>('[data-action="solo"]')!;
  const create = root.querySelector<HTMLButtonElement>('[data-action="create"]')!;
  const form = root.querySelector<HTMLFormElement>(".join-form")!;
  const join = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  nameInput.value = rememberedName() ?? "";
  roomInput.value = options.room ?? "";

  const name = () => cleanName(nameInput.value);
  const room = () => roomInput.value;
  const refresh = () => {
    const named = name() !== null;
    solo.disabled = !named;
    create.disabled = !named;
    join.disabled = !named || room().length !== ROOM_CODE_LENGTH;
  };

  // Room codes are letters only; show them as the server expects.
  roomInput.addEventListener("input", () => {
    roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z]/g, "");
    refresh();
  });
  nameInput.addEventListener("input", refresh);

  const choose = (intent: Exclude<PageIntent, { mode: "menu" }>) => {
    const chosen = name();
    if (!chosen) return;
    rememberName(chosen);
    root.hidden = true;
    options.onChoose(intent);
  };
  // Solo and Create room go on to the mode screen; PvP needs a room.
  const chooseMode = (online: boolean) => {
    const chosen = name();
    if (!chosen) return;
    showModeScreen(root, {
      online,
      maps: options.maps ?? [],
      onBack: () => showStartScreen(root, { ...options, room: room() }),
      onChoose: (game, size, map) => {
        if (!online) return choose(map ? { mode: "offline", map } : { mode: "offline", size });
        choose(
          game === "endless"
            ? { mode: "create", name: chosen, size }
            : { mode: "create", name: chosen, game, size },
        );
      },
    });
  };
  solo.addEventListener("click", () => chooseMode(false));
  create.addEventListener("click", () => chooseMode(true));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!join.disabled) choose({ mode: "join", room: room(), name: name()! });
  });

  refresh();
  root.hidden = false;
  // Invite links arrive with a code: the name is all that's left to fill in.
  (options.room && name() ? join : nameInput).focus();
}

/**
 * Picks a map size and a game mode, each mode with a short description. Online-only modes are
 * greyed out solo. Solo, Endless can be played on a hand-made map instead of a generated one
 * (online rooms can't load them yet), which brings its own size.
 */
function showModeScreen(
  root: HTMLElement,
  options: {
    online: boolean;
    maps: MapChoice[];
    onBack: () => void;
    onChoose: (mode: GameMode, size: MapSize, map?: string) => void;
  },
) {
  let size: MapSize = DEFAULT_MAP_SIZE;
  const offerMaps = !options.online && options.maps.length > 0;
  const mapChoice = offerMaps
    ? `
      <label class="field map-choice">
        <span>Endless map</span>
        <select name="map">
          <option value="">A new generated map</option>
          ${options.maps
            .map((m) => `<option value="${m.name}">${escapeHtml(m.title)} (${m.size})</option>`)
            .join("")}
        </select>
      </label>`
    : "";
  root.innerHTML = `
    <div class="window dialog-window start-window">
      <p class="dialog-title">Game mode</p>
      <div class="map-sizes" role="radiogroup" aria-label="Map size">
        <span>Map size</span>
        ${(Object.keys(MAP_SIZES) as MapSize[])
          .map(
            (s) => `<button class="size-choice" role="radio" data-size="${s}"
              title="${MAP_SIZES[s].width} x ${MAP_SIZES[s].height} tiles">${s}</button>`,
          )
          .join("")}
      </div>
      <div class="modes">
        ${GAME_MODES.map(
          (m) => `
          <button class="mode-card" data-mode="${m.mode}" ${m.online && !options.online ? "disabled" : ""}>
            <strong>${m.name}</strong>
            <span>${m.description}</span>
            ${m.online && !options.online ? "<em>Needs two players: create a room.</em>" : ""}
          </button>${m.mode === "endless" ? mapChoice : ""}`,
        ).join("")}
      </div>
      <button class="button" data-action="back">Back</button>
    </div>
  `;
  const sizeButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-size]")];
  const showSize = () => {
    for (const b of sizeButtons) b.setAttribute("aria-checked", String(b.dataset.size === size));
  };
  for (const b of sizeButtons) {
    b.addEventListener("click", () => {
      size = b.dataset.size as MapSize;
      showSize();
    });
  }
  showSize();
  const mapSelect = root.querySelector<HTMLSelectElement>('select[name="map"]');
  // A hand-made map has its own size, so the size buttons only matter for a generated one.
  mapSelect?.addEventListener("change", () => {
    for (const b of sizeButtons) b.disabled = mapSelect.value !== "";
  });
  for (const card of root.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode as GameMode;
      const map = mode === "endless" ? mapSelect?.value || undefined : undefined;
      options.onChoose(mode, size, map);
    });
  }
  root.querySelector('[data-action="back"]')!.addEventListener("click", options.onBack);
  root.querySelector<HTMLButtonElement>("[data-mode]:not([disabled])")?.focus();
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
