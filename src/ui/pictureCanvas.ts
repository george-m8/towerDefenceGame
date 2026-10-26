// A player's picture drawn as a little piece of map: each tile at its height in the game, with
// a darker front face and a shadow down and to the right, as render/canvas.ts draws blocks. On
// the player select screen a picture lies flat until hovered; then its tiles rise out of the
// ground one after another, as if being built, and sink back when the pointer leaves.
import { STRUCTURES, type StructureStats } from "../sim/config";
import type { StructureKind } from "../sim/types";
import { COLOURS, TILE_SIZE } from "../render/palette";
import { PICTURE_CELLS, pictureTile, type Picture } from "./picture";

/** How long one tile takes to rise, and how far apart the tiles start (ms). */
const RISE_MS = 220;
const STAGGER_MS = 60;
const SHADOW = "rgba(0, 0, 0, 0.35)";
const FONT = `Unifont, "Apple Symbols", "Segoe UI Symbol", monospace`;

/** A tile's height on the map, in map pixels (TILE_SIZE to a tile), as blockHeight gives it. */
export function tileHeight(id: string): number {
  if (id === "keep") return 12;
  if (id === "land:tree") return 7;
  if (id === "land:rock" || id === "land:goldRock") return 4;
  if (id === "land:berries") return 2;
  if (id.startsWith("building:")) {
    const stats: StructureStats = STRUCTURES[id.slice("building:".length) as StructureKind];
    if (stats.layer === "mount") return 8;
    return stats.blocksMovement ? 6 : 0;
  }
  return 0; // open land, enemies and units stand on the ground
}

/** The tallest a tile can be, so the canvas leaves room above the top row. */
const MAX_HEIGHT = 12;

/** The room a picture's canvas leaves above its tiles for raised tops, at this cell size (px). */
export function roomAbove(cell: number): number {
  return Math.ceil(MAX_HEIGHT * (cell / TILE_SIZE));
}

export interface PictureView {
  readonly canvas: HTMLCanvasElement;
  /** Starts the tiles rising (true) or sinking back flat (false). */
  raise(up: boolean): void;
}

/** A canvas showing `picture` with tiles `cell` CSS pixels across, flat to start with. */
export function createPictureView(
  picture: Picture,
  cell: number,
  options: { raised?: boolean } = {},
): PictureView {
  const canvas = document.createElement("canvas");
  canvas.className = "picture-canvas";
  const scale = cell / TILE_SIZE;
  const top = roomAbove(cell); // room for the top row's lifted tops
  // Room for shadows off the right edge, and as much on the left so the tiles sit centred.
  const side = Math.ceil((MAX_HEIGHT / 2) * scale);
  const width = cell * 3 + side * 2;
  const height = cell * 3 + top;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d")!;
  const heights = picture.map((id) => tileHeight(id) * scale);
  // Rising runs `clock` from 0 up to the end of the last tile's rise; sinking runs it back.
  const end = RISE_MS + STAGGER_MS * (PICTURE_CELLS - 1);
  let clock = options.raised ? end : 0;
  let target = clock;
  let last: number | null = null;
  let frame = 0;

  /** How far up tile i is, 0 (flat) to 1 (its full height), eased. */
  const progress = (i: number) => {
    const t = Math.min(1, Math.max(0, (clock - i * STAGGER_MS) / RISE_MS));
    return 1 - (1 - t) ** 3;
  };

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, side * dpr, top * dpr);
    ctx.clearRect(-side, -top, width, height);
    const h = (i: number) => heights[i] * progress(i);
    // Ground under everything, then shadows, then each row's blocks back to front.
    for (let i = 0; i < PICTURE_CELLS; i++) {
      const x = (i % 3) * cell;
      const y = Math.floor(i / 3) * cell;
      ctx.fillStyle = h(i) > 0 ? COLOURS.ground : pictureTile(picture[i]).bg;
      ctx.fillRect(x, y, cell, cell);
    }
    ctx.fillStyle = SHADOW;
    for (let i = 0; i < PICTURE_CELLS; i++) {
      if (h(i) > 0) ctx.fillRect((i % 3) * cell + h(i) / 2, Math.floor(i / 3) * cell, cell, cell);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(cell * 0.8)}px ${FONT}`;
    for (let i = 0; i < PICTURE_CELLS; i++) {
      const tile = pictureTile(picture[i]);
      const x = (i % 3) * cell;
      const y = Math.floor(i / 3) * cell;
      const lift = h(i);
      if (lift > 0) {
        // The front face: the tile's colour, darkened; its top sits `lift` higher.
        ctx.fillStyle = tile.bg;
        ctx.fillRect(x, y + cell - lift, cell, lift);
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(x, y + cell - lift, cell, lift);
        ctx.fillStyle = tile.bg;
        ctx.fillRect(x, y - lift, cell, cell);
      }
      ctx.fillStyle = tile.fg;
      ctx.fillText(tile.glyph, x + cell / 2, y - lift + cell / 2 + 1, cell - 2);
    }
  }

  function step(now: number) {
    const dt = last === null ? 16 : now - last;
    last = now;
    clock = target > clock ? Math.min(target, clock + dt) : Math.max(target, clock - dt);
    draw();
    frame = clock === target ? 0 : requestAnimationFrame(step);
    if (frame === 0) last = null;
  }

  draw();
  // The map's font may still be loading: draw again once it's here.
  void document.fonts?.ready.then(draw);
  return {
    canvas,
    raise(up) {
      target = up ? end : 0;
      if (frame === 0 && clock !== target) frame = requestAnimationFrame(step);
    },
  };
}
