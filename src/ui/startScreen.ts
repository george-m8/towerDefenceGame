// The start pages: who's playing (pick a saved player or add one), then play solo, create a
// room, or join one by code. Playing solo or creating a room goes on to the game mode screen.
import { ROOM_CODE_LENGTH } from "../net/protocol";
import type { PageIntent } from "../net/join";
import {
  PICTURE_CELLS,
  PICTURE_GROUPS,
  PICTURE_TILES,
  randomPicture,
  tileHtml,
  type Picture,
} from "./picture";
import { createPictureView, roomAbove } from "./pictureCanvas";
import { loadPlayers, putPlayer, removePlayer, savePlayers, type Profile } from "./profiles";
import type { EnemiesCome, GameMode } from "../sim/types";
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

/** Modes still to come: shown on the mode screen, above the real ones, but not playable yet. */
export const COMING_MODES: { name: string; description: string }[] = [
  {
    name: "Campaign",
    description:
      "A run of hand-made levels, each with its own map, waves and buildings to work with.",
  },
];

/** localStorage, or null where it's blocked. */
function deviceStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** The player picked last on this device, if any (for rejoining a room on reload). */
export function rememberedName(): string | null {
  return loadPlayers(deviceStorage())[0]?.name ?? null;
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

type StartOptions = {
  room?: string;
  /** Hand-made Endless maps to offer solo, besides a generated one. */
  maps?: MapChoice[];
  /** Items files (build limits) to offer solo, besides none. */
  items?: ItemsChoice[];
  onChoose: (intent: Exclude<PageIntent, { mode: "menu" }>) => void;
};

/** How big a picture's tiles are wherever a player is shown on the start screens (px). */
const PICK_CELL = 36;

/** The New player card's icon: a dashed square, a picture's size, with a plus. */
const NEW_PLAYER_ICON = `<span class="picture-new" style="--size:${PICK_CELL * 3}px;--above:${roomAbove(PICK_CELL)}px" aria-hidden="true">+</span>`;

/**
 * The start: who's playing (the player select screen), then what to play. Calls `onChoose`
 * once with the player's choice.
 */
export function showStartScreen(root: HTMLElement, options: StartOptions) {
  showPlayerScreen(root, options);
}

/**
 * Who's playing: a card for each player saved on this device (picked last first), each with
 * their picture, and New player. Picking one goes on to the play screen; ✎ edits a player's
 * name and picture, ✕ removes them. With nobody saved yet, it goes straight to New player.
 */
function showPlayerScreen(root: HTMLElement, options: StartOptions) {
  const storage = deviceStorage();
  let players = loadPlayers(storage);
  if (players.length === 0) return showPlayerEditor(root, options, players, null);
  root.innerHTML = `
    <div class="window dialog-window start-window player-select">
      <p class="dialog-title">Who's playing?</p>
      <div class="player-list">
        ${players
          .map(
            ({ name }) => `
          <div class="player-card">
            <button class="player-pick" data-player="${escapeHtml(name)}">
              <span class="player-name">${escapeHtml(name)}</span>
            </button>
            <div class="player-tools">
              <button data-edit="${escapeHtml(name)}"
                title="Change ${escapeHtml(name)}'s name or picture" aria-label="Edit ${escapeHtml(name)}">✎</button>
              <button data-remove="${escapeHtml(name)}"
                title="Remove ${escapeHtml(name)} from this device" aria-label="Remove ${escapeHtml(name)}">✕</button>
            </div>
          </div>`,
          )
          .join("")}
        <div class="player-card">
          <button class="player-pick" data-action="new">${NEW_PLAYER_ICON}<span class="player-name">New player</span></button>
        </div>
      </div>
    </div>
  `;
  const named = (name: string) => players.find((p) => p.name === name)!;
  // Each picture lies flat until its player is hovered (or tabbed to): then it's built up.
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-player]")) {
    buildOnHover(b, named(b.dataset.player!).picture);
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-player]")) {
    b.addEventListener("click", () => {
      savePlayers(storage, players, b.dataset.player!);
      showPlayScreen(root, options, named(b.dataset.player!));
    });
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-edit]")) {
    b.addEventListener("click", () =>
      showPlayerEditor(root, options, players, named(b.dataset.edit!)),
    );
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-remove]")) {
    b.addEventListener("click", () => {
      const name = b.dataset.remove!;
      if (!window.confirm(`Remove ${name} from this device?`)) return;
      players = savePlayers(storage, removePlayer(players, name));
      showPlayerScreen(root, options);
    });
  }
  root
    .querySelector('[data-action="new"]')!
    .addEventListener("click", () => showPlayerEditor(root, options, players, null));
  root.hidden = false;
}

