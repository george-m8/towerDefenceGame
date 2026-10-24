import { isKeepTile, isSpawnTile } from "../sim/grid";
import type { GameState } from "../sim/types";
import { COLOURS, GLYPH_FONT, TILE_SIZE } from "./palette";

export function createRenderer(canvas: HTMLCanvasElement, width: number, height: number) {
  canvas.width = width * TILE_SIZE;
  canvas.height = height * TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  function drawTile(x: number, y: number, bg: string, glyph?: string, fg?: string) {
    ctx!.fillStyle = bg;
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    if (glyph && fg) drawGlyph(x, y, glyph, fg);
  }

  function drawGlyph(x: number, y: number, glyph: string, fg: string) {
    ctx!.font = GLYPH_FONT;
    ctx!.fillStyle = fg;
    ctx!.fillText(glyph, (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE + 1);
  }

  return {
    render(state: GameState) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isKeepTile(state, x, y)) drawTile(x, y, COLOURS.keep, "K", COLOURS.keepGlyph);
          else if (isSpawnTile(state, x, y)) drawTile(x, y, COLOURS.spawn, ".", COLOURS.spawnGlyph);
          else drawTile(x, y, (x + y) % 2 === 0 ? COLOURS.ground : COLOURS.groundAlt);
        }
      }
    },
  };
}
