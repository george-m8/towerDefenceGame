// The online section of the panel: room code, invite link, connection status and players.
import type { GameState } from "../sim/types";
import { inviteLink } from "../net/join";
import { playerColour } from "../render/palette";
import type { NetworkSession } from "../net/networkSession";

/** Copies the room's invite link, or shows it when the clipboard isn't available. */
export async function copyInviteLink(button: HTMLButtonElement, room: string | null) {
  button.blur();
  if (!room) return;
  const link = inviteLink(location.origin, room);
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(link);
    button.textContent = "Copied!";
  } catch {
    // Clipboard needs a secure context (http on a LAN address isn't one): show it instead.
    window.prompt("Copy this invite link:", link);
  }
  setTimeout(() => (button.textContent = label), 1500);
}

export function createOnlinePanel(root: HTMLElement, session: NetworkSession) {
  root.hidden = false;
  root.innerHTML = `
    <dl class="stats">
      <dt>Room</dt><dd data-field="room">-</dd>
    </dl>
    <div class="actions">
      <button class="button" data-action="invite">Copy invite link</button>
    </div>
    <p class="status" data-field="status"></p>
    <ul class="players" data-field="players"></ul>
  `;
  const room = root.querySelector<HTMLElement>('[data-field="room"]')!;
  const status = root.querySelector<HTMLElement>('[data-field="status"]')!;
  const invite = root.querySelector<HTMLButtonElement>('[data-action="invite"]')!;
  const players = root.querySelector<HTMLElement>('[data-field="players"]')!;
  let lastPlayers = "";

  invite.addEventListener("click", () => copyInviteLink(invite, session.room));

  /** One row per player: colour, name, (you), dimmed when away, and their votes. */
  function renderPlayers(state: GameState) {
    const rows = Object.values(state.players).map((p) => ({
      id: p.id,
      name: p.name + (p.id === session.playerId ? " (you)" : ""),
      away: !p.connected,
      votes:
        (p.votes.pause ? " ||" : "") +
        (p.votes.fastForward ? " >>" : "") +
        (p.votes.skipToNight ? " ☾" : ""),
    }));
    const key = JSON.stringify(rows);
    if (key === lastPlayers) return; // only touch the DOM when something changed
    lastPlayers = key;
    players.replaceChildren(
      ...rows.map((row) => {
        const li = document.createElement("li");
        li.classList.toggle("away", row.away);
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = playerColour(row.id);
        li.append(swatch, `${row.name}${row.votes}`);
        li.title = row.away ? "Disconnected" : "";
        return li;
      }),
    );
  }

  return {
    update(state: GameState | null) {
      room.textContent = session.room ?? "-";
      invite.disabled = !session.room;
      status.textContent = session.status;
      if (state) renderPlayers(state);
    },
  };
}