/**
 * A new player, or changing one (`editing`): their name, and their picture, a 3x3 grid. Click
 * a square, then a tile from the picker to put there (the next square is picked after);
 * Shuffle makes a random one. Saving picks the player and goes on to the play screen.
 */
function showPlayerEditor(
  root: HTMLElement,
  options: StartOptions,
  players: Profile[],
  editing: Profile | null,
) {
  const storage = deviceStorage();
  const picture = [...(editing?.picture ?? randomPicture(String(Math.random())))];
  let selected = 0;
  root.innerHTML = `
    <form class="window dialog-window start-window player-editor">
      <p class="dialog-title">${editing ? `Change ${escapeHtml(editing.name)}` : "New player"}</p>
      <label class="field">
        <span>Name</span>
        <input name="name" maxlength="16" autocomplete="nickname" spellcheck="false"
          value="${escapeHtml(editing?.name ?? "")}" />
      </label>
      <div class="picture-editor">
        <div class="picture picture-large" data-field="cells"></div>
        <div class="picture-help">
          <span>Your picture: click a square, then pick what goes there.</span>
          <button class="button" type="button" data-action="shuffle">Shuffle</button>
        </div>
      </div>
      <div class="picture-picker">
        ${PICTURE_GROUPS.map(
          (group) => `
          <p class="picture-group">${group}</p>
          <div class="picture-tiles">
            ${PICTURE_TILES.filter((t) => t.group === group)
              .map(
                (t) =>
                  `<button type="button" class="picture-pick" data-tile="${t.id}">${tileHtml(t.id)}</button>`,
              )
              .join("")}
          </div>`,
        ).join("")}
      </div>
      <p class="start-note" data-field="note"></p>
      <div class="choices together">
        ${players.length > 0 ? '<button class="button" type="button" data-action="cancel">Cancel</button>' : ""}
        <button class="button" type="submit">${editing ? "Save" : "Add"}</button>
      </div>
    </form>
  `;
  const form = root.querySelector<HTMLFormElement>("form")!;
  const cells = root.querySelector<HTMLElement>('[data-field="cells"]')!;
  const drawCells = () => {
    cells.innerHTML = picture
      .map(
        (id, i) =>
          `<button type="button" class="picture-cell${i === selected ? " selected" : ""}" data-cell="${i}" aria-label="Square ${i + 1}">${tileHtml(id)}</button>`,
      )
      .join("");
  };
  drawCells();
  cells.addEventListener("click", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell) return;
    selected = Number(cell.dataset.cell);
    drawCells();
  });
  root.querySelector(".picture-picker")!.addEventListener("click", (e) => {
    const pick = (e.target as HTMLElement).closest<HTMLElement>("[data-tile]");
    if (!pick) return;
    picture[selected] = pick.dataset.tile!;
    selected = (selected + 1) % PICTURE_CELLS;
    drawCells();
  });
  root.querySelector('[data-action="shuffle"]')!.addEventListener("click", () => {
    picture.splice(0, PICTURE_CELLS, ...randomPicture(String(Math.random())));
    drawCells();
  });
  root
    .querySelector('[data-action="cancel"]')
    ?.addEventListener("click", () => showPlayerScreen(root, options));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.querySelector<HTMLInputElement>('input[name="name"]')!.value;
    const result = putPlayer(players, { name, picture: [...picture] }, editing?.name);
    if ("error" in result) {
      root.querySelector('[data-field="note"]')!.textContent = result.error;
      return;
    }
    const player = result.players[0];
    savePlayers(storage, result.players, player.name);
    showPlayScreen(root, options, player);
  });
  root.hidden = false;
  form.querySelector<HTMLInputElement>('input[name="name"]')!.focus();
}

