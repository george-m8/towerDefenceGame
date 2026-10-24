import type { GameState } from "../sim/types";

export function createPanel(root: HTMLElement) {
  root.innerHTML = `
    <dl class="stats">
      <dt>Gold</dt><dd data-stat="gold"></dd>
      <dt>Keep</dt><dd data-stat="keep"></dd>
      <dt>Tick</dt><dd data-stat="tick"></dd>
    </dl>
    <p class="status" data-stat="status"></p>
  `;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-stat="${name}"]`)!;
  const gold = field("gold");
  const keep = field("keep");
  const tickCount = field("tick");
  const status = field("status");

  return {
    update(state: GameState) {
      gold.textContent = String(state.gold);
      keep.textContent = `${state.keep.hp} / ${state.keep.maxHp}`;
      tickCount.textContent = String(state.tick);
      status.textContent = state.paused ? "PAUSED - press Space" : "";
    },
  };
}
