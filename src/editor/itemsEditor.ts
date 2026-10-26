// The items editor page (?items-editor; SPEC-items-editor.md): which structures players may
// build, and how many of each they can have standing at once, saved as an `.items` file in
// items/. A list, not a map: one row per buildable structure, grouped by the build picker's tabs.
// Save writes through the dev server (tools/items.ts), like the map editor's; Download works
// anywhere, and Play tries the limits out in a solo Endless game.
import bundledItems from "virtual:items";
import { STRUCTURES } from "../sim/config";
import {
  ITEMS_NAME_PATTERN,
  MAX_ITEM_LIMIT,
  itemsName,
  newItems,
  parseItems,
  serializeItems,
  withLimit,
  type ItemsFile,
} from "../sim/itemsFile";
import type { StructureKind } from "../sim/types";
import { GLYPHS } from "../render/palette";
import { BUILD_TABS, TOOLS, isBuildTool } from "../ui/state";
import type { MapChoice } from "../ui/startScreen";
import {
  CAN_SAVE,
  close,
  downloadText,
  escapeHtml,
  field,
  listFiles,
  saveToServer,
  showDialog,
} from "./files";

/** Where Save sends an items file (tools/items.ts). */
const ENDPOINT = "/__items";

/** What a row's two inputs say, as a limit: 0 not allowed, a number, or undefined for none. */
export function limitFromInputs(allowed: boolean, max: string): number | undefined {
  if (!allowed) return 0;
  const n = Math.round(Number(max));
  if (max.trim() === "" || !Number.isFinite(n) || n < 1) return undefined;
  return Math.min(MAX_ITEM_LIMIT, n);
}

/** A limit as a row's two inputs: allowed or not, and the max (blank for no limit). */
export function inputsFromLimit(limit: number | undefined): { allowed: boolean; max: string } {
  if (limit === 0) return { allowed: false, max: "" };
  return { allowed: true, max: limit === undefined ? "" : String(limit) };
}

/** One line on what the file does: "2 limited, 1 not allowed", or that it does nothing. */
export function summary(items: ItemsFile): string {
  const limits = Object.values(items.limits);
  const banned = limits.filter((l) => l === 0).length;
  const capped = limits.length - banned;
  if (limits.length === 0) return "Everything can be built, as many as you like";
  return [capped > 0 ? `${capped} limited` : "", banned > 0 ? `${banned} not allowed` : ""]
    .filter(Boolean)
    .join(", ");
}

/** An items file's text, parsed. */
export function readItemsText(text: string): { items: ItemsFile } | { error: string } {
  try {
    return parseItems(JSON.parse(text));
  } catch {
    return { error: "it isn't an items file (not JSON)" };
  }
}

export interface ItemsEditor {
  readonly items: ItemsFile;
  /** True when the file has changed since it was opened or saved. */
  dirty(): boolean;
  /** Escape: closes the open dialog, if there is one. */
  close(): boolean;
}

