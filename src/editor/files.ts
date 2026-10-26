// The map editor's file actions (SPEC-map-editor.md): New, Open, Save and Download, and the
// dialogs they need. Save writes into maps/ through the dev server (tools/maps.ts), so it only
// exists under `npm run dev`; Download works anywhere.
import bundledMaps from "virtual:maps";
import { MAP_SIZES, type MapSize } from "../sim/config";
import { mapFromGenerated } from "../sim/game";
import { MAP_NAME_PATTERN, mapName, parseMap, serializeMap, type MapFile } from "../sim/mapFile";
import type { GameMode } from "../sim/types";
import { newMap } from "./model";

/** Where Save sends a map (tools/maps.ts). */
const ENDPOINT = "/__maps";
/** Whether this page can save into maps/ (the dev server's endpoint). */
export const CAN_SAVE = import.meta.env.DEV;

export interface FileActions {
  /** The map's file name, once it's been opened from or saved to maps/. */
  readonly name: string | null;
  /** True when the map has changed since it was opened or saved. */
  dirty(map: MapFile): boolean;
  newMap(): void;
  open(): void;
  save(map: MapFile): void;
  download(map: MapFile): void;
  /** Escape: closes the open dialog, if there is one. */
  close(): boolean;
}

export function createFileActions(
  root: HTMLElement,
  start: { name: string | null; map: MapFile },
  callbacks: {
    /** The map being edited now (for the unsaved-changes checks). */
    current: () => MapFile;
    /** A map from New or Open, to edit from scratch. */
    load: (map: MapFile) => void;
    /** A message for the status line. */
    say: (message: string) => void;
  },
): FileActions {
  let name = start.name;
  let saved = start.map;

  const discardOk = () =>
    !actions.dirty(callbacks.current()) ||
    window.confirm("Throw away the changes you haven't saved?");

  const actions: FileActions = {
    get name() {
      return name;
    },
    dirty: (map) => map !== saved,
    newMap() {
      if (!discardOk()) return;
      showDialog(root, newDialog(), (form) => {
        const title = field(form, "title").trim() || "Untitled";
        const size = field(form, "size") as MapSize;
        const mode = field(form, "mode") as GameMode;
        const seed = Number(field(form, "seed")) >>> 0;
        const map =
          field(form, "start") === "generated"
            ? mapFromGenerated(title, mode, size, seed)
            : newMap(title, mode, size, seed);
        name = null;
        saved = map;
        callbacks.load(map);
      });
    },
    open() {
      if (!discardOk()) return;
      void listFiles(ENDPOINT, bundledMaps).then((maps) => {
        showDialog(root, openDialog(maps), (_form, button) => {
          const chosen = button?.dataset.map;
          if (!chosen || !maps[chosen]) return;
          name = chosen;
          saved = maps[chosen];
          callbacks.load(maps[chosen]);
        });
        const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file) return;
          void file.text().then((text) => {
            const result = readMapText(text);
            if ("error" in result) {
              callbacks.say(`Couldn't open ${file.name}: ${result.error}`);
              return;
            }
            close(root);
            name = null;
            saved = result.map;
            callbacks.load(result.map);
          });
        });
      });
    },
    save(map) {
      if (!CAN_SAVE) return;
      const write = (target: string) =>
        void saveToServer(ENDPOINT, target, serializeMap(map)).then((error) => {
          if (error) return callbacks.say(`Not saved: ${error}`);
          name = target;
          saved = map;
          callbacks.say(`Saved maps/${target}.map`);
        });
      if (name) return write(name);
      showDialog(root, saveDialog(mapName(map.title)), (form) => {
        const target = field(form, "name").trim();
        if (!MAP_NAME_PATTERN.test(target)) {
          callbacks.say("A map name is a-z, 0-9 and dashes");
          return false;
        }
        write(target);
      });
    },
    download(map) {
      downloadText(serializeMap(map), `${name ?? mapName(map.title)}.map`);
    },
    close: () => close(root),
  };

  // Leaving the page with unsaved changes asks first.
  window.addEventListener("beforeunload", (e) => {
    if (actions.dirty(callbacks.current())) e.preventDefault();
  });
  return actions;
}

/** A map file's text, parsed. */
export function readMapText(text: string): { map: MapFile } | { error: string } {
  try {
    return parseMap(JSON.parse(text));
  } catch {
    return { error: "it isn't a map file (not JSON)" };
  }
}

