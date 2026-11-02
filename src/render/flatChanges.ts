// Which tiles of the flat map (see renderFlat in canvas.ts) need painting again: a fingerprint
// of everything a tile's paint shows, so the 3D view repaints (and uploads) just the tiles that
// changed rather than the whole map. Gates' doors are drawn on another tile than the gate, so a
// change to any gate repaints the whole map (see `gates`).
import { STRUCTURES, type StructureStats } from "../sim/config";
import { getEnclosures } from "../sim/enclosures";
import { lavaWarning } from "../sim/flood";
import { isBuilt } from "../sim/grid";
import type { GameState, Structure } from "../sim/types";
import { fromView, type Rotation } from "./rotation";

/** No fingerprint yet: a tile with it always differs. */
export const UNPAINTED = 0x7fffffff;

/** Each tile's fingerprint, and one for all the gates. */
export interface FlatPrints {
  tiles: Int32Array;
  gates: number;
}

const mix = (h: number, v: number) => Math.imul(h ^ (v | 0), 0x9e3779b1) ^ (h >>> 15);

/** A structure's look: what it is, whose, how built and battered, and which way it points. */
function structurePrint(s: Structure | undefined): number {
  if (!s) return 0;
  let h = mix(s.id, s.kind.length * 31 + s.kind.charCodeAt(0));
  h = mix(h, s.owner ?? -1);
  h = mix(h, isBuilt(s) ? 255 : Math.round(8 * (1 - (s.buildLeft ?? 0) / (s.buildTicks || 1))));
  h = mix(h, Math.round((4 * s.hp) / (s.maxHp || 1)));
  h = mix(h, (s.facing?.charCodeAt(0) ?? 0) + Math.round((s.aim ?? 0) / 15) * 256);
  return h;
}

/**
 * The fingerprints of `state` (as the flat map is painted: maybe a turned view, `turns`, whose
 * flood glow is looked up on the map as drawLavaWarning does), for `tiers` of sight.
 */
export function flatPrints(
  state: GameState,
  tiers: Uint8Array | null,
  turns: Rotation,
): FlatPrints {
  const { width, height } = state;
  const tiles = new Int32Array(width * height);
  const { kind, owner } = getEnclosures(state);
  const features = new Map<number, number>();
  for (const f of state.features) features.set(f.y * width + f.x, 1 + f.kind.length);
  const odd = turns % 2 === 1;
  const w = odd ? height : width;
  const h = odd ? width : height;
  let gates = 0;
  for (const s of Object.values(state.structures)) {
    const stats: StructureStats = STRUCTURES[s.kind];
    if (stats.spawner) gates = mix(mix(gates, structurePrint(s)), s.x * 65536 + s.y);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const t = state.terrain[i];
      let p = mix(t.length * 131 + t.charCodeAt(0) * 7 + t.charCodeAt(t.length - 1), i);
      p = mix(p, tiers ? tiers[i] : 0);
      p = mix(p, kind[i] * 1024 + owner[i]);
      p = mix(p, state.resources[i] ?? 0);
      p = mix(p, features.get(i) ?? 0);
      // Structures by id (0: none).
      if (state.base[i]) p = mix(p, structurePrint(state.structures[state.base[i]]));
      if (state.mount[i]) p = mix(p, structurePrint(state.structures[state.mount[i]]));
      if (state.flood) {
        const on = turns === 0 ? { x, y } : fromView({ x, y }, turns, w, h);
        const warning = lavaWarning(state, on.x, on.y);
        p = mix(p, warning === null ? -1 : Math.round(warning * 8));
      }
      tiles[i] = p === UNPAINTED ? 0 : p;
    }
  }
  return { tiles, gates };
}

/** The tiles whose fingerprints differ. */
export function changedTiles(before: Int32Array, after: Int32Array): number[] {
  const changed: number[] = [];
  for (let i = 0; i < after.length; i++) if (before[i] !== after[i]) changed.push(i);
  return changed;
}

/** Fingerprints moved `columns` tiles to the left, as the world moves on (new columns unpainted). */
export function shiftPrints(prints: Int32Array, width: number, columns: number): Int32Array {
  const out = new Int32Array(prints.length).fill(UNPAINTED);
  const height = prints.length / width;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x + columns < width; x++) out[row + x] = prints[row + x + columns];
  }
  return out;
}
