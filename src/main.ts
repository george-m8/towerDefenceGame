import { GRID_HEIGHT, GRID_WIDTH, type MapSize } from "./sim/config";
import { createRenderer } from "./render/canvas";
import { toView, turnFacing, turnView, viewOf } from "./render/rotation";
import { GLYPH_FONT, TERRAIN_STYLES } from "./render/palette";
import { centerOn, panBy, setViewport, tilePixels, zoomBy } from "./ui/camera";
import { ZOOM_STEP } from "./ui/input";
import { createMinimap } from "./ui/minimap";
import { fogFromUrl, readJoinIntent, serverUrl, tokenKey, type PageIntent } from "./net/join";
import { createNetworkSession, type NetworkDeps, type NetworkSession } from "./net/networkSession";
import { createLocalSession, type Session } from "./net/session";
import { createPanel } from "./ui/panel";
import { createHud } from "./ui/hud";
import { createMapButtons, panelToggle } from "./ui/mapButtons";
import { createSunSlider, toggleSun } from "./ui/sunSlider";
import { advanceClock, createClockControls, followSky, toggleClock } from "./ui/clockControls";
import { hoverText } from "./ui/tileInfo";
import { bindInput } from "./ui/input";
import { createUiState, showMessage } from "./ui/state";
import { createPointerControls } from "./ui/pointerControls";
import { createPointerLabel } from "./ui/pointerLabel";
import { loadPointerSettings, pointerCursor, savePointerSettings } from "./ui/pointer";
import { createGameOverDialog } from "./ui/gameOver";
import { createOnlinePanel } from "./ui/players";
import { createWaitingRoom } from "./ui/waitingRoom";
import {
  rememberedName,
  showStartScreen,
  type ItemsChoice,
  type MapChoice,
} from "./ui/startScreen";
import { showIntro } from "./ui/intro";
import { createBackdrop, type Backdrop } from "./ui/backdrop";
import { curtainAt, type CurtainPhase } from "./ui/curtain";
import { createWebAudioEngine, unlockOnFirstGesture } from "./audio/engine";
import { loadAudioSettings, saveAudioSettings } from "./audio/settings";
import { createJournalView } from "./ui/journalView";
import {
  createNoticeQueue,
  currentNotice,
  discover,
  loadJournal,
  pushNotices,
  saveJournal,
} from "./ui/journal";
import { createSoundControls } from "./ui/soundControls";
import { createCuePlayer, soundForResult } from "./audio/cues";
import { showSoundTest } from "./ui/soundTest";
import { createMusicPlayer } from "./audio/sequencer";
import type { MusicPlace } from "./audio/places";
import { activePack, songsFor } from "./audio/playlist";
import { SONGS } from "./audio/songs";
import musicPacks from "virtual:music-packs";
import { liveVoiceCount } from "./audio/synth";
import { showNotice } from "./ui/notice";
import bundledMaps from "virtual:maps";
import bundledItems from "virtual:items";
import { createEditor, keepWalls, type Editor } from "./editor/editor";
import { createFileActions } from "./editor/files";
import { createItemsEditor } from "./editor/itemsEditor";
import { newItems, type ItemsFile } from "./sim/itemsFile";
import { newMap } from "./editor/model";
import { validateMap, type MapFile } from "./sim/mapFile";
import { createToolbar } from "./editor/toolbar";
import type { Command, DebugOption, EnemiesCome, GameState, PlayerId } from "./sim/types";

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const ui = createUiState();
const storage = tabStorage();
/** Read once at load: the address bar loses the flag when a room code replaces it. */
const fog = fogFromUrl(location.search);
let session: Session | null = null;
/** The online session, for its waiting room (null offline). */
let network: NetworkSession | null = null;
/** Online-only parts of the page, updated every frame. */
const onlineViews: { update(state: GameState | null): void }[] = [];
/** The map editor (?editor), and whether it has the map (false while Play is running). */
let editing: { editor: Editor; toolbar: ReturnType<typeof createToolbar> } | null = null;
let editorActive = false;
/** The game played out behind the intro and start screens, until a game starts (else null). */
let backdrop: Backdrop | null = null;
/** The fog curtain while a chosen game is swapped in for the backdrop (see ui/curtain.ts). */
let curtain: CurtainPhase | null = null;

