import { GRID_HEIGHT, GRID_WIDTH } from "./sim/config";
import { createRenderer } from "./render/canvas";
import { centerOn, panBy, setViewport, tilePixels, zoomBy } from "./ui/camera";
import { ZOOM_STEP } from "./ui/input";
import { createMinimap } from "./ui/minimap";
import { fogFromUrl, readJoinIntent, serverUrl, tokenKey, type PageIntent } from "./net/join";
import { createNetworkSession, type NetworkDeps, type NetworkSession } from "./net/networkSession";
import { createLocalSession, type Session } from "./net/session";
import { createPanel } from "./ui/panel";
import { bindInput } from "./ui/input";
import { createUiState, showMessage } from "./ui/state";
import { createGameOverDialog } from "./ui/gameOver";
import { createOnlinePanel } from "./ui/players";
import { createWaitingRoom } from "./ui/waitingRoom";
import { rememberedName, showStartScreen } from "./ui/startScreen";
import { showIntro } from "./ui/intro";
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
import type { Command, GameState, PlayerId } from "./sim/types";

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
const panel = createPanel(element("#panel"), ui, dispatch, () => journalView.toggle());
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
const gameOver = createGameOverDialog(element("#game-over"), () => {
  session?.restart();
  ui.tool = null;
});
bindInput(canvas, ui, dispatch, () => session?.state ?? null, {
  journal: () => journalView.toggle(),
  escape: () => {
    if (!journalView.isOpen) return false;
    journalView.close();
    return true;
  },
});

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
  if (intent.mode === "offline") {
    session = createLocalSession(Date.now() >>> 0, undefined, { fog, size: intent.size });
  } else {
    network = createNetworkSession(
      serverUrl(location),
      intent,
      {
        WebSocket: WebSocket as unknown as NetworkDeps["WebSocket"],
        storage,
        now: () => performance.now(),
      },
      { fog },
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
  session.onResult = (result) => {
    if (!result.ok) showMessage(ui, result.reason);
    const sound = soundForResult(awaitingResults.shift() ?? "", result);
    if (sound) cues.play(sound);
  };
}

const intent = readJoinIntent(location.search);
if (import.meta.env.DEV && new URLSearchParams(location.search).has("soundtest")) {
  showSoundTest(element("#intro"), audio);
} else if (intent.mode !== "menu") {
  startSession(intent);
} else if (intent.room && storage.getItem(tokenKey(intent.room))) {
  // A reload of a room this tab is already in: go straight back in as the same player.
  startSession({ mode: "join", room: intent.room, name: rememberedName() ?? "Player" });
} else {
  // Direct room links and rejoins skip the intro; everyone else sees it before the menu.
  // Dismissing the intro is the first gesture, so audio is unlocked by then.
  showIntro(element("#intro"), () => {
    void music.play("intro");
    showStartScreen(element("#start"), { room: intent.room, onChoose: startSession });
  });
}

let lastFrame = performance.now();

function frame(now: number) {
  const seconds = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (session) {
    session.frame(now);
    ui.playerId = session.playerId;
    const state = session.state;
    for (const view of onlineViews) view.update(state);
    if (state) {
      fitCanvas(state.width, state.height);
      // A new map (first game, restart, or joining a room): start looking at the keep.
      // (PvP keeps are handed out at the start, so that counts as a new map too.)
      const mine = state.keeps.findIndex((k) => k.owner === ui.playerId);
      const mapKey = `${state.seed}:${state.width}x${state.height}:${mine}`;
      if (mapKey !== centredFor) {
        ui.camera.zoom = 1;
        // Your own keep in PvP (once they're handed out), else the shared one.
        const keep = state.keeps[mine] ?? state.keeps[0];
        centerOn(ui.camera, keep.x + keep.size / 2, keep.y + keep.size / 2);
        centredFor = mapKey;
      }
      panWithKeys(seconds);
      renderer.render(state, ui, session.pending);
      minimap.update(state);
      panel.update(state);
      gameOver.update(state, session.playerId);
      cues.update(state.cues);
      updateJournal(state, session.playerId, now);
    }
  }
  followMusic();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Moves the view while arrow keys are held. */
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
