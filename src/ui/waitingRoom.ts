// The waiting room: who's in, the invite link, and the host's Start button.
import { FLOOD } from "../sim/config";
import { GAME_MODES } from "./startScreen";
import type { GameState } from "../sim/types";
import { playerName } from "../sim/players";
import type { NetworkSession } from "../net/networkSession";
import { playerColour } from "../render/palette";
import { copyInviteLink } from "./players";

export function createWaitingRoom(root: HTMLElement, session: NetworkSession) {
  root.innerHTML = `
    <div class="window dialog-window">
      <p class="dialog-title">Waiting room</p>
      <p>Room <strong data-field="room"></strong> · <span data-field="mode"></span></p>
      <button class="button" data-action="invite">Copy invite link</button>
      <ul class="players waiting-players" data-field="players"></ul>
      <button class="button" data-action="role" hidden></button>
      <button class="button" data-action="start">Start game</button>
      <p data-field="waiting"></p>
    </div>
  `;
  const room = root.querySelector<HTMLElement>('[data-field="room"]')!;
  const mode = root.querySelector<HTMLElement>('[data-field="mode"]')!;
  const players = root.querySelector<HTMLElement>('[data-field="players"]')!;
  const waiting = root.querySelector<HTMLElement>('[data-field="waiting"]')!;
  const invite = root.querySelector<HTMLButtonElement>('[data-action="invite"]')!;
  const start = root.querySelector<HTMLButtonElement>('[data-action="start"]')!;
  const role = root.querySelector<HTMLButtonElement>('[data-action="role"]')!;
  let lastPlayers = "";
  let raiding = false;

  invite.addEventListener("click", () => copyInviteLink(invite, session.room));
  start.addEventListener("click", () => session.start());
  // Raiders play the enemy: Endless only, picked before the game starts.
  role.addEventListener("click", () => session.setRole(raiding ? "defender" : "raider"));

  return {
    update(state: GameState | null) {
      const lobby = session.lobby;
      const show = state !== null && lobby !== null && !lobby.started;
      root.hidden = !show;
      if (!show) return;
      room.textContent = session.room ?? "";
      const isHost = lobby.host === session.playerId;
      const pvp = lobby.mode === "pvp";
      const flood = lobby.mode === "flood";
      mode.textContent = GAME_MODES.find((m) => m.mode === lobby.mode)?.name ?? "Endless";
      start.hidden = !isHost;
      raiding = state.players[session.playerId]?.role === "raider";
      // Raiders are Endless's (and PvP's players are both defenders).
      role.hidden = pvp || flood;
      role.textContent = raiding ? "Play as a defender instead" : "Play as a raider (the enemy)";
      // PvP is one against one: the host can only start once the rival is in.
      const inRoom = Object.values(state.players).filter((p) => p.connected).length;
      start.disabled = pvp && inRoom !== 2;
      waiting.textContent = isHost
        ? pvp
          ? inRoom === 2
            ? "Your rival is here. Start when ready."
            : "Waiting for a rival to join..."
          : "Start when everyone is in."
        : `Waiting for ${lobby.host === null ? "the host" : playerName(state, lobby.host)} to start...`;

      // No looking back: the royal each will lead, by when they joined (as assignRoyals hands
      // them out).
      const ids = Object.keys(state.players)
        .map(Number)
        .sort((a, b) => a - b);
      const royalOf = (id: number) => (flood ? ` - the ${FLOOD.titles[ids.indexOf(id)]}` : "");
      const rows = Object.values(state.players)
        .filter((p) => p.connected)
        .map((p) => ({
          id: p.id,
          label: `${p.name}${p.id === session.playerId ? " (you)" : ""}${p.id === lobby.host ? " - host" : ""}${p.role === "raider" ? " - raider" : ""}${royalOf(p.id)}`,
        }));
      const key = JSON.stringify(rows);
      if (key === lastPlayers) return;
      lastPlayers = key;
      players.replaceChildren(
        ...rows.map((row) => {
          const li = document.createElement("li");
          const swatch = document.createElement("span");
          swatch.className = "swatch";
          swatch.style.background = playerColour(row.id);
          li.append(swatch, row.label);
          return li;
        }),
      );
    },
  };
}
