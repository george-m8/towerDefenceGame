// A dialog for problems joining a room, with ways out.
export function showNotice(root: HTMLElement, message: string) {
  root.innerHTML = `
    <div class="window dialog-window">
      <p class="dialog-title">Can't join</p>
      <p data-field="message"></p>
      <p><a class="button" href="/">Back to start</a> <a class="button" href="/?solo">Play solo</a></p>
    </div>
  `;
  root.querySelector<HTMLElement>('[data-field="message"]')!.textContent = message;
  root.hidden = false;
}
