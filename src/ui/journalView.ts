// The monster journal window: every kind in roster order, found or locked. The game keeps
// running underneath (online games can't pause for one player).
import { ENEMY_COLOURS } from "../render/palette";
import { ENEMY_KIND_ORDER, ENEMY_KINDS } from "../sim/config";
import { emptyJournal, entryLines, foundCount, type Journal } from "./journal";

export function createJournalView(root: HTMLElement, journal: Journal, onForget: () => void) {
  root.innerHTML = `
    <div class="window dialog-window journal-window">
      <p class="dialog-title">Monster journal</p>
      <p class="journal-count" data-field="count"></p>
      <ul class="journal-list" data-field="list"></ul>
      <p class="journal-actions" data-field="actions">
        <button class="button" data-action="forget">Forget</button>
        <button class="button" data-action="close">Close</button>
      </p>
      <p class="journal-actions" data-field="confirm" hidden>
        Forget everything found?
        <button class="button" data-action="forget-yes">Yes</button>
        <button class="button" data-action="forget-no">No</button>
      </p>
    </div>
  `;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const count = field("count");
  const list = field("list");
  const actions = field("actions");
  const confirm = field("confirm");
  const showConfirm = (on: boolean) => {
    actions.hidden = on;
    confirm.hidden = !on;
  };

  function render() {
    count.textContent = foundCount(journal);
    list.replaceChildren(
      ...ENEMY_KIND_ORDER.map((kind) => {
        const found = journal.found[kind] !== undefined;
        const [title, ...rest] = entryLines(kind, journal);
        const item = document.createElement("li");
        item.className = found ? "journal-entry" : "journal-entry locked";
        const glyph = document.createElement("span");
        glyph.className = "journal-glyph";
        glyph.textContent = found ? ENEMY_KINDS[kind].glyph : "?";
        if (found) glyph.style.color = ENEMY_COLOURS[kind];
        const text = document.createElement("div");
        const name = document.createElement("p");
        name.className = "journal-name";
        name.textContent = title;
        text.append(
          name,
          ...rest.map((line) => Object.assign(document.createElement("p"), { textContent: line })),
        );
        item.append(glyph, text);
        return item;
      }),
    );
  }

  const view = {
    get isOpen() {
      return !root.hidden;
    },
    open() {
      showConfirm(false);
      render();
      root.hidden = false;
    },
    close() {
      root.hidden = true;
    },
    toggle() {
      if (view.isOpen) view.close();
      else view.open();
    },
    /** Redraws if open (after a new kind is found). */
    refresh() {
      if (view.isOpen) render();
    },
  };

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    target.closest("button")?.blur();
    if (target === root) view.close(); // a click on the backdrop
    switch (target.closest<HTMLElement>("[data-action]")?.dataset.action) {
      case "close":
        view.close();
        break;
      case "forget":
        showConfirm(true);
        break;
      case "forget-no":
        showConfirm(false);
        break;
      case "forget-yes":
        journal.found = emptyJournal().found;
        onForget();
        showConfirm(false);
        render();
        break;
    }
  });

  return view;
}