/**
 * Who's playing, as the player select screen shows them: their picture (built up on hover)
 * and name, centred, with ⇄ under it. Any of it goes back to the player select screen.
 */
function playingAsHtml(name: string): string {
  return `
      <div class="player-list player-select playing-as">
        <div class="player-card">
          <button class="player-pick" data-action="change" title="Change player">
            <span class="player-name">${escapeHtml(name)}</span>
          </button>
          <div class="player-tools">
            <button data-action="change" title="Change player" aria-label="Change player">⇄</button>
          </div>
        </div>
      </div>`;
}

/** A picture that lies flat until `button` is hovered (or tabbed to), then is built up. */
function buildOnHover(button: HTMLButtonElement, picture: Picture) {
  const view = createPictureView(picture, PICK_CELL);
  button.prepend(view.canvas);
  button.addEventListener("pointerenter", () => view.raise(true));
  button.addEventListener("pointerleave", () => view.raise(button.matches(":focus-visible")));
  button.addEventListener("focus", () => view.raise(button.matches(":focus-visible")));
  button.addEventListener("blur", () => view.raise(button.matches(":hover")));
}

/** Fills in playingAsHtml's picture and makes its Change button work. */
function bindPlayingAs(root: HTMLElement, options: StartOptions, player: Profile) {
  buildOnHover(root.querySelector<HTMLButtonElement>(".playing-as .player-pick")!, player.picture);
  for (const b of root.querySelectorAll('[data-action="change"]')) {
    b.addEventListener("click", () => showPlayerScreen(root, options));
  }
}

/**
 * The mode screen, then on into a game: solo (offline), or creating a room. Back returns to
 * where it came from.
 */
function chooseGame(
  root: HTMLElement,
  options: StartOptions,
  player: Profile,
  online: boolean,
  onBack: () => void,
) {
  const { name } = player;
  showModeScreen(root, {
    online,
    maps: options.maps ?? [],
    items: options.items ?? [],
    onBack,
    onChoose: (game, size, map, items, fog, enemiesCome) => {
      // Only "off" is sent: fog of war is on unless asked otherwise. Likewise only "night".
      const fogOff = fog ? {} : { fog: false as const };
      const night = enemiesCome === "night" ? { enemiesCome: "night" as const } : {};
      root.hidden = true;
      if (!online) {
        return options.onChoose({
          mode: "offline",
          ...(map ? { map } : { size }),
          ...(items ? { items } : {}),
          ...fogOff,
          ...night,
        });
      }
      options.onChoose(
        game === "endless"
          ? { mode: "create", name, size, ...fogOff }
          : { mode: "create", name, game, size, ...fogOff },
      );
    },
  });
}

/**
 * What to play, as `player`: Solo (on to the mode screen) or Co-op (joining or creating a
 * room). An invite link's room code goes straight on to Co-op.
 */
function showPlayScreen(root: HTMLElement, options: StartOptions, player: Profile) {
  if (options.room) return showCoopScreen(root, options, player);
  root.innerHTML = `
    <div class="window dialog-window start-window">
      <p class="dialog-title">Keep Defence</p>
      ${playingAsHtml(player.name)}
      <div class="play-choices">
        <button class="button play-choice" data-action="solo">Solo</button>
        <button class="button play-choice" data-action="coop">Co-op</button>
      </div>
    </div>
  `;
  bindPlayingAs(root, options, player);
  const solo = root.querySelector<HTMLButtonElement>('[data-action="solo"]')!;
  solo.addEventListener("click", () =>
    chooseGame(root, options, player, false, () => showPlayScreen(root, options, player)),
  );
  root
    .querySelector('[data-action="coop"]')!
    .addEventListener("click", () => showCoopScreen(root, options, player));
  root.hidden = false;
  solo.focus();
}

/**
 * Co-op: join a room by its code (at the top), or create one, which goes on to the mode
 * screen. Back returns to Solo / Co-op.
 */
