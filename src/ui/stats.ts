// The game's stats (gold, income, keep, waves...) as label and value, for the sidebar and the
// HUD's stat box. PvP has no waves: it shows the rival's keep and the mode instead. No looking
// back has no keep or waves: it shows the lava, your royal's HP and how far the royals have got. With enemies
// at night, the wave stat shows the night too, and by day the next wave is "At dusk".
import { TICK_RATE } from "../sim/config";
import { incomePerMinute } from "../sim/economy";
import { isSpawningTime } from "../sim/clock";
import { isLastWave } from "../sim/waves";
import {
  distanceTravelled,
  lavaBehind,
  lavaSpeed,
  lavaStartsIn,
  livingRoyals,
  royalOf,
  tilesToGoal,
} from "../sim/flood";
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
    // No keep and no waves: how far behind the king the lava is, in the waves' place (shown in
    // the HUD from the start); the king's HP in the keep's; how far he's got (the score); and
    // how fast the lava's coming, or how far it is to a goal's keep.
    const tiles = (n: number) => `${n} tile${n === 1 ? "" : "s"}`;
    const startsIn = lavaStartsIn(state);
    // Yours, or (once it's fallen) how many of the team's still stand.
    const own = royalOf(state.flood, playerId);
    const standing = livingRoyals(state.flood).length;
    const lava =
      startsIn > 0
        ? `starts in ${startsIn}s`
        : own
          ? `${tiles(lavaBehind(state, own))} behind`
          : "-";
    stats.push(
      { id: "wave", label: "Lava", value: lava },
      own
        ? { id: "keep", label: titleCase(own.title), value: `${own.hp} / ${own.maxHp}` }
        : { id: "keep", label: "Royals", value: `${standing} standing` },
      { id: "mode", label: "Distance", value: tiles(distanceTravelled(state.flood)) },
      // A goal game: how far still to the keep; else how fast the lava's coming.
      tilesToGoal(state.flood) === null
        ? { id: "next", label: "Lava speed", value: `${lavaSpeed(state).toFixed(2)} tiles/s` }
        : { id: "next", label: "Keep", value: `${tiles(tilesToGoal(state.flood)!)} to go` },
      { id: "seed", label: "Seed", value: String(state.seed) },
    );
    return stats;
  }
  stats.push({ id: "keep", label: "Keep", value: `${mine.hp} / ${mine.maxHp}` });
  if (state.mode === "pvp") {
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

/** "king" as "King". */
function titleCase(word: string): string {
  return word[0].toUpperCase() + word.slice(1);
}
