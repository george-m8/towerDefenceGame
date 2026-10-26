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

/** An items file Endless can be played with (from items/), as the mode screen lists it. */
export interface ItemsChoice {
  name: string;
  title: string;
}

/** Shows the start screen in `root` and calls `onChoose` once with the player's choice. */
export function showStartScreen(
  root: HTMLElement,
  options: {
    room?: string;
    /** Hand-made Endless maps to offer solo, besides a generated one. */
    maps?: MapChoice[];
    /** Items files (build limits) to offer solo, besides none. */
    items?: ItemsChoice[];
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
      items: options.items ?? [],
      onBack: () => showStartScreen(root, { ...options, room: room() }),
      onChoose: (game, size, map, items, fog) => {
        // Only "off" is sent: fog of war is on unless asked otherwise.
        const fogOff = fog ? {} : { fog: false as const };
        if (!online) {
          return choose({
            mode: "offline",
            ...(map ? { map } : { size }),
            ...(items ? { items } : {}),
            ...fogOff,
          });
        }
        choose(
          game === "endless"
            ? { mode: "create", name: chosen, size, ...fogOff }
            : { mode: "create", name: chosen, game, size, ...fogOff },
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

/** What the settings screen has chosen so far (kept when going back to the modes). */
interface ModeSettings {
  size: MapSize;
  /** A hand-made map in maps/ (Endless solo), or "" for a generated one. */
  map: string;
  /** An items file in items/ (Endless solo), or "" for no limits. */
  items: string;
  /** Fog of war (on to start with). */
  fog: boolean;
}

/**
 * The game mode screen: a card per mode, each with a short description. Online-only modes are
 * greyed out solo. Picking one goes on to that mode's settings.
 */
function showModeScreen(
  root: HTMLElement,
  options: {
    online: boolean;
    maps: MapChoice[];
    items: ItemsChoice[];
    onBack: () => void;
    onChoose: (
      mode: GameMode,
      size: MapSize,
      map: string | undefined,
      items: string | undefined,
      fog: boolean,
    ) => void;
  },
  settings: ModeSettings = { size: DEFAULT_MAP_SIZE, map: "", items: "", fog: true },
) {
  root.innerHTML = `
    <div class="window dialog-window start-window">
      <p class="dialog-title">Game mode</p>
      <div class="modes">
        ${GAME_MODES.map(
          (m) => `
          <button class="mode-card" data-mode="${m.mode}" ${m.online && !options.online ? "disabled" : ""}>
            <strong>${m.name}</strong>
            <span>${m.description}</span>
            ${m.online && !options.online ? "<em>Needs two players: create a room.</em>" : ""}
          </button>`,
        ).join("")}
      </div>
      <div class="choices">
        <button class="button" data-action="back">Back</button>
      </div>
    </div>
  `;
  for (const card of root.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    card.addEventListener("click", () =>
      showSettingsScreen(root, card.dataset.mode as GameMode, options, settings),
    );
  }
  root.querySelector('[data-action="back"]')!.addEventListener("click", options.onBack);
  root.querySelector<HTMLButtonElement>("[data-mode]:not([disabled])")?.focus();
}

/**
 * One mode's settings, and Start. Every mode has a map size. Solo, Endless can also be played on
 * a hand-made map instead of a generated one (online rooms can't load them yet), which brings
 * its own size, and with an items file's build limits.
 */
function showSettingsScreen(
  root: HTMLElement,
  mode: GameMode,
  options: Parameters<typeof showModeScreen>[1],
  settings: ModeSettings,
) {
  const solo = !options.online && mode === "endless";
  const offerMaps = solo && options.maps.length > 0;
  const offerItems = solo && options.items.length > 0;
  const name = GAME_MODES.find((m) => m.mode === mode)!.name;
  const option = (value: string, text: string, chosen: string) =>
    `<option value="${escapeHtml(value)}" ${value === chosen ? "selected" : ""}>${escapeHtml(text)}</option>`;
  root.innerHTML = `
    <div class="window dialog-window start-window">
      <p class="dialog-title">${name}</p>
      ${
        offerMaps
          ? `<label class="field">
        <span>Map</span>
        <select name="map">
          ${option("", "Random", settings.map)}
          ${options.maps.map((m) => option(m.name, `${m.title} (${m.size})`, settings.map)).join("")}
        </select>
      </label>`
          : ""
      }
      <div class="map-sizes" role="radiogroup" aria-label="Map size">
        <span>Map size</span>
        ${(Object.keys(MAP_SIZES) as MapSize[])
          .map(
            (s) => `<button class="size-choice" role="radio" data-size="${s}"
              title="${MAP_SIZES[s].width} x ${MAP_SIZES[s].height} tiles">${s}</button>`,
          )
          .join("")}
      </div>
      ${
        offerItems
          ? `<label class="field">
        <span>Build Setup</span>
        <select name="items">
          ${option("", "Everything, no limits", settings.items)}
          ${options.items.map((i) => option(i.name, i.title, settings.items)).join("")}
        </select>
      </label>`
          : ""
      }
      <div class="map-sizes" role="radiogroup" aria-label="Fog of war">
        <span title="Off: the whole map is in sight from the start">Fog of war</span>
        <button class="size-choice" role="radio" data-fog="on">On</button>
        <button class="size-choice" role="radio" data-fog="off">Off</button>
      </div>
      <div class="choices together">
        <button class="button" data-action="back">Back</button>
        <button class="button" data-action="start">Start</button>
      </div>
    </div>
  `;
  const sizes = root.querySelector<HTMLElement>('[aria-label="Map size"]')!;
  const fogButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-fog]")];
  const sizeButtons = [...sizes.querySelectorAll<HTMLButtonElement>("[data-size]")];
  const mapSelect = root.querySelector<HTMLSelectElement>('select[name="map"]');
  const itemsSelect = root.querySelector<HTMLSelectElement>('select[name="items"]');
  const show = () => {
    for (const b of sizeButtons) {
      b.setAttribute("aria-checked", String(b.dataset.size === settings.size));
    }
    for (const b of fogButtons) {
      b.setAttribute("aria-checked", String((b.dataset.fog === "on") === settings.fog));
    }
    // A hand-made map has its own size, so the size only matters for a generated one.
    sizes.hidden = settings.map !== "";
  };
  for (const b of sizeButtons) {
    b.addEventListener("click", () => {
      settings.size = b.dataset.size as MapSize;
      show();
    });
  }
  for (const b of fogButtons) {
    b.addEventListener("click", () => {
      settings.fog = b.dataset.fog === "on";
      show();
    });
  }
  mapSelect?.addEventListener("change", () => {
    settings.map = mapSelect.value;
    show();
  });
  itemsSelect?.addEventListener("change", () => (settings.items = itemsSelect.value));
  show();
  root
    .querySelector('[data-action="back"]')!
    .addEventListener("click", () => showModeScreen(root, options, settings));
  const start = root.querySelector<HTMLButtonElement>('[data-action="start"]')!;
  start.addEventListener("click", () =>
    options.onChoose(
      mode,
      settings.size,
      offerMaps ? settings.map || undefined : undefined,
      offerItems ? settings.items || undefined : undefined,
      settings.fog,
    ),
  );
  start.focus();
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
