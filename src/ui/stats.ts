// The game's stats (gold, income, keep, waves...) as label and value, for the sidebar and the
// HUD's stat box. PvP has no waves: it shows the rival's keep and the mode instead. With enemies
// at night, the wave stat shows the night too, and by day the next wave is "At dusk".
import { TICK_RATE } from "../sim/config";
import { incomePerMinute } from "../sim/economy";
import { isSpawningTime } from "../sim/clock";
import type { GameState, PlayerId } from "../sim/types";

export type StatId = "gold" | "income" | "keep" | "wave" | "next" | "rival" | "mode" | "seed";

export interface Stat {
  id: StatId;
  label: string;
  value: string;
}

export function statList(state: GameState, playerId: PlayerId): Stat[] {
  const gold = state.players[playerId]?.gold ?? 0;
  const mine = state.keeps.find((k) => k.owner === playerId) ?? state.keeps[0];
  const stats: Stat[] = [
    { id: "gold", label: "Gold", value: state.debug.infiniteGold ? "∞" : String(gold) },
    { id: "income", label: "Income", value: `+${incomePerMinute(state, playerId)}/min` },
    { id: "keep", label: "Keep", value: `${mine.hp} / ${mine.maxHp}` },
  ];
  if (state.mode === "pvp") {
    const rival = state.keeps.find((k) => k !== mine);
    stats.push(
      { id: "rival", label: "Rival", value: rival ? `${rival.hp} / ${rival.maxHp}` : "-" },
      { id: "mode", label: "Mode", value: "PvP" },
    );
  } else {
    const spawning = state.wave.threatLeft > 0;
    const night = state.enemiesCome === "night" && state.clock ? state.clock.day : null;
    stats.push(
      night === null
        ? { id: "wave", label: "Wave", value: String(state.wave.number) }
        : { id: "wave", label: "Night", value: `${night} · wave ${state.wave.number}` },
      {
        id: "next",
        label: "Next",
        value: spawning
          ? "incoming!"
          : !isSpawningTime(state)
            ? "At dusk"
            : `${Math.ceil(state.wave.countdown / TICK_RATE)}s`,
      },
    );
  }
  stats.push({ id: "seed", label: "Seed", value: String(state.seed) });
  return stats;
}
