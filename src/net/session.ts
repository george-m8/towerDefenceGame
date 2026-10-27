// What main.ts plays through: the local simulation, or a game on the server (networkSession.ts).
import { TICK_RATE, type MapSize } from "../sim/config";
import { applyCommand, createGame, tick } from "../sim/game";
import type { ItemsFile } from "../sim/itemsFile";
import type { MapFile } from "../sim/mapFile";
import type {
  EnemiesCome,
  Command,
  CommandResult,
  Facing,
  GameState,
  PlayerId,
  StructureKind,
} from "../sim/types";

/** A build sent to the server and not yet confirmed, drawn as a faint ghost. */
export interface PendingBuild {
  kind: StructureKind;
  x: number;
  y: number;
  facing?: Facing;
}

export interface Session {
  /** The game to draw. Null until an online session has been welcomed. */
  readonly state: GameState | null;
  readonly playerId: PlayerId;
  readonly online: boolean;
  /** A short connection status for the panel ("" offline). */
  readonly status: string;
  /** Builds waiting for the server (always empty offline). */
  readonly pending: readonly PendingBuild[];
  send(command: Command): void;
  /** Start a new game after game over. */
  restart(): void;
  /** Called every animation frame with the current time in ms. */
  frame(now: number): void;
  /** Called with every command's result (refusals are shown to the player). */
  onResult: (result: CommandResult) => void;
}

const TICK_MS = 1000 / TICK_RATE;
// Cap catch-up after the tab was in the background, so we never spiral.
const MAX_TICKS_PER_FRAME = 5;
const LOCAL_PLAYER = 1;

/** Today's single-player game: the simulation runs here, at a fixed tick rate. */
export function createLocalSession(
  seed: number,
  newSeed: () => number = () => Date.now() >>> 0,
  /**
   * `fog: false` is the ?fog=off dev switch; `size` is the map size picked at the start; `map`
   * is a `.map` file to play (the map editor's Play); `items` an `.items` file's build limits;
   * `enemiesCome` when enemies come (at night, or all the time); `lastWave` a campaign level's
   * last wave, beating which wins.
   */
  options: {
    fog?: boolean;
    size?: MapSize;
    map?: MapFile;
    items?: ItemsFile;
    enemiesCome?: EnemiesCome;
    lastWave?: number;
  } = {},
): Session {
  let state = createGame(seed, options);
  let lastTime: number | null = null;
  let accumulator = 0;

  return {
    get state() {
      return state;
    },
    playerId: LOCAL_PLAYER,
    online: false,
    status: "",
    pending: [],
    onResult: () => {},
    send(command) {
      this.onResult(applyCommand(state, LOCAL_PLAYER, command));
    },
    restart() {
      state = createGame(newSeed(), options);
      accumulator = 0;
    },
    frame(now) {
      accumulator += (now - (lastTime ?? now)) * state.speed;
      lastTime = now;
      const maxTicks = MAX_TICKS_PER_FRAME * state.speed;
      let ticks = 0;
      while (accumulator >= TICK_MS && ticks < maxTicks) {
        tick(state);
        accumulator -= TICK_MS;
        ticks++;
      }
      if (ticks === maxTicks) accumulator = 0;
    },
  };
}
