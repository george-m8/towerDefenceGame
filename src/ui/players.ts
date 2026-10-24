// The online section of the panel: room code, invite link and connection status.
import type { GameState } from "../sim/types";
import { inviteLink } from "../net/join";
import type { NetworkSession } from "../net/networkSession";

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
  `;
  const room = root.querySelector<HTMLElement>('[data-field="room"]')!;
  const status = root.querySelector<HTMLElement>('[data-field="status"]')!;
  const invite = root.querySelector<HTMLButtonElement>('[data-action="invite"]')!;

  invite.addEventListener("click", async () => {
    invite.blur();
    if (!session.room) return;
    const link = inviteLink(location.origin, session.room);
    try {
      await navigator.clipboard.writeText(link);
      invite.textContent = "Copied!";
    } catch {
      // Clipboard needs a secure context (http on a LAN address isn't one): show it instead.
      window.prompt("Copy this invite link:", link);
    }
    setTimeout(() => (invite.textContent = "Copy invite link"), 1500);
  });

  return {
    update(_state: GameState | null) {
      room.textContent = session.room ?? "-";
      invite.disabled = !session.room;
      status.textContent = session.status;
    },
  };
}
