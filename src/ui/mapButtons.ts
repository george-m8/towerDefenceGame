// The buttons at the top left of the map. View and Debug each open a menu of toggles (View:
// the panels shown over the map; Debug: test options), switched on and off there; Journal
// opens the monster journal, and Settings the settings window. Menu and Settings buttons show
// as pressed while open.
import { KEYBOARD, keyAction, type KeyboardScheme } from "./controls";

/** One row of a toggle menu. */
export interface ToggleItem {
  label: string;
  isOn: () => boolean;
  toggle: () => void;
  /** Whether it's offered at all (Players only online); always, if left out. */
  available?: () => boolean;
}

/** A View menu row that shows and hides a panel over the map. */
export function panelToggle(
  label: string,
  element: HTMLElement,
  available?: () => boolean,
): ToggleItem {
  return {
    label,
    isOn: () => element.hidden !== true,
    toggle: () => (element.hidden = element.hidden !== true),
    available,
  };
}

export function createMapButtons(
  root: HTMLElement,
  options: {
    view: ToggleItem[];
    debug: ToggleItem[];
    settings: HTMLElement;
    /** Opens or closes the monster journal. */
    journal: () => void;
    /** The keyboard's bindings, with the player's remaps (the debug menu's key is one). */
    keyboard?: () => KeyboardScheme;
  },
) {
  root.innerHTML = `
    <div class="menu-anchor" data-menu="view">
      <button class="button map-toggle" title="Choose what to show over the map">View</button>
    </div>
    <button class="button map-toggle" data-action="journal" title="Monster journal (J)">Journal</button>
    <button class="button map-toggle" data-toggle="settings" title="Sound and other settings">Settings</button>
    <div class="menu-anchor" data-menu="debug">
      <button class="button map-toggle" title="Test options (\`)">Debug</button>
    </div>
  `;
  const { settings } = options;
  const settingsButton = root.querySelector<HTMLButtonElement>('[data-toggle="settings"]')!;
  const pressed = (button: HTMLButtonElement, on: boolean) =>
    button.setAttribute("aria-pressed", String(on));
  const showSettings = (open: boolean) => {
    settings.hidden = !open;
    pressed(settingsButton, open);
  };

  const menus = [
    toggleMenu(root.querySelector('[data-menu="view"]')!, options.view),
    toggleMenu(root.querySelector('[data-menu="debug"]')!, options.debug),
  ];
  const [, debugMenu] = menus;
  /** Opening one menu (or the settings window) closes the others. */
  const closeMenus = (except?: (typeof menus)[number]) => {
    for (const menu of menus) if (menu !== except) menu.show(false);
  };
  for (const menu of menus) menu.onOpen = () => closeMenus(menu);

  const journalButton = root.querySelector<HTMLButtonElement>('[data-action="journal"]')!;
  journalButton.addEventListener("click", () => {
    closeMenus();
    options.journal();
    journalButton.blur();
  });
  settingsButton.addEventListener("click", () => {
    showSettings(settings.hidden === true);
    closeMenus();
    settingsButton.blur();
  });
  showSettings(false);

  // A menu closes on a click anywhere else. The settings window closes from its Close button,
  // a click outside it, or Esc.
  document.addEventListener("pointerdown", (e) => {
    const anchor = (e.target as HTMLElement).closest(".menu-anchor");
    for (const menu of menus) if (menu.anchor !== anchor) menu.show(false);
  });
  settings
    .querySelector('[data-action="close-settings"]')
    ?.addEventListener("click", () => showSettings(false));
  settings.addEventListener("pointerdown", (e) => {
    if (e.target === settings) showSettings(false);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !settings.hidden) showSettings(false);
    // ` opens and closes the debug menu (not while typing a name or code). D is for panning.
    if (
      keyAction(options.keyboard?.() ?? KEYBOARD, e.code) === "debugMenu" &&
      !(e.target instanceof HTMLInputElement)
    ) {
      debugMenu.show(debugMenu.menu.hidden === true);
    }
  });
}

/** A button with a menu of toggle rows under it; the menu stays open while rows are toggled. */
function toggleMenu(anchor: HTMLElement, items: ToggleItem[]) {
  const button = anchor.querySelector("button")!;
  const menu = document.createElement("div");
  menu.className = "hud-picker tools toggle-menu";
  menu.hidden = true;
  anchor.append(menu);

  const rows = items.map((item) => {
    const row = document.createElement("button");
    row.className = "tool toggle-choice";
    row.textContent = item.label;
    row.addEventListener("click", () => {
      item.toggle();
      sync();
      row.blur();
    });
    menu.append(row);
    return { item, row };
  });
  /** Each row lit when it's on, and only offered when it's available. */
  const sync = () => {
    for (const { item, row } of rows) {
      row.classList.toggle("selected", item.isOn());
      row.hidden = item.available ? !item.available() : false;
    }
  };

  const self = {
    anchor,
    menu,
    onOpen: () => {},
    show(open: boolean) {
      if (open) {
        sync();
        self.onOpen();
      }
      menu.hidden = !open;
      button.setAttribute("aria-pressed", String(open));
    },
  };
  button.addEventListener("click", () => {
    self.show(menu.hidden === true);
    button.blur(); // so Space only ever toggles pause
  });
  self.show(false);
  return self;
}
