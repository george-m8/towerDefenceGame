// The game's stats (gold, income, keep, waves...) as label and value, for the sidebar and the
// HUD's stat box. PvP has no waves: it shows the rival's keep and the mode instead. Journey home
// has none either: its keep is the camp, and the wave and next slots say how far home it is and
// what it's doing; No looking back's say when the lava's next wave comes and how far home. With enemies
// at night, the wave stat shows the night too, and by day the next wave is "At dusk".
import { TICK_RATE } from "../sim/config";
import { incomePerMinute } from "../sim/economy";
import { isSpawningTime } from "../sim/clock";
import { isLastWave } from "../sim/waves";
import { tilesFromHome } from "../sim/journey";
import { kingFromHome, lavaBehindKing, lavaWaves } from "../sim/flood";
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
  ];
  if (state.flood) {
    // No keep of your own: the lava's waves in the waves' place (shown in the HUD from the
    // start), how far behind the king it is in the keep's, and how far home he is.
    const tiles = (n: number) => `${n} tile${n === 1 ? "" : "s"}`;
    const lava = lavaWaves(state);
    const behind = lavaBehindKing(state);
    stats.push(
      {
        id: "wave",
        label: "Lava",
        value: lava.surging
          ? `wave ${lava.wave} coming in!`
          : `wave ${lava.wave} in ${lava.seconds}s`,
      },
      {
        id: "keep",
        label: "Behind",
        value: behind === null ? "Safe on the mountain" : tiles(behind),
      },
      { id: "next", label: "Home", value: tiles(kingFromHome(state)) },
      { id: "seed", label: "Seed", value: String(state.seed) },
    );
    return stats;
  }
  stats.push({
    id: "keep",
    label: state.journey ? "Camp" : "Keep",
    value: `${mine.hp} / ${mine.maxHp}`,
  });
  if (state.journey) {
    const doing = {
      camped: "Camped",
      packing: "Packing up",
      moving: "On the move",
      unpacking: "Setting up",
    }[state.journey.phase];
    const home = tilesFromHome(state);
    stats.push(
      { id: "wave", label: "Home", value: `${home} tile${home === 1 ? "" : "s"}` },
      { id: "next", label: "Camp", value: doing },
    );
  } else if (state.mode === "pvp") {
    const rival = state.keeps.find((k) => k !== mine);
    stats.push(
      { id: "rival", label: "Rival", value: rival ? `${rival.hp} / ${rival.maxHp}` : "-" },
      { id: "mode", label: "Mode", value: "PvP" },
    );
  } else {
    const spawning = state.wave.threatLeft > 0;
    const night = state.enemiesCome === "night" && state.clock ? state.clock.day : null;
    // A level's waves count up to its last.
    const of = state.lastWave === null ? "" : ` / ${state.lastWave}`;
    stats.push(
      night === null
        ? { id: "wave", label: "Wave", value: `${state.wave.number}${of}` }
        : { id: "wave", label: "Night", value: `${night} · wave ${state.wave.number}${of}` },
      {
        id: "next",
        label: "Next",
        value: spawning
          ? "incoming!"
          : isLastWave(state)
            ? "Last wave"
            : !isSpawningTime(state)
              ? "At dusk"
              : `${Math.ceil(state.wave.countdown / TICK_RATE)}s`,
      },
    );
  }
  stats.push({ id: "seed", label: "Seed", value: String(state.seed) });
  return stats;
}
