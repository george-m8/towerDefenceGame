import { canBuild, isKeepTile, isSpawnTile, structureAt } from "../sim/grid";
import type { GameState } from "../sim/types";
import type { UiState } from "../ui/state";
import { COLOURS, GLYPHS, GLYPH_FONT, STRUCTURE_COLOURS, TILE_SIZE } from "./palette";

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

  function drawGrid(state: GameState) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const structure = structureAt(state, x, y);
        if (structure) {
          const colours = STRUCTURE_COLOURS[structure.kind];
          drawTile(x, y, colours.bg, GLYPHS[structure.kind], colours.fg);
        } else if (isKeepTile(state, x, y)) drawTile(x, y, COLOURS.keep, "K", COLOURS.keepGlyph);
        else if (isSpawnTile(state, x, y)) drawTile(x, y, COLOURS.spawn, ".", COLOURS.spawnGlyph);
        else drawTile(x, y, (x + y) % 2 === 0 ? COLOURS.ground : COLOURS.groundAlt);
      }
    }
  }

  function drawGhost(state: GameState, ui: UiState) {
    if (!ui.tool || !ui.hover) return;
    const { x, y } = ui.hover;
    const ok = canBuild(state, ui.tool, x, y).ok;
    ctx!.fillStyle = ok ? COLOURS.ghostOk : COLOURS.ghostBad;
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    drawGlyph(x, y, GLYPHS[ui.tool], "#ffffff");
  }

  return {
    render(state: GameState, ui: UiState) {
      drawGrid(state);
      drawGhost(state, ui);
    },
  };
}
