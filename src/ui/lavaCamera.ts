// No looking back's camera. It's yours to pan and zoom: nothing pushes it on. When the world moves
// on (the king walking far enough right that new land comes in), the camera moves with the world,
// so nothing jumps (moveWithWorld), and then glides to bring the king, and the new land ahead of
// him, into view (createKingFollow). Panning while it glides stops it.
// The lava runs left to right on the map; with the view turned (Q), that's another way on screen.
import type { Rotation } from "../render/rotation";
import { toView } from "../render/rotation";
import { kingAt } from "../sim/flood";
import type { Flood } from "../sim/types";
import { clamp, tilePixels, viewCentre, type Camera } from "./camera";

/** Where the glide puts the king across the screen, from the lava's side: room ahead of him. */
export const FOLLOW_AT = 0.35;
/** How quickly the camera glides there: the share of the way it goes in a second. */
export const GLIDE_RATE = 3;
/** Close enough, in tiles: the glide's done. */
const ARRIVED = 0.05;

/**
 * The world has moved on `columns` columns to the left (see shiftWorld): the camera goes with it,
 * so what's on screen stays put.
 */
export function moveWithWorld(
  cam: Camera,
  columns: number,
  width: number,
  height: number,
  turns: Rotation,
): void {
  const a = toView({ x: 0, y: 0 }, turns, width, height);
  const b = toView({ x: -columns, y: 0 }, turns, width, height);
  cam.x += b.x - a.x;
  cam.y += b.y - a.y;
  clamp(cam);
}

/**
 * Where the middle of the screen goes for the king to be FOLLOW_AT across it, from the lava's
 * side, along the way the lava runs (the other way, the camera stays as it is).
 */
export function followTarget(
  cam: Camera,
  flood: Flood,
  width: number,
  height: number,
  turns: Rotation,
): { x: number; y: number } {
  const a = toView({ x: 0, y: 0 }, turns, width, height);
  const b = toView({ x: 1, y: 0 }, turns, width, height);
  const axis = a.x !== b.x ? "x" : "y";
  const dir = b[axis] - a[axis];
  const across = (axis === "x" ? cam.viewWidth : cam.viewHeight) / tilePixels(cam);
  const king = toView(kingAt(flood), turns, width, height);
  const target = viewCentre(cam);
  target[axis] = king[axis] + 0.5 + dir * (0.5 - FOLLOW_AT) * across;
  return target;
}

/** The glide after the world moves on: started by worldMoved, moved on by frame. */
export function createKingFollow() {
  let gliding = false;
  /** Where the glide left the camera last frame: if it's anywhere else now, it was panned. */
  let left: { x: number; y: number } | null = null;
  return {
    /** The world has moved on: glide to the king (the camera's already moved with the world). */
    worldMoved(cam: Camera) {
      gliding = true;
      left = { x: cam.x, y: cam.y };
    },
    /** A new game: no glide. */
    stop() {
      gliding = false;
    },
    /** Once a frame: a step of the glide, over `seconds`, unless it's done or was panned. */
    frame(
      cam: Camera,
      flood: Flood,
      width: number,
      height: number,
      turns: Rotation,
      seconds: number,
    ) {
      if (!gliding) return;
      if (left && (cam.x !== left.x || cam.y !== left.y)) {
        gliding = false; // the player took over
        return;
      }
      const target = followTarget(cam, flood, width, height, turns);
      const before = viewCentre(cam);
      const share = 1 - Math.exp(-GLIDE_RATE * seconds);
      cam.x += (target.x - before.x) * share;
      cam.y += (target.y - before.y) * share;
      clamp(cam);
      const after = viewCentre(cam);
      // There, or as near as the map's edge lets it get.
      const near = Math.hypot(target.x - after.x, target.y - after.y) < ARRIVED;
      const stuck = Math.hypot(after.x - before.x, after.y - before.y) < 1e-4 && seconds > 0;
      if (near || stuck) gliding = false;
      left = { x: cam.x, y: cam.y };
    },
  };
}
