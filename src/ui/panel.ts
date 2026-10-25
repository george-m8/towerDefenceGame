import { SELL_REFUND, STRUCTURES, TICK_RATE } from "../sim/config";
import { incomePerMinute } from "../sim/economy";
import type { Command, GameState } from "../sim/types";
import { ARROW_SYMBOLS, GLYPHS, glyphFor } from "../render/palette";
import { TOOLS, isBuildTool, type UiState } from "./state";
import { describeTile, priceLine } from "./tileInfo";
import { priceAt } from "../sim/enclosures";
import { hasVoted, voteLabel } from "./votes";

export function createPanel(root: HTMLElement, ui: UiState, dispatch: (command: Command) => void) {
  root.innerHTML = `
    <dl class="stats">
      <dt>Gold</dt><dd data-stat="gold"></dd>
      <dt>Income</dt><dd data-stat="income"></dd>
      <dt>Keep</dt><dd data-stat="keep"></dd>
      <dt data-label="wave">Wave</dt><dd data-stat="wave"></dd>
      <dt data-label="next">Next</dt><dd data-stat="next"></dd>
      <dt>Seed</dt><dd data-stat="seed"></dd>
    </dl>
    <div class="actions">
      <button class="button" data-action="sendWave">Send wave</button>
      <button class="button" data-action="pause">Pause</button>
      <button class="button" data-action="fastForward" title="Fast forward (F)">&gt;&gt;</button>
    </div>
    <h2 class="section">Build</h2>
    <div class="tools">
      ${TOOLS.map(
        (t) => `
        <button class="tool" data-tool="${t.tool}">
          <span class="glyph">${isBuildTool(t.tool) ? GLYPHS[t.tool] : "$"}</span>
          <span class="name">${isBuildTool(t.tool) ? STRUCTURES[t.tool].name : "Sell"}</span>
          <span class="cost">${isBuildTool(t.tool) ? `${STRUCTURES[t.tool].cost}g` : `${SELL_REFUND * 100}%`}</span>
          <kbd>${t.label}</kbd>
        </button>`,
      ).join("")}
    </div>
    <p class="status" data-stat="status"></p>
    <h2 class="section">Info</h2>
    <p class="info" data-stat="info"></p>
    <p class="help">Space pause · F fast · R rotate · D paths · Esc cancel · drag to paint · arrows move · wheel or +/- zoom</p>
  `;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-stat="${name}"]`)!;
  const gold = field("gold");
  const income = field("income");
  const keep = field("keep");
  const wave = field("wave");
  const next = field("next");
  const seed = field("seed");
  const waveLabel = root.querySelector<HTMLElement>('[data-label="wave"]')!;
  const nextLabel = root.querySelector<HTMLElement>('[data-label="next"]')!;
  const status = field("status");
  const info = field("info");
  const sendWaveButton = root.querySelector<HTMLButtonElement>('[data-action="sendWave"]')!;
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  const fastForwardButton = root.querySelector<HTMLButtonElement>('[data-action="fastForward"]')!;
  const toolButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-tool]")];

  // Drop focus after a click so Space only ever toggles pause, never re-presses a button.
  root.addEventListener("click", (e) => {
    (e.target as HTMLElement).closest("button")?.blur();
  });
  sendWaveButton.addEventListener("click", () => dispatch({ type: "sendWave" }));
  pauseButton.addEventListener("click", () => dispatch({ type: "togglePause" }));
  fastForwardButton.addEventListener("click", () => dispatch({ type: "toggleFastForward" }));
  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool as UiState["tool"];
      ui.tool = ui.tool === tool ? null : tool;
    });
  }

  return {
    update(state: GameState) {
      const player = state.players[ui.playerId];
      gold.textContent = String(player.gold);
      income.textContent = `+${incomePerMinute(state, ui.playerId)}/min`;
      const mine = state.keeps.find((k) => k.owner === ui.playerId) ?? state.keeps[0];
      keep.textContent = `${mine.hp} / ${mine.maxHp}`;
      seed.textContent = String(state.seed);
      const spawning = state.wave.toSpawn > 0;
      if (state.mode === "pvp") {
        // No waves: show the rival's keep instead.
        const rival = state.keeps.find((k) => k !== mine);
        waveLabel.textContent = "Rival";
        wave.textContent = rival ? `${rival.hp} / ${rival.maxHp}` : "-";
        nextLabel.textContent = "Mode";
        next.textContent = "PvP";
      } else {
        wave.textContent = String(state.wave.number);
        next.textContent = spawning
          ? "incoming!"
          : `${Math.ceil(state.wave.countdown / TICK_RATE)}s`;
      }
      sendWaveButton.disabled = spawning || state.gameOver || state.mode === "pvp";
      // With several players these are votes: show yours, and how many have voted.
      pauseButton.textContent = state.paused ? "Resume" : voteLabel(state, "pause", "Pause");
      pauseButton.classList.toggle(
        "selected",
        !state.paused && hasVoted(state, ui.playerId, "pause"),
      );
      fastForwardButton.textContent = voteLabel(state, "fastForward", ">>");
      fastForwardButton.classList.toggle("selected", hasVoted(state, ui.playerId, "fastForward"));
      for (const button of toolButtons) {
        const tool = button.dataset.tool as UiState["tool"];
        // Arrow-drawn tools (wall spikes, archers) show the way they'll face (R rotates).
        if (isBuildTool(tool) && ARROW_SYMBOLS[tool]) {
          const glyph = button.querySelector<HTMLElement>(".glyph")!;
          const arrow = glyphFor(tool, ui.facing);
          if (glyph.textContent !== arrow) glyph.textContent = arrow;
        }
        button.classList.toggle("selected", tool === ui.tool);
        // Affordable here, if hovering a tile (enclosures make some tiles cheaper).
        const price = isBuildTool(tool)
          ? ui.hover
            ? priceAt(state, tool, ui.hover.x, ui.hover.y, ui.playerId)
            : STRUCTURES[tool].cost
          : 0;
        button.disabled = isBuildTool(tool) && player.gold < price;
      }
      const hoverLines = ui.hover ? describeTile(state, ui.hover, ui.playerId) : [];
      if (ui.hover && isBuildTool(ui.tool)) {
        hoverLines.unshift(priceLine(state, ui.tool, ui.hover, ui.playerId));
      }
      info.textContent = hoverLines.join("\n");
      if (performance.now() < ui.messageUntil) status.textContent = ui.message;
      else status.textContent = state.paused ? "PAUSED - press Space" : "";
    },
  };
}