/** Types of commands sent, oldest first, waiting for their results (to pick a sound). */
const awaitingResults: string[] = [];
const dispatch = (command: Command) => {
  if (!session) return;
  // Online, dev-only debug spawns are dropped without a result, so don't wait for one.
  if (!(session.online && command.type === "debugSpawn")) awaitingResults.push(command.type);
  session.send(command);
};
const canvas = element<HTMLCanvasElement>("#map");
const renderer = createRenderer(canvas);
// Nothing on the page uses the map's font, so ask for it; the map draws in it once it's here.
void document.fonts.load(GLYPH_FONT);
void document.fonts.load(GLYPH_FONT, TERRAIN_STYLES.tree.glyph); // the upper-plane glyphs' file
const minimap = createMinimap(element<HTMLCanvasElement>("#minimap"), ui);
/** Arrow-key panning speed, in screen pixels per second (so it feels the same at any zoom). */
const PAN_PIXELS_PER_SECOND = 900;
/** The map the camera was last centred for, so a new game re-centres on its keep. */
let centredFor = "";

/** Fits the canvas to the space CSS gives it, at the screen's pixel density. */
function fitCanvas(mapWidth: number, mapHeight: number) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  setViewport(ui.camera, rect.width, rect.height, mapWidth, mapHeight);
}
fitCanvas(GRID_WIDTH, GRID_HEIGHT);

element("[data-turn]").addEventListener("click", (e) => {
  (e.currentTarget as HTMLElement).blur();
  if (!editorActive) turnView(ui, session?.state ?? null, 2);
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-zoom]")) {
  button.addEventListener("click", () => {
    button.blur();
    const action = button.dataset.zoom;
    // "fit" zooms all the way out; the camera clamps it to the whole map.
    zoomBy(ui.camera, action === "in" ? ZOOM_STEP : action === "out" ? 1 / ZOOM_STEP : 0);
  });
}

const journal = loadJournal(deviceStorage());
const journalView = createJournalView(element("#journal"), journal, () =>
  saveJournal(deviceStorage(), journal),
);
const journalNotices = createNoticeQueue();
const toast = element("#toast");

/** Unlocks journal entries for enemies this player can see, with a notice and sound. */
function updateJournal(state: GameState, viewer: PlayerId, now: number) {
  const found = discover(journal, state, viewer);
  if (found.length > 0) {
    saveJournal(deviceStorage(), journal);
    pushNotices(journalNotices, found);
    cues.play("discovered");
    journalView.refresh();
  }
  const notice = currentNotice(journalNotices, now);
  toast.hidden = notice === null;
  if (notice !== null && toast.textContent !== notice) toast.textContent = notice;
}
const hud = createHud(element("#hud"), ui);
const keysBox = element("#panel");
const panel = createPanel(
  { actions: hud.actions, keys: keysBox, status: element("#status") },
  ui,
  dispatch,
);
const infoBox = element("#info-box");
/** In a game, not the editor: the Debug rows that change the game. */
const inGame = () => !editorActive;
/** A Debug menu row for a game debug option (offline only; online refuses it). */
const debugToggle = (label: string, option: DebugOption) => ({
  label,
  isOn: () => session?.state?.debug[option] === true,
  toggle: () =>
    dispatch({ type: "debugOption", option, on: session?.state?.debug[option] !== true }),
  available: inGame,
});
const sunSlider = createSunSlider(element("#sun"), ui);
const clockControls = createClockControls(
  element("#clock"),
  ui,
  {
    clock: () => session?.state?.clock ?? null,
    setHour: (hour) => dispatch({ type: "debugClock", hour }),
    canSet: () => session?.online !== true,
  },
  () => sunSlider.sync(),
);
/** The game clock's hour the sky last followed (see followSky). */
let skyFollowed: number | null = null;
createMapButtons(element("#map-buttons"), {
  view: [
    panelToggle("Map", element("#minimap-box")),
    panelToggle("Info", infoBox),
    panelToggle("Keys", keysBox),
    // Only in an online game, where the room, invite link and players are shown.
    panelToggle("Players", element("#online"), () => session?.online === true),
  ],
  debug: [
    debugToggle("Infinite keep health", "infiniteKeep"),
    debugToggle("Infinite money", "infiniteGold"),
    {
      label: "Fog of war",
      isOn: () => session?.state?.fog === true,
      toggle: () => dispatch({ type: "debugFog", on: session?.state?.fog !== true }),
      available: inGame,
    },
    { label: "Show paths", isOn: () => ui.showFlow, toggle: () => (ui.showFlow = !ui.showFlow) },
    {
      label: "Sun slider",
      isOn: () => ui.showSun,
      toggle: () => {
        toggleSun(ui);
        skyFollowed = null; // with a game clock, the sun goes straight back to it
        sunSlider.sync();
      },
    },
    {
      label: "Day/night",
      isOn: () => ui.clock !== null,
      toggle: () => {
        toggleClock(ui);
        skyFollowed = null; // with a game clock, the sun goes straight back to it
        clockControls.sync();
        sunSlider.sync();
      },
    },
    {
      // Clicks take 35% off whatever's on the tile (destroying it at 0).
      label: "Damage tool",
      isOn: () => ui.debugDamage,
      toggle: () => {
        ui.debugDamage = !ui.debugDamage;
        if (ui.debugDamage) ui.tool = null;
      },
      available: inGame,
    },
  ],
  settings: element("#settings"),
  journal: () => journalView.toggle(),
});
const gameOver = createGameOverDialog(element("#game-over"), () => {
  session?.restart();
  ui.tool = null;
});
bindInput(
  canvas,
  ui,
  dispatch,
  () => session?.state ?? (editorActive ? editing!.editor.state : null),
  {
    playing: () => !editorActive,
    journal: () => journalView.toggle(),
    escape: () => {
      if (!journalView.isOpen) return false;
      journalView.close();
      return true;
    },
  },
);

