// A raider's HUD: which enemy they're in and its HP, the controls, or how long until they're
// back in one, and the menu for choosing which kind of enemy to be. Shown instead of the build
// HUD while this screen plays a raider.
import { ENEMY_KINDS, ENEMY_KIND_ORDER, TICK_RATE, type EnemyKindId } from "../sim/config";
import { ENEMY_COLOURS } from "../render/palette";
import type { Command, Enemy, GameState, PlayerId } from "../sim/types";
import type { UiState } from "./state";

/**
 * The raider's own enemy, as this screen draws it. Found by id: clients aren't told who controls
 * which enemy, so nothing on the map gives a raider away.
 */
export function ownEnemy(state: GameState, playerId: PlayerId): Enemy | undefined {
  const id = state.players[playerId]?.raid?.enemyId;
  return id === null || id === undefined
    ? undefined
    : state.enemies.find((e) => e.id === id && e.hp > 0);
}

export function isRaiding(state: GameState | null, playerId: PlayerId): boolean {
  return state?.players[playerId]?.role === "raider";
}

/** What the raider's HUD says. */
export function raiderLine(state: GameState, playerId: PlayerId): string {
  const enemy = ownEnemy(state, playerId);
  if (!enemy) {
    const ticks = state.players[playerId]?.raid?.respawnIn ?? 0;
    return ticks > 0 ? `Back in ${Math.ceil(ticks / TICK_RATE)}s` : "Waiting for an enemy...";
  }
  const kind = ENEMY_KINDS[enemy.kind];
  const variant =
    kind.variants.length > 1 ? `${kind.name} ${kind.variants[enemy.variant].name}` : kind.name;
  // In a stand-in until one of the kind they chose spawns.
  const chosen = state.players[playerId]?.raid?.kind;
  const name =
    chosen && chosen !== enemy.kind
      ? `${variant} (until a ${ENEMY_KINDS[chosen].name.toLowerCase()} spawns)`
      : variant;
  const controls = [
    "Hold click: move",
    "Click a target: attack",
    "Shift+click: add flag",
    "Alt+drag: paint path",
    "Alt+drag a path: rub out",
    "Backspace: clear paths",
    "Esc: stop, clear flags",
    "F / right-click: switch",
    "C: choose",
    "V: follow again",
  ];
  if (kind.behaviour === "bomber") controls.push("R: sprint", "Click yourself: blow up");
  if (kind.behaviour === "digger") controls[1] = "Click a wall: dig";
  return `${kind.glyph} ${name} · HP ${Math.max(0, Math.ceil(enemy.hp))} / ${enemy.maxHp} · ${controls.join(" · ")}`;
}

/**
 * The kinds of enemy on the map a raider could become, in roster order, with how many of each
 * there are. Not their own; clients aren't told which others are taken, so a kind whose only
 * ones are other raiders' is refused when chosen.
 */
export function kindsToBe(state: GameState, playerId: PlayerId): [EnemyKindId, number][] {
  const own = ownEnemy(state, playerId);
  const counts = new Map<EnemyKindId, number>();
  for (const e of state.enemies) {
    if (e.hp > 0 && e !== own) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  return ENEMY_KIND_ORDER.filter((k) => counts.has(k)).map((k) => [k, counts.get(k)!]);
}

export function createRaiderHud(
  root: HTMLElement,
  ui: UiState,
  dispatch: (command: Command) => void,
) {
  root.innerHTML = `
    <div class="raider-menu window" data-field="menu" hidden>
      <p class="dialog-title">Become one of these</p>
      <div class="raider-kinds" data-field="kinds"></div>
    </div>
    <div class="raider-bar">
      <span data-field="line"></span>
      <button class="button" data-action="choose">Choose (C)</button>
    </div>
  `;
  const line = root.querySelector<HTMLElement>('[data-field="line"]')!;
  const menu = root.querySelector<HTMLElement>('[data-field="menu"]')!;
  const kinds = root.querySelector<HTMLElement>('[data-field="kinds"]')!;
  const choose = root.querySelector<HTMLButtonElement>('[data-action="choose"]')!;
  choose.addEventListener("click", () => {
    choose.blur(); // so Space only ever toggles pause
    ui.raiderMenuOpen = !ui.raiderMenuOpen;
  });
  // One of the chosen kind, at random (the server picks).
  kinds.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-kind]");
    if (!button) return;
    dispatch({ type: "switchEnemy", kind: button.dataset.kind as EnemyKindId });
    ui.raiderMenuOpen = false;
  });
  let shownLine = "";
  let shownKinds = "";
  return {
    update(state: GameState | null, playerId: PlayerId) {
      const show = state !== null && isRaiding(state, playerId) && !state.gameOver;
      root.hidden = !show;
      if (!show) {
        ui.raiderMenuOpen = false;
        return;
      }
      const text = raiderLine(state, playerId);
      if (text !== shownLine) line.textContent = shownLine = text;
      menu.hidden = !ui.raiderMenuOpen;
      if (menu.hidden) return;
      const available = kindsToBe(state, playerId);
      const key = JSON.stringify(available);
      if (key === shownKinds) return;
      shownKinds = key;
      if (available.length === 0) {
        kinds.textContent = "No other enemies on the map yet.";
        return;
      }
      kinds.replaceChildren(
        ...available.map(([id, count]) => {
          const kind = ENEMY_KINDS[id];
          const button = document.createElement("button");
          button.className = "button raider-kind";
          button.dataset.kind = id;
          const glyph = document.createElement("span");
          glyph.className = "raider-glyph";
          glyph.style.color = ENEMY_COLOURS[id];
          glyph.textContent = kind.glyph;
          button.append(glyph, ` ${kind.name} ×${count}`);
          return button;
        }),
      );
    },
  };
}
