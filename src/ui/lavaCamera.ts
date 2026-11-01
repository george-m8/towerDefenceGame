// No looking back's camera: it keeps to the land still in play. The view can't go back more than
// LAVA_SHOWN tiles over the lava, so it's pushed on as each wave comes in, and it always keeps
// the king in view, MARGIN tiles from its edge. Looking ahead (and anywhere else) is still free.
// The lava runs left to right on the map; with the view turned (Q), that's another way on screen.
import type { Rotation } from "../render/rotation";
import { toView } from "../render/rotation";
import type { Flood } from "../sim/types";
import { clamp, tilePixels, type Camera } from "./camera";

/** Tiles of lava the view may show behind its edge, so you can see what's coming. */
export const LAVA_SHOWN = 3;
/** The king stays at least this many tiles in from the view's edge (when the view's big enough). */
export const MARGIN = 4;

/** Moves the camera, if it needs to, to keep to the land in play. */
export function followActiveArea(
  cam: Camera,
  flood: Flood,
  width: number,
  height: number,
  turns: Rotation,
): void {
  const span = {
    x: cam.viewWidth / tilePixels(cam),
    y: cam.viewHeight / tilePixels(cam),
  };
  // Which way, in the view, the lava comes from: the view axis that the map's columns run along.
  const a = toView({ x: 0, y: 0 }, turns, width, height);
  const b = toView({ x: 1, y: 0 }, turns, width, height);
  const axis = a.x !== b.x ? "x" : "y";
  const dir = b[axis] - a[axis];
  // The view keeps clear of the columns left of `back`.
  const back = a[axis] + dir * (flood.front - LAVA_SHOWN);
  if (dir > 0) cam[axis] = Math.max(cam[axis], back);
  else cam[axis] = Math.min(cam[axis], back + 1 - span[axis]);
  // The king in view, whatever the lava says.
  const king = toView(flood.king, turns, width, height);
  for (const k of ["x", "y"] as const) {
    const margin = Math.min(MARGIN, Math.max(0, (span[k] - 1) / 2));
    cam[k] = Math.min(cam[k], king[k] - margin);
    cam[k] = Math.max(cam[k], king[k] + 1 + margin - span[k]);
  }
  clamp(cam);
}