// Sound: silent until the first click or key press (browsers require a gesture).
const audio = createWebAudioEngine();
const audioStorage = deviceStorage();
let audioSettings = loadAudioSettings(audioStorage);
audio.setVolumes(audioSettings);
const cues = createCuePlayer(audio);
const pack = () => activePack(musicPacks, audioSettings.pack);
const music = createMusicPlayer(audio, {
  songsFor: (place) => songsFor(place, pack(), musicPacks, SONGS),
});
// Direct room links skip the intro, so a game's music can be asked for before audio unlocks.
unlockOnFirstGesture(audio, window, () => void music.resume());
const MUSIC_FADE_SECONDS = 1;
const SKIP_FADE_SECONDS = 0.4;
/** What the music is following: the menus (intro, start screen, waiting room) or a game. */
let musicScene: "menus" | MusicPlace = "menus";
music.onEnded = (place) => {
  // The intro hands over to menu music if nobody has started a game yet.
  if (place === "intro" && musicScene === "menus") void music.play("menu");
};
if (import.meta.env.DEV) {
  // Lets you check from the console that sounds are playing (and cleaning up).
  (window as unknown as { __liveVoices: () => number }).__liveVoices = liveVoiceCount;
  // Lets a test script reach into the game (e.g. place enemies for a visual check).
  (window as unknown as { __state: () => GameState | null }).__state = () => session?.state ?? null;
  (window as unknown as { __ui: typeof ui }).__ui = ui;
}
// The map's crosshair, drawn as set in the settings window.
canvas.style.cursor = pointerCursor(loadPointerSettings(audioStorage));
createPointerControls(element("#pointer"), loadPointerSettings(audioStorage), (settings) => {
  canvas.style.cursor = pointerCursor(settings);
  savePointerSettings(audioStorage, settings);
});
const pointerLabel = createPointerLabel(element(".map-window"));
const soundControls = createSoundControls(
  element("#sound"),
  audioSettings,
  { names: Object.keys(musicPacks).sort((a, b) => a.localeCompare(b)), shownPack: pack() },
  (settings) => {
    const packChanged = settings.pack !== audioSettings.pack;
    audioSettings = settings;
    audio.setVolumes(settings);
    saveAudioSettings(audioStorage, settings);
    if (packChanged) void music.restart(MUSIC_FADE_SECONDS);
  },
  () => void music.skip(SKIP_FADE_SECONDS),
);
music.onSongChange = (song) => soundControls.showSong(song?.title ?? null);

