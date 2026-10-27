// Light at night (SPEC-town-lights.md): the keep, built structures and units light the darkness
// round them, by kind (LIGHTS). A light map holds one value per tile, the brightest light
// reaching it, which the renderer draws smoothed over the map.
import { kindOf } from "../sim/units";
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

/** The keeps' and built structures' lights (not ruins). */
function builtSources(state: GameState): LightSource[] {
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
  return sources;
}

/** The torches units carry (those with `torch`: soldiers and workers, not scouts). */
function unitSources(state: GameState): LightSource[] {
  return state.units
    .filter((unit) => kindOf(unit).torch)
    .map((unit) => ({ x: unit.x + 0.5, y: unit.y + 0.5, ...LIGHTS.torch }));
}

/** Every light in the game: the keeps, built structures (not ruins) and units' torches. */
export function lightSources(state: GameState): LightSource[] {
  return [...builtSources(state), ...unitSources(state)];
}

/**
 * How lit each tile of a region is (row by row, 0-1): the brightest light reaching its centre,
 * fading smoothly from the light's strength to nothing at its radius. Lights don't add up.
 */
export function lightMap(sources: readonly LightSource[], region: Region): Float32Array {
  return stampLights(new Float32Array(region.width * region.height), region, sources);
}

/** The whole map's light from what's built, by game: it only changes when the grid does. */
const builtLight = new WeakMap<GameState, { gridVersion: number; map: Float32Array }>();

/**
 * The light map for a region of the game's map, as lightMap(lightSources(state), region), but
 * quick: what's built is lit once per grid change, and only units are added each time.
 */
export function nightLight(state: GameState, region: Region): Float32Array {
  let built = builtLight.get(state);
  if (built?.gridVersion !== state.gridVersion) {
    const whole = { x0: 0, y0: 0, width: state.width, height: state.height };
    built = { gridVersion: state.gridVersion, map: lightMap(builtSources(state), whole) };
    builtLight.set(state, built);
  }
  const map = new Float32Array(region.width * region.height);
  for (let row = 0; row < region.height; row++) {
    const from = (region.y0 + row) * state.width + region.x0;
    map.set(built.map.subarray(from, from + region.width), row * region.width);
  }
  return stampLights(map, region, unitSources(state));
}

/** Adds lights to a region's light map, each tile keeping the brightest. */
function stampLights(
  map: Float32Array,
  region: Region,
  sources: readonly LightSource[],
): Float32Array {
  const { x0, y0, width, height } = region;
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
