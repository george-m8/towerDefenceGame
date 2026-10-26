// The map editor's toolbar (SPEC-map-editor.md), laid out like the game's HUD: the picker with
// the build tabs (1-3) and the Map tab (4), the tool box, and the editor's own buttons; a title
// box at the top and a status line by the buttons.
import { STRUCTURES, TERRAIN } from "../sim/config";
import { terrainOf } from "../sim/mapFile";
import { COLOURS, GLYPHS, STRUCTURE_COLOURS, TERRAIN_STYLES } from "../render/palette";
import { BUILD_TABS, TOOLS, type BuildTab, type UiState } from "../ui/state";
import { MAP_ITEMS, itemName, toolName, type Editor, type MapItem } from "./editor";
import { CAN_SAVE, type FileActions } from "./files";

type PickerTab = BuildTab | "map";

export interface ToolbarActions {
  undo(): void;
  redo(): void;
  keepWalls(): void;
  play(): void;
}

/** A Map tab item's look in the picker: its glyph on its colour. */
function itemSwatch(item: MapItem): { glyph: string; fg: string; bg: string } {
  if (item === "keep") return { glyph: "♜", fg: COLOURS.keepGlyph, bg: COLOURS.keep };
  if (item === "spawn") return { glyph: "S", fg: COLOURS.spawnGlyph, bg: COLOURS.spawn };
  if (item === "ruin") {
    const { bg, fg } = STRUCTURE_COLOURS.ruin;
    return { glyph: GLYPHS.ruin, fg, bg };
  }
  if (item === "chest") return { glyph: "$", fg: COLOURS.chest, bg: COLOURS.ground };
  if (item === "ground") return { glyph: "", fg: "#ffffff", bg: COLOURS.ground };
  const style = TERRAIN_STYLES[item];
  return { glyph: style.glyph ?? "", fg: style.fg ?? "#ffffff", bg: style.bg };
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function createToolbar(
  root: HTMLElement,
  editor: Editor,
  ui: UiState,
  files: FileActions,
  actions: ToolbarActions,
) {
  const tabs: { tab: PickerTab; name: string; label: string }[] = [
    ...BUILD_TABS.map(({ tab, name, label }) => ({ tab, name, label })),
    { tab: "map", name: "Map", label: "4" },
  ];
  root.innerHTML = `
    <div class="overlay-box editor-title" data-field="title"></div>
    <p class="overlay-box editor-status" data-field="status"></p>
    <div class="hud editor-hud">
      <div class="hud-left">
        <div class="hud-picker tools" data-field="picker" hidden>
          <div class="build-tabs" role="tablist">
            ${tabs
              .map(
                (t) =>
                  `<button class="build-tab" role="tab" data-tab="${t.tab}">${t.name} <kbd>${t.label}</kbd></button>`,
              )
              .join("")}
          </div>
          ${TOOLS.filter((t) => t.tool !== "sell")
            .map(
              (t) => `
            <button class="tool" data-tool="${t.tool}" data-tab="${t.tab}">
              <span class="glyph">${GLYPHS[t.tool as keyof typeof GLYPHS]}</span>
              <span class="name">${STRUCTURES[t.tool as keyof typeof STRUCTURES].name}</span>
              <span></span><span></span>
            </button>`,
            )
            .join("")}
          ${MAP_ITEMS.map((item) => {
            const look = itemSwatch(item);
            return `
            <button class="tool" data-item="${item}" data-tab="map">
              <span class="glyph editor-swatch" style="background:${look.bg};color:${look.fg}">${look.glyph}</span>
              <span class="name">${itemName(item)}</span>
              <span></span><span></span>
            </button>`;
          }).join("")}
          <button class="tool" data-tool="sell" data-tab="all">
            <span class="glyph">✕</span><span class="name">Eraser</span><span></span><kbd>X</kbd>
          </button>
        </div>
        <button class="hud-box hud-tool" data-field="tool" title="Choose a tool (1-4)">
          <span class="hud-glyph" data-field="glyph"></span>
          <span data-field="name"></span>
          <span class="editor-amount" data-field="amount"></span>
        </button>
        <div class="hud-box hud-segment">
          <button class="hud-action" data-action="undo" title="Undo (Ctrl+Z)">Undo</button>
          <button class="hud-action" data-action="redo" title="Redo (Ctrl+Y)">Redo</button>
        </div>
        <button class="hud-box hud-action" data-action="walls"
          title="Rebuild the ring of walls and the gate round each keep">Keep walls</button>
      </div>
      <div class="hud-right editor-files">
        <div class="hud-box hud-segment">
          <button class="hud-action" data-action="new">New</button>
          <button class="hud-action" data-action="open">Open</button>
          ${CAN_SAVE ? '<button class="hud-action" data-action="save" title="Save into maps/">Save</button>' : ""}
          <button class="hud-action" data-action="download" title="Download a .map file">Download</button>
        </div>
        <a class="hud-box hud-action" href="?items-editor" title="What can be built, and how many (.items files)">Items</a>
        <button class="hud-box hud-action" data-action="play" title="Play this map (P)">Play</button>
      </div>
    </div>
  `;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const picker = field("picker");
  const button = (action: string) =>
    root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  let tab: PickerTab = "defence";

  const showTab = (next: PickerTab) => {
    tab = next;
    for (const b of picker.querySelectorAll<HTMLElement>("[data-tab]")) {
      if (b.classList.contains("build-tab")) {
        b.setAttribute("aria-selected", String(b.dataset.tab === tab));
      } else {
        b.hidden = b.dataset.tab !== "all" && b.dataset.tab !== tab;
      }
    }
  };
  showTab(tab);

  field("tool").addEventListener("click", () => {
    picker.hidden = !picker.hidden;
  });
  picker.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!target) return;
    if (target.classList.contains("build-tab")) return showTab(target.dataset.tab as PickerTab);
    if (target.dataset.item) {
      editor.item = target.dataset.item as MapItem;
      ui.tool = null;
    } else if (target.dataset.tool) {
      ui.tool = target.dataset.tool as UiState["tool"];
      editor.item = null;
    }
    picker.hidden = true;
  });
  document.addEventListener("mousedown", (e) => {
    if (!(e.target as HTMLElement).closest(".hud-left")) picker.hidden = true;
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") picker.hidden = true;
  });

  const on = (action: string, run: () => void) =>
    button(action)?.addEventListener("click", (e) => {
      (e.currentTarget as HTMLElement).blur(); // so Space and the like don't press it again
      run();
    });
  on("undo", actions.undo);
  on("redo", actions.redo);
  on("walls", actions.keepWalls);
  on("play", actions.play);
  on("new", () => files.newMap());
  on("open", () => files.open());
  on("save", () => files.save(editor.map));
  on("download", () => files.download(editor.map));

  const set = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text;
  };

  return {
    /** Called every frame while editing. */
    update(now: number) {
      // 1-3 (the game's keys) and 4 (the editor's) open the picker on their tab.
      if (ui.openPicker || editor.openMapTab) {
        showTab(editor.openMapTab ? "map" : ui.tab);
        ui.openPicker = false;
        editor.openMapTab = false;
        picker.hidden = false;
      }
      const map = editor.map;
      const dirty = files.dirty(map);
      const where = files.name ? `maps/${files.name}.map` : "not saved yet";
      const title = `${map.title}${dirty ? " •" : ""}`;
      const titleBox = field("title");
      const titleHtml = `<strong>${escapeHtml(title)}</strong> <span>${escapeHtml(where)} · ${map.size} ${map.mode === "pvp" ? "PvP" : "Endless"}</span>`;
      if (titleBox.dataset.html !== titleHtml) {
        titleBox.innerHTML = titleHtml;
        titleBox.dataset.html = titleHtml;
      }

      const glyph =
        ui.tool === "sell"
          ? "✕"
          : ui.tool !== null
            ? GLYPHS[ui.tool]
            : editor.item !== null
              ? itemSwatch(editor.item).glyph || "□"
              : "+";
      set(field("glyph"), glyph);
      set(field("name"), toolName(editor, ui));
      set(field("amount"), editor.amountLabel(ui));

      // Status: the hovered tile, the latest note, then what's wrong with the map.
      const hover = ui.hover;
      const tile =
        hover &&
        hover.x >= 0 &&
        hover.y >= 0 &&
        hover.x < editor.state.width &&
        hover.y < editor.state.height
          ? `${hover.x},${hover.y} ${TERRAIN[terrainOf(map, hover.x, hover.y)].name}`
          : "";
      const note = now < editor.noteUntil ? editor.note : "";
      const { errors, warnings } = editor.problems;
      const verdict =
        errors.length > 0
          ? `${errors.length} error${errors.length > 1 ? "s" : ""}: ${errors[0]}`
          : warnings.length > 0
            ? `Ready to play. ${warnings.length} warning${warnings.length > 1 ? "s" : ""}: ${warnings[0]}`
            : "Ready to play";
      const status = field("status");
      set(status, [tile, note, verdict].filter(Boolean).join("\n"));
      status.title = [...errors, ...warnings].join("\n");
      status.classList.toggle("has-errors", errors.length > 0);

      const play = button("play")!;
      play.disabled = errors.length > 0;
      play.title = errors.length > 0 ? `Fix first:\n${errors.join("\n")}` : "Play this map (P)";
      button("undo")!.disabled = !editor.history.canUndo;
      button("redo")!.disabled = !editor.history.canRedo;
    },
  };
}
