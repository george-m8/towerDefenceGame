// The start page: your name, then play solo, create a room, or join one by code.
import { ROOM_CODE_LENGTH } from "../net/protocol";
import { cleanName } from "../net/join";
import type { PageIntent } from "../net/join";

const NAME_KEY = "keep-defence-name";

/** The name this device used last time, if any. */
export function rememberedName(): string | null {
  try {
    return cleanName(localStorage.getItem(NAME_KEY));
  } catch {
    return null; // storage blocked: just ask again
  }
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // not remembered; harmless
  }
}

/** Shows the start screen in `root` and calls `onChoose` once with the player's choice. */
export function showStartScreen(
  root: HTMLElement,
  options: { room?: string; onChoose: (intent: Exclude<PageIntent, { mode: "menu" }>) => void },
) {
  root.innerHTML = `
    <div class="window dialog-window start-window">
      <p class="dialog-title">Keep Defence</p>
      <label class="field">
        <span>Your name</span>
        <input name="name" maxlength="16" autocomplete="nickname" spellcheck="false" />
      </label>
      <div class="choices">
        <button class="button" data-action="solo">Play solo</button>
        <button class="button" data-action="create">Create room</button>
      </div>
      <form class="join-form">
        <label class="field">
          <span>Room code</span>
          <input name="room" maxlength="${ROOM_CODE_LENGTH}" autocomplete="off" spellcheck="false" placeholder="ABCD" />
        </label>
        <button class="button" type="submit">Join</button>
      </form>
    </div>
  `;
  const nameInput = root.querySelector<HTMLInputElement>('input[name="name"]')!;
  const roomInput = root.querySelector<HTMLInputElement>('input[name="room"]')!;
  const solo = root.querySelector<HTMLButtonElement>('[data-action="solo"]')!;
  const create = root.querySelector<HTMLButtonElement>('[data-action="create"]')!;
  const form = root.querySelector<HTMLFormElement>(".join-form")!;
  const join = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  nameInput.value = rememberedName() ?? "";
  roomInput.value = options.room ?? "";

  const name = () => cleanName(nameInput.value);
  const room = () => roomInput.value;
  const refresh = () => {
    const named = name() !== null;
    solo.disabled = !named;
    create.disabled = !named;
    join.disabled = !named || room().length !== ROOM_CODE_LENGTH;
  };

  // Room codes are letters only; show them as the server expects.
  roomInput.addEventListener("input", () => {
    roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z]/g, "");
    refresh();
  });
  nameInput.addEventListener("input", refresh);

  const choose = (intent: Exclude<PageIntent, { mode: "menu" }>) => {
    const chosen = name();
    if (!chosen) return;
    rememberName(chosen);
    root.hidden = true;
    options.onChoose(intent);
  };
  solo.addEventListener("click", () => choose({ mode: "offline" }));
  create.addEventListener("click", () => choose({ mode: "create", name: name()! }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!join.disabled) choose({ mode: "join", room: room(), name: name()! });
  });

  refresh();
  root.hidden = false;
  // Invite links arrive with a code: the name is all that's left to fill in.
  (options.room && name() ? join : nameInput).focus();
}