function showCoopScreen(root: HTMLElement, options: StartOptions, player: Profile) {
  root.innerHTML = `
    <div class="window dialog-window start-window">
      <p class="dialog-title">Co-op</p>
      ${playingAsHtml(player.name)}
      <form class="join-form">
        <label class="field">
          <span>Room code</span>
          <input name="room" maxlength="${ROOM_CODE_LENGTH}" autocomplete="off" spellcheck="false" placeholder="ABCD" />
        </label>
        <button class="button" type="submit">Join</button>
      </form>
      <p class="or-divider"><span>or</span></p>
      <button class="button" data-action="create">Create room</button>
      <div class="choices">
        <button class="button" data-action="back">Back</button>
      </div>
    </div>
  `;
  // Leaving this screen forgets an invite's code, so Back and Change don't bounce back here.
  const elsewhere = { ...options, room: undefined };
  bindPlayingAs(root, elsewhere, player);
  const roomInput = root.querySelector<HTMLInputElement>('input[name="room"]')!;
  const form = root.querySelector<HTMLFormElement>(".join-form")!;
  const join = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  roomInput.value = options.room ?? "";
  const room = () => roomInput.value;
  const refresh = () => {
    join.disabled = room().length !== ROOM_CODE_LENGTH;
  };
  // Room codes are letters only; show them as the server expects.
  roomInput.addEventListener("input", () => {
    roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z]/g, "");
    refresh();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (join.disabled) return;
    root.hidden = true;
    options.onChoose({ mode: "join", room: room(), name: player.name });
  });
  root
    .querySelector('[data-action="create"]')!
    .addEventListener("click", () =>
      chooseGame(root, elsewhere, player, true, () => showCoopScreen(root, elsewhere, player)),
    );
  root
    .querySelector('[data-action="back"]')!
    .addEventListener("click", () => showPlayScreen(root, elsewhere, player));
  refresh();
  root.hidden = false;
  // Invite links arrive with a code: Join is all that's left to press.
  (options.room ? join : roomInput).focus();
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
  /** When enemies come (Endless): all the time (to start with), or at night. */
  enemiesCome: EnemiesCome;
}

/**
 * The game mode screen: a card per mode, each with a short description. Online-only modes
 * (PvP) only show for a room, not solo. Picking one goes on to that mode's settings.
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
      enemiesCome: EnemiesCome,
    ) => void;
  },
  settings: ModeSettings = {
    size: DEFAULT_MAP_SIZE,
    map: "",
    items: "",
    fog: true,
    enemiesCome: "always",
  },
) {
  root.innerHTML = `
    <div class="window dialog-window start-window">
      <p class="dialog-title">Game mode</p>
      <div class="modes">
        ${COMING_MODES.map(
          (m) => `
          <button class="mode-card" disabled>
            <strong>${m.name}</strong>
            <span>${m.description}</span>
            <em>Coming soon.</em>
          </button>`,
        ).join("")}
        ${GAME_MODES.filter((m) => options.online || !m.online)
          .map(
            (m) => `
          <button class="mode-card" data-mode="${m.mode}">
            <strong>${m.name}</strong>
            <span>${m.description}</span>
          </button>`,
          )
          .join("")}
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
  // Waves (and so when they come) are Endless only.
  const offerNight = solo && mode === "endless";
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
      ${
        offerNight
          ? `<div class="map-sizes" role="radiogroup" aria-label="Enemies come">
        <span title="At night: waves from early evening until sunrise; days are for building">Enemies come</span>
        <button class="size-choice" role="radio" data-enemies="always">All the time</button>
        <button class="size-choice" role="radio" data-enemies="night">At night</button>
      </div>`
          : ""
      }
      <div class="choices together">
        <button class="button" data-action="back">Back</button>
        <button class="button" data-action="start">Start</button>
      </div>
    </div>
  `;
  const sizes = root.querySelector<HTMLElement>('[aria-label="Map size"]')!;
  const fogButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-fog]")];
  const enemiesButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-enemies]")];
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
    for (const b of enemiesButtons) {
      b.setAttribute("aria-checked", String(b.dataset.enemies === settings.enemiesCome));
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
  for (const b of enemiesButtons) {
    b.addEventListener("click", () => {
      settings.enemiesCome = b.dataset.enemies as EnemiesCome;
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
      offerNight ? settings.enemiesCome : "always",
    ),
  );
  start.focus();
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