/** Switches the music when a game starts, the keep falls, or a game restarts. */
function followMusic() {
  const state = session?.state;
  const next =
    !state || (network && !network.lobby?.started)
      ? "menus"
      : state.gameOver
        ? "game-over"
        : "in-play";
  if (next === musicScene) return;
  musicScene = next;
  if (next !== "menus") void music.switchTo(next, MUSIC_FADE_SECONDS);
}

/** Starts playing: offline, or in a room on the game server. */
function startSession(intent: Exclude<PageIntent, { mode: "menu" }>) {
  stopBackdrop();
  if (intent.mode === "offline") {
    const map = intent.map ? bundledMaps[intent.map] : undefined;
    const items = intent.items ? bundledItems[intent.items] : undefined;
    session = soloSession(map, items, intent.size, fog && intent.fog !== false, intent.enemiesCome);
  } else {
    network = createNetworkSession(
      serverUrl(location),
      intent,
      {
        WebSocket: WebSocket as unknown as NetworkDeps["WebSocket"],
        storage,
        now: () => performance.now(),
      },
      { fog: fog && !(intent.mode === "create" && intent.fog === false) },
    );
    // Keep the address shareable and reloadable: ?room=CODE (reloading rejoins with the token).
    network.onWelcome = (room) => history.replaceState(null, "", `?room=${room}`);
    network.onError = (reason) => showNotice(element("#notice"), reason);
    onlineViews.push(
      createOnlinePanel(element("#online"), network),
      createWaitingRoom(element("#waiting"), network),
    );
    session = network;
  }
  listen(session);
}

/**
 * A solo game: on a hand-made map (Restart replays it) or a generated one, with any limits.
 * Fog of war is as set up (and always off with the ?fog=off dev switch).
 */
function soloSession(
  map: MapFile | undefined,
  items: ItemsFile | undefined,
  size?: MapSize,
  withFog = fog,
  enemiesCome?: EnemiesCome,
): Session {
  return map
    ? createLocalSession(map.seed, () => map.seed, { fog: withFog, map, items, enemiesCome })
    : createLocalSession(Date.now() >>> 0, undefined, { fog: withFog, size, items, enemiesCome });
}

/** The items files in items/, for the mode screen. */
function itemsChoices(): ItemsChoice[] {
  return Object.entries(bundledItems).map(([name, items]) => ({ name, title: items.title }));
}

/** The hand-made Endless maps in maps/ with nothing wrong with them, for the mode screen. */
function playableMaps(): MapChoice[] {
  return Object.entries(bundledMaps)
    .filter(([, map]) => map.mode === "endless" && validateMap(map).errors.length === 0)
    .map(([name, map]) => ({ name, title: map.title, size: map.size }));
}

/** Ends the game behind the menus, for good: a real game is starting. */
function stopBackdrop() {
  backdrop = null;
  document.body.classList.remove("backdrop");
}

/** Shows refusals and plays the sound for each command's result. */
function listen(playing: Session) {
  playing.onResult = (result) => {
    if (!result.ok) showMessage(ui, result.reason);
    const sound = soundForResult(awaitingResults.shift() ?? "", result);
    if (sound) cues.play(sound);
  };
}

/** The map editor: ?editor for a new map, ?editor=<name> to open maps/<name>.map. */
function startEditor() {
  const asked = new URLSearchParams(location.search).get("editor");
  const name = asked && bundledMaps[asked] ? asked : null;
  const start = name
    ? bundledMaps[name]
    : newMap("Untitled", "endless", "M", (Math.random() * 1e6) >>> 0);
  document.body.classList.add("editing");
  editorActive = true;
  const editor = createEditor(canvas, ui, start, { active: () => editorActive, play: playMap });
  const files = createFileActions(
    element("#editor-dialog"),
    { name, map: start },
    {
      current: () => editor.map,
      load: (map) => {
        editor.load(map);
        centredFor = "";
      },
      say: (message) => editor.say(message),
    },
  );
  const toolbar = createToolbar(element("#editor"), editor, ui, files, {
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    keepWalls: () => keepWalls(editor),
    play: playMap,
  });
  element("#editor-back").addEventListener("click", backToEditor);
  editing = { editor, toolbar };
}