export function createItemsEditor(
  root: HTMLElement,
  dialog: HTMLElement,
  start: { name: string | null; items: ItemsFile },
  options: {
    /** Maps Play can use, besides a generated one. */
    maps: MapChoice[];
    play: (items: ItemsFile, map: string | undefined) => void;
  },
): ItemsEditor {
  let items = start.items;
  let name = start.name;
  let saved = serializeItems(items);
  let note = "";

  const rows = TOOLS.filter((t) => isBuildTool(t.tool));
  root.innerHTML = `
    <form class="window dialog-window start-window editor-form items-window">
      <p class="dialog-title">Items editor</p>
      <label class="field"><span>Title</span>
        <input name="title" maxlength="40" spellcheck="false" /></label>
      <p class="items-where" data-field="where"></p>
      <div class="items-list">
        ${BUILD_TABS.map(
          (tab) => `
          <p class="items-tab">${tab.name}</p>
          ${rows
            .filter((t) => t.tab === tab.tab)
            .map((t) => {
              const kind = t.tool as StructureKind;
              return `
            <div class="items-row" data-kind="${kind}">
              <span class="glyph">${GLYPHS[kind]}</span>
              <span class="name">${STRUCTURES[kind].name}</span>
              <span class="cost">${STRUCTURES[kind].cost}g</span>
              <label class="items-allowed"><input type="checkbox" data-input="allowed" /> Allowed</label>
              <label class="items-max">Max at once
                <input type="number" min="1" max="${MAX_ITEM_LIMIT}" placeholder="∞" data-input="max" /></label>
            </div>`;
            })
            .join("")}`,
        ).join("")}
      </div>
      <p class="items-status" data-field="status"></p>
      <label class="field"><span>Play on</span>
        <select name="map">
          <option value="">Random</option>
          ${options.maps
            .map(
              (m) =>
                `<option value="${escapeHtml(m.name)}">${escapeHtml(m.title)} (${m.size})</option>`,
            )
            .join("")}
        </select>
      </label>
      <div class="choices">
        <button class="button" type="button" data-action="new">New</button>
        <button class="button" type="button" data-action="open">Open</button>
        ${CAN_SAVE ? '<button class="button" type="button" data-action="save">Save</button>' : ""}
        <button class="button" type="button" data-action="download">Download</button>
        <button class="button" type="button" data-action="play">Play</button>
        <a class="button" href="?editor" title="The map editor (.map files)">Maps</a>
      </div>
    </form>`;
  const form = root.querySelector("form")!;
  const titleInput = form.querySelector<HTMLInputElement>('input[name="title"]')!;
  const box = (name: string) => form.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const rowInputs = (row: HTMLElement) => ({
    allowed: row.querySelector<HTMLInputElement>('[data-input="allowed"]')!,
    max: row.querySelector<HTMLInputElement>('[data-input="max"]')!,
  });

  /** Puts the file's values in the inputs (after New or Open). */
  function fill() {
    titleInput.value = items.title;
    for (const row of form.querySelectorAll<HTMLElement>(".items-row")) {
      const { allowed, max } = rowInputs(row);
      const shown = inputsFromLimit(items.limits[row.dataset.kind as StructureKind]);
      allowed.checked = shown.allowed;
      max.value = shown.max;
    }
    refresh();
  }

  /** The title, the row states and the status line, as the file is now. */
  function refresh() {
    for (const row of form.querySelectorAll<HTMLElement>(".items-row")) {
      const { allowed, max } = rowInputs(row);
      max.disabled = !allowed.checked;
      row.classList.toggle("banned", !allowed.checked);
    }
    const where = name ? `items/${name}.items` : "not saved yet";
    box("where").textContent = `${where}${editor.dirty() ? " •" : ""}`;
    box("status").textContent = note || summary(items);
  }

  const say = (message: string) => {
    note = message;
    refresh();
  };
  const load = (next: ItemsFile, nextName: string | null) => {
    items = next;
    name = nextName;
    saved = serializeItems(next);
    note = "";
    fill();
  };
  const discardOk = () =>
    !editor.dirty() || window.confirm("Throw away the changes you haven't saved?");

  form.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target === titleInput) {
      items = { ...items, title: titleInput.value };
    } else {
      const row = target.closest<HTMLElement>(".items-row");
      if (!row) return;
      const { allowed, max } = rowInputs(row);
      items = withLimit(
        items,
        row.dataset.kind as StructureKind,
        limitFromInputs(allowed.checked, max.value),
      );
    }
    note = "";
    refresh();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  const on = (action: string, run: () => void) =>
    form.querySelector(`[data-action="${action}"]`)?.addEventListener("click", run);
  on("new", () => {
    if (discardOk()) load(newItems("Untitled"), null);
  });
  on("open", () => {
    if (!discardOk()) return;
    void listFiles(ENDPOINT, bundledItems).then((files) => {
      showDialog(dialog, openDialog(files), (_form, button) => {
        const chosen = button?.dataset.items;
        if (chosen && files[chosen]) load(files[chosen], chosen);
      });
      const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        void file.text().then((text) => {
          const result = readItemsText(text);
          if ("error" in result) return say(`Couldn't open ${file.name}: ${result.error}`);
          close(dialog);
          load(result.items, null);
        });
      });
    });
  });
  on("save", () => {
    const write = (target: string) =>
      void saveToServer(ENDPOINT, target, serializeItems(items)).then((error) => {
        if (error) return say(`Not saved: ${error}`);
        name = target;
        saved = serializeItems(items);
        say(`Saved items/${target}.items`);
      });
    if (name) return write(name);
    showDialog(dialog, saveDialog(itemsName(items.title)), (dialogForm) => {
      const target = field(dialogForm, "name").trim();
      if (!ITEMS_NAME_PATTERN.test(target)) {
        say("A file name is a-z, 0-9 and dashes");
        return false;
      }
      write(target);
    });
  });
  on("download", () =>
    downloadText(serializeItems(items), `${name ?? itemsName(items.title)}.items`),
  );
  on("play", () => options.play(items, field(form, "map") || undefined));

  const editor: ItemsEditor = {
    get items() {
      return items;
    },
    dirty: () => serializeItems(items) !== saved,
    close: () => close(dialog),
  };
  window.addEventListener("beforeunload", (e) => {
    if (editor.dirty()) e.preventDefault();
  });
  fill();
  return editor;
}

function openDialog(files: Record<string, ItemsFile>): string {
  const names = Object.keys(files);
  const list = names.length
    ? names
        .map(
          (
            n,
          ) => `<button class="button editor-map-choice" type="submit" data-items="${escapeHtml(n)}">
            ${escapeHtml(files[n].title)} <small>${escapeHtml(n)}.items · ${escapeHtml(summary(files[n]))}</small>
          </button>`,
        )
        .join("")
    : "<p>No items files in items/ yet.</p>";
  return `
    <form class="window dialog-window start-window editor-form">
      <p class="dialog-title">Open an items file</p>
      <div class="editor-map-list">${list}</div>
      <label class="field"><span>Or an .items file from this computer</span>
        <input type="file" accept=".items,.json,application/json" /></label>
      <div class="choices">
        <button class="button" type="button" data-action="cancel">Cancel</button>
      </div>
    </form>`;
}

function saveDialog(suggested: string): string {
  return `
    <form class="window dialog-window start-window editor-form">
      <p class="dialog-title">Save items</p>
      <label class="field"><span>File name (in items/, a-z, 0-9 and dashes)</span>
        <input name="name" value="${escapeHtml(suggested)}" spellcheck="false" /></label>
      <div class="choices">
        <button class="button" type="button" data-action="cancel">Cancel</button>
        <button class="button" type="submit">Save</button>
      </div>
    </form>`;
}
