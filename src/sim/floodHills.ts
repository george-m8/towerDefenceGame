// No looking back's hills: patches of high ground the flood never takes (see holdsLava in
// flood.ts). They're walked and built on as ground is, so a hill is somewhere to make a stand,
// and once the flood's gone round it, an island. Each piece of land gets a few (FLOOD.hills),
// placed with their own RNG over the open ground the map generator made, before its ruins.
import { FLOOD } from "./config";
import { nextRandom, randomInt } from "./rng";
import type { Terrain } from "./types";

/** `terrain` (n tiles across) with up to `count` hills raised on its open ground. */
export function withHills(
  terrain: Terrain[],
  n: number,
  height: number,
  seed: number,
  count: number,
) {
  const rng = { rngState: seed ^ 0x51ed27a3 };
  const raised = [...terrain];
  const { across, down } = FLOOD.hills;
  for (let k = 0; k < count; k++) {
    const rx = randomInt(rng, across.min, across.max) / 2;
    const ry = randomInt(rng, down.min, down.max) / 2;
    // Wholly on the land, so it rises all round.
    const cx = randomInt(rng, Math.ceil(rx), n - 1 - Math.ceil(rx));
    const cy = randomInt(rng, Math.ceil(ry), height - 1 - Math.ceil(ry));
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= n || y >= height) continue;
        // A rough oval: its edge a little in or out, tile by tile.
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d > 1 + (nextRandom(rng) - 0.5) * 0.4) continue;
        const i = y * n + x;
        if (raised[i] === "ground") raised[i] = "hill";
      }
    }
  }
  return raised;
}
