// Light at night (SPEC-town-lights.md): the keep, built structures and units light the darkness
// round them, by kind (LIGHTS). A light map holds one value per tile, the brightest light
// reaching it, which the renderer draws smoothed over the map.
import { isBuilt } from "../sim/grid";
import type { GameState } from "../sim/types";
import { LIGHTS } from "./palette";

/** A light, at a point in tile coordinates (a tile's centre is x + 0.5). */
export interface LightSource {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

/** A rectangle of tiles. */
export interface Region {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/** Every light in the game: the keeps, built structures (not ruins) and units (not scouts). */
export function lightSources(state: GameState): LightSource[] {
  const sources: LightSource[] = state.keeps.map((keep) => ({
    x: keep.x + keep.size / 2,
    y: keep.y + keep.size / 2,
    ...LIGHTS.keep,
  }));
  for (const structure of Object.values(state.structures)) {
    const light = LIGHTS.structures[structure.kind];
    if (light && isBuilt(structure)) {
      sources.push({ x: structure.x + 0.5, y: structure.y + 0.5, ...light });
    }
  }
  for (const unit of state.units) {
    if (!LIGHTS.darkUnits.includes(unit.kind)) {
      sources.push({ x: unit.x + 0.5, y: unit.y + 0.5, ...LIGHTS.units });
    }
  }
  return sources;
}

/**
 * How lit each tile of a region is (row by row, 0-1): the brightest light reaching its centre,
 * fading smoothly from the light's strength to nothing at its radius. Lights don't add up.
 */
export function lightMap(sources: readonly LightSource[], region: Region): Float32Array {
  const { x0, y0, width, height } = region;
  const map = new Float32Array(width * height);
  for (const { x, y, radius, strength } of sources) {
    const left = Math.max(x0, Math.floor(x - radius));
    const right = Math.min(x0 + width - 1, Math.ceil(x + radius));
    const top = Math.max(y0, Math.floor(y - radius));
    const bottom = Math.min(y0 + height - 1, Math.ceil(y + radius));
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        const t = Math.hypot(tx + 0.5 - x, ty + 0.5 - y) / radius;
        if (t >= 1) continue;
        const light = strength * (1 - t * t);
        const i = (ty - y0) * width + (tx - x0);
        if (light > map[i]) map[i] = light;
      }
    }
  }
  return map;
}