/** The items editor: ?items-editor for a new file, ?items-editor=<name> to open items/<name>.items. */
function startItemsEditor() {
  const asked = new URLSearchParams(location.search).get("items-editor");
  const name = asked && bundledItems[asked] ? asked : null;
  const root = element("#items-editor");
  document.body.classList.add("items-editing");
  root.hidden = false;
  createItemsEditor(
    root,
    element("#editor-dialog"),
    { name, items: name ? bundledItems[name] : newItems("Untitled") },
    {
      maps: playableMaps(),
      // Tries the limits out: a solo Endless game, with "Back to editor" to return.
      play: (items, mapName) => {
        root.hidden = true;
        document.body.classList.replace("items-editing", "testing");
        session = soloSession(mapName ? bundledMaps[mapName] : undefined, items);
        listen(session);
        centredFor = "";
      },
    },
  );
  element("#editor-back").addEventListener("click", () => {
    session = null;
    ui.tool = null;
    root.hidden = false;
    document.body.classList.replace("testing", "items-editing");
  });
}

/** Plays the map being edited: a normal single-player game, with today's waves and gold. */
function playMap() {
  if (!editing || !editorActive) return;
  const { editor } = editing;
  const { errors } = editor.problems;
  if (errors.length > 0) {
    editor.say(`Fix first: ${errors[0]}`);
    return;
  }
  const map = editor.map;
  editorActive = false;
  ui.tool = null;
  editor.item = null;
  document.body.classList.replace("editing", "testing");
  session = createLocalSession(map.seed, () => map.seed, { fog, map });
  listen(session);
  centredFor = "";
}

/** Ends the game and goes back to the design, as it was (undo history too). */
function backToEditor() {
  if (!editing) return;
  session = null;
  editorActive = true;
  ui.tool = null;
  ui.rotation = 0; // the editor's view doesn't turn
  document.body.classList.replace("testing", "editing");
}

const intent = readJoinIntent(location.search);
if (new URLSearchParams(location.search).has("editor")) {
  startEditor();
} else if (new URLSearchParams(location.search).has("items-editor")) {
  startItemsEditor();
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has("soundtest")) {
  showSoundTest(element("#intro"), audio);
} else if (intent.mode !== "menu") {
  startSession(intent);
} else if (intent.room && storage.getItem(tokenKey(intent.room))) {
  // A reload of a room this tab is already in: go straight back in as the same player.
  startSession({ mode: "join", room: intent.room, name: rememberedName() ?? "Player" });
} else {
  // Direct room links and rejoins skip the intro; everyone else sees it before the menu.
  // Behind both, a game plays itself out.
  backdrop = createBackdrop();
  document.body.classList.add("backdrop");
  // Dismissing the intro is the first gesture, so audio is unlocked by then.
  showIntro(element("#intro"), () => {
    void music.play("intro");
    showStartScreen(element("#start"), {
      room: intent.room,
      maps: playableMaps(),
      items: itemsChoices(),
      // The fog closes over the backdrop, and the game starts under it.
      onChoose: (chosen) =>
        (curtain = {
          phase: "closing",
          started: performance.now(),
          then: () => startSession(chosen),
        }),
    });
  });
}

let lastFrame = performance.now();

