// The game played out behind the title and start screens: the biggest generated map, no fog,
// and nobody at the controls but a simple bot that dots towers round the keep. When the keep
// falls it starts again on a new map. Nothing here can be clicked; it's only to watch.
import { applyCommand } from "../sim/game";
import { createLocalSession, type Session } from "../net/session";
import type { Facing, GameState, PlayerId, StructureKind } from "../sim/types";

/** What the bot builds, each listed as often as it should be picked. */
const BOT_BUILDS: StructureKind[] = [
  "archer",
  "archer",
  "archer",
  "cannon",
  "cannon",
  "catapult",
  "floorSpikes",
];
/** How often the bot has a go, in ticks, and how many spots it tries each go. */
const BOT_INTERVAL_TICKS = 15;
const BOT_TRIES = 20;
/** The bot builds from this close to the keep out to this far, spreading out as it goes. */
const BOT_MIN_RADIUS = 3;
const BOT_MAX_RADIUS = 16;
/** How long the fallen keep is shown before a new game starts (ms). */
const RESTART_DELAY_MS = 5000;
/** How quickly the camera drifts to what it's watching (share of the way per second). */
const FOLLOW_RATE = 0.4;
/** The camera never looks further than this from the keep (tiles), so the keep stays in view. */
const MAX_DRIFT = 15;

/**
 * One go for the bot: tries random spots round the keep for a random build, facing the
 * spawns, and sends the first one the game accepts. Returns whether it built anything.
 */
export function botTurn(
  state: GameState,
  player: PlayerId,
  random: () => number = Math.random,
): boolean {
  const keep = state.keeps[0];
  if (!keep || state.gameOver) return false;
  const cx = keep.x + keep.size / 2;
  const cy = keep.y + keep.size / 2;
  const built = Object.values(state.structures).filter((s) => s.owner === player).length;
  const radius = Math.min(BOT_MAX_RADIUS, BOT_MIN_RADIUS + built / 3);
  const kind = BOT_BUILDS[Math.floor(random() * BOT_BUILDS.length)];
  for (let i = 0; i < BOT_TRIES; i++) {
    const angle = random() * Math.PI * 2;
    const distance = BOT_MIN_RADIUS + random() * (radius - BOT_MIN_RADIUS + 1);
    const x = Math.floor(cx + Math.cos(angle) * distance);
    const y = Math.floor(cy + Math.sin(angle) * distance);
    const facing = facingSpawns(state, x, y);
    if (applyCommand(state, player, { type: "build", kind, x, y, facing }).ok) return true;
  }
  return false;
}

/** The way from (x, y) towards the middle of the spawn zone. */
function facingSpawns(state: GameState, x: number, y: number): Facing {
  const spawns = state.spawnTiles;
  if (spawns.length === 0) return "W";
  const dx = spawns.reduce((sum, p) => sum + p.x, 0) / spawns.length - x;
  const dy = spawns.reduce((sum, p) => sum + p.y, 0) / spawns.length - y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "W" : "E";
  return dy < 0 ? "N" : "S";
}

/**
 * Where the camera should look: halfway between the keep and the enemy nearest it, but no
 * more than MAX_DRIFT tiles from the keep, so the fighting stays in view (just the keep while
 * there are no enemies).
 */
export function backdropFocus(state: GameState): { x: number; y: number } {
  const keep = state.keeps[0];
  const kx = keep ? keep.x + keep.size / 2 : state.width / 2;
  const ky = keep ? keep.y + keep.size / 2 : state.height / 2;
  let nearest: { x: number; y: number } | null = null;
  let best = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - kx) ** 2 + (e.y - ky) ** 2;
    if (d < best) {
      best = d;
      nearest = e;
    }
  }
  if (!nearest) return { x: kx, y: ky };
  const dx = (nearest.x - kx) / 2;
  const dy = (nearest.y - ky) / 2;
  const scale = Math.min(1, MAX_DRIFT / Math.hypot(dx, dy));
  return { x: kx + dx * scale, y: ky + dy * scale };
}

export interface Backdrop {
  readonly session: Session;
  /** Where the camera is looking (eased towards backdropFocus), in tiles. */
  readonly focus: { x: number; y: number };
  /** Runs the game, the bot and the camera on: `seconds` since the last frame. */
  frame(now: number, seconds: number): void;
}

export function createBackdrop(): Backdrop {
  const session = createLocalSession(Date.now() >>> 0, undefined, { fog: false, size: "XL" });
  let nextBotTick = 0;
  let fellAt: number | null = null;
  let focus = backdropFocus(session.state!);
  return {
    session,
    get focus() {
      return focus;
    },
    frame(now, seconds) {
      session.frame(now);
      const state = session.state!;
      if (state.gameOver) {
        fellAt ??= now;
        if (now - fellAt < RESTART_DELAY_MS) return;
        session.restart();
        fellAt = null;
        nextBotTick = 0;
        focus = backdropFocus(session.state!);
        return;
      }
      if (state.tick >= nextBotTick) {
        botTurn(state, session.playerId);
        nextBotTick = state.tick + BOT_INTERVAL_TICKS;
      }
      const target = backdropFocus(state);
      const share = Math.min(1, FOLLOW_RATE * seconds);
      focus = {
        x: focus.x + (target.x - focus.x) * share,
        y: focus.y + (target.y - focus.y) * share,
      };
    },
  };
}