/** The files in a folder: fresh from the dev server, else the ones bundled with the game. */
export async function listFiles<T>(
  endpoint: string,
  bundled: Record<string, T>,
): Promise<Record<string, T>> {
  if (!CAN_SAVE) return bundled;
  try {
    const response = await fetch(endpoint);
    if (response.ok) return (await response.json()) as Record<string, T>;
  } catch {
    // fall back to the list from when the page loaded
  }
  return bundled;
}

/** Sends a file to the dev server; resolves with an error message, or null once it's saved. */
export async function saveToServer(
  endpoint: string,
  name: string,
  text: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${endpoint}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text,
    });
    if (response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `the server said ${response.status}`;
  } catch {
    return "the dev server isn't answering";
  }
}

/** Hands the browser a file to save. */
export function downloadText(text: string, fileName: string) {
  const blob = new Blob([text], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function newDialog(): string {
  const sizes = Object.keys(MAP_SIZES)
    .map((s) => `<option value="${s}" ${s === "M" ? "selected" : ""}>${s}</option>`)
    .join("");
  return `
    <form class="window dialog-window start-window editor-form">
      <p class="dialog-title">New map</p>
      <label class="field"><span>Title</span><input name="title" value="Untitled" maxlength="40" /></label>
      <label class="field"><span>Size</span><select name="size">${sizes}</select></label>
      <div class="field"><span>Mode</span>
        <label><input type="radio" name="mode" value="endless" checked /> Endless: one keep, enemy spawns</label>
        <label><input type="radio" name="mode" value="pvp" /> PvP: two keeps</label>
      </div>
      <div class="field"><span>Start from</span>
        <label><input type="radio" name="start" value="blank" checked /> Open ground</label>
        <label><input type="radio" name="start" value="generated" /> A generated map</label>
      </div>
      <label class="field"><span>Seed (fixes resources, and the generated map)</span>
        <input name="seed" type="number" min="0" value="${(Math.random() * 1e6) | 0}" /></label>
      <div class="choices">
        <button class="button" type="button" data-action="cancel">Cancel</button>
        <button class="button" type="submit">Create</button>
      </div>
    </form>`;
}

function openDialog(maps: Record<string, MapFile>): string {
  const names = Object.keys(maps);
  const list = names.length
    ? names
        .map(
          (
            n,
          ) => `<button class="button editor-map-choice" type="submit" data-map="${escapeHtml(n)}">
            ${escapeHtml(maps[n].title)} <small>${escapeHtml(n)}.map · ${maps[n].size} ${maps[n].mode === "pvp" ? "PvP" : "Endless"}</small>
          </button>`,
        )
        .join("")
    : "<p>No maps in maps/ yet.</p>";
  return `
    <form class="window dialog-window start-window editor-form">
      <p class="dialog-title">Open a map</p>
      <div class="editor-map-list">${list}</div>
      <label class="field"><span>Or a .map file from this computer</span>
        <input type="file" accept=".map,.json,application/json" /></label>
      <div class="choices">
        <button class="button" type="button" data-action="cancel">Cancel</button>
      </div>
    </form>`;
}

function saveDialog(suggested: string): string {
  return `
    <form class="window dialog-window start-window editor-form">
      <p class="dialog-title">Save map</p>
      <label class="field"><span>File name (in maps/, a-z, 0-9 and dashes)</span>
        <input name="name" value="${escapeHtml(suggested)}" spellcheck="false" /></label>
      <div class="choices">
        <button class="button" type="button" data-action="cancel">Cancel</button>
        <button class="button" type="submit">Save</button>
      </div>
    </form>`;
}

export function field(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? "");
}

/**
 * Shows a dialog; submitting calls `onSubmit` (with the button pressed) and closes it, unless
 * that returns false. Cancel and Escape close it.
 */
export function showDialog(
  root: HTMLElement,
  html: string,
  onSubmit: (form: HTMLFormElement, button: HTMLElement | null) => void | false,
) {
  root.innerHTML = html;
  root.hidden = false;
  const form = root.querySelector("form")!;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const button = (e.submitter as HTMLElement | null) ?? null;
    if (onSubmit(form, button) !== false) close(root);
  });
  form.querySelector('[data-action="cancel"]')?.addEventListener("click", () => close(root));
  form.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(root);
    }
  });
  form.querySelector<HTMLInputElement>("input:not([type=radio])")?.focus();
}

export function close(root: HTMLElement): boolean {
  if (root.hidden) return false;
  root.hidden = true;
  root.innerHTML = "";
  return true;
}