function frame(now: number) {
  const seconds = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  // The day and night clock runs on real time, paused game or not (it's only drawing).
  // A game's own clock runs with the game (and wins over the Debug clock).
  const gameClock = editorActive ? null : (session?.state?.clock ?? null);
  if (ui.clock?.playing && !gameClock) {
    advanceClock(ui, seconds);
    clockControls.sync();
    sunSlider.sync();
  }
  const followed = followSky(ui, gameClock, skyFollowed);
  if (followed !== skyFollowed) {
    skyFollowed = followed;
    clockControls.sync();
    sunSlider.sync();
  }
  if (editing && editorActive) {
    const { editor, toolbar } = editing;
    editor.update(now);
    const state = editor.state;
    fitCanvas(state.width, state.height);
    // Opening the editor, New or Open (which clear centredFor): start looking at the keep.
    if (centredFor !== "editor") {
      ui.camera.zoom = 1;
      const keep = state.keeps[0];
      if (keep) centerOn(ui.camera, keep.x + keep.size / 2, keep.y + keep.size / 2);
      else centerOn(ui.camera, state.width / 2, state.height / 2);
      centredFor = "editor";
    }
    panWithKeys(seconds);
    renderer.render(state, ui);
    editor.drawOverlay(canvas.getContext("2d")!, ui);
    minimap.update(state);
    toolbar.update(now);
  } else if (backdrop) {
    backdrop.frame(now, seconds);
    const state = backdrop.session.state!;
    fitCanvas(state.width, state.height);
    ui.camera.zoom = 1;
    centerOn(ui.camera, backdrop.focus.x, backdrop.focus.y);
    updateCurtain(now);
    renderer.render(state, ui);
  } else if (session) {
    session.frame(now);
    ui.playerId = session.playerId;
    const state = session.state;
    for (const view of onlineViews) view.update(state);
    if (state) {
      // Drawn through the view's turn (Q): the camera, minimap and renderer see a turned copy.
      const view = viewOf(state, ui.rotation);
      fitCanvas(view.width, view.height);
      // A new map (first game, restart, or joining a room): start looking at the keep.
      // (PvP keeps are handed out at the start, so that counts as a new map too.)
      const mine = state.keeps.findIndex((k) => k.owner === ui.playerId);
      const mapKey = `${state.seed}:${state.width}x${state.height}:${mine}`;
      if (mapKey !== centredFor) {
        ui.camera.zoom = 1;
        // Your own keep in PvP (once they're handed out), else the shared one.
        const keep = view.keeps[mine] ?? view.keeps[0];
        centerOn(ui.camera, keep.x + keep.size / 2, keep.y + keep.size / 2);
        centredFor = mapKey;
      }
      panWithKeys(seconds);
      updateCurtain(now);
      const viewUi = turnedUi(state);
      const pending = session.pending.map((p) => ({
        ...p,
        ...toView(p, ui.rotation, state.width, state.height),
        ...(p.facing ? { facing: turnFacing(p.facing, ui.rotation) } : {}),
      }));
      renderer.render(view, viewUi, pending);
      minimap.update(view);
      panel.update(state);
      hud.update(state);
      pointerLabel.update(view, viewUi);
      if (!infoBox.hidden) infoBox.textContent = hoverText(state, ui) || "Hover a tile for details";
      gameOver.update(state, session.playerId);
      cues.update(state.cues);
      updateJournal(state, session.playerId, now);
    }
  }
  followMusic();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/**
 * Moves the fog curtain on, just before a frame is drawn: closing over the backdrop, then (once
 * the game it covers has its first frame) opening out on it, centred on the camera.
 */
function updateCurtain(now: number) {
  if (!curtain) return;
  if (curtain.phase === "covered") curtain = { phase: "opening", started: now };
  const { curtain: drawn, done } = curtainAt(curtain, now, ui.camera);
  ui.curtain = drawn;
  if (!done) return;
  if (curtain.phase === "closing") {
    const { then } = curtain;
    curtain = { phase: "covered" };
    then();
  } else {
    curtain = null;
    ui.curtain = null;
  }
}

/** The UI as the turned view sees it: the hovered tile and the build facing, turned. */
function turnedUi(state: GameState): typeof ui {
  if (ui.rotation === 0) return ui;
  return {
    ...ui,
    hover: ui.hover && toView(ui.hover, ui.rotation, state.width, state.height),
    facing: turnFacing(ui.facing, ui.rotation),
  };
}

/** Moves the view while arrow keys (or WASD) are held. */
function panWithKeys(seconds: number) {
  const { left, right, up, down } = ui.panKeys;
  const step = (PAN_PIXELS_PER_SECOND * seconds) / tilePixels(ui.camera);
  const dx = (right ? 1 : 0) - (left ? 1 : 0);
  const dy = (down ? 1 : 0) - (up ? 1 : 0);
  if (dx || dy) panBy(ui.camera, dx * step, dy * step);
}

/** sessionStorage (per tab, so each tab is its own player), or memory if it's unavailable. */
function tabStorage(): NetworkDeps["storage"] {
  try {
    sessionStorage.getItem("probe");
    return sessionStorage;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };
  }
}

/** localStorage (shared by every tab on this device), or null if it's blocked. */
function deviceStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
