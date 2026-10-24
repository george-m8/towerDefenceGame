import { canBuild, isKeepTile, isSpawnTile, structureAt } from "../sim/grid";
import { nextStep } from "../sim/pathfinding";
import { STRUCTURES, type StructureStats } from "../sim/config";
import { hitTile } from "../sim/traps";
import type { GameState, Point, StructureKind } from "../sim/types";
import { isBuildTool, type UiState } from "../ui/state";
import { COLOURS, GLYPH_FONT, STRUCTURE_COLOURS, TILE_SIZE, glyphFor } from "./palette";

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
          drawTile(x, y, colours.bg, glyphFor(structure.kind, structure.facing), colours.fg);
          if (structure.hp < structure.maxHp) drawHpBar(x, y, structure.hp / structure.maxHp);
        } else if (isKeepTile(state, x, y)) drawTile(x, y, COLOURS.keep, "K", COLOURS.keepGlyph);
        else if (isSpawnTile(state, x, y)) drawTile(x, y, COLOURS.spawn, ".", COLOURS.spawnGlyph);
        else drawTile(x, y, (x + y) % 2 === 0 ? COLOURS.ground : COLOURS.groundAlt);
      }
    }
  }

  function drawGhost(state: GameState, ui: UiState) {
    if (!ui.tool || !ui.hover) return;
    const { x, y } = ui.hover;
    if (ui.tool === "sell") {
      if (!structureAt(state, x, y)) return;
      ctx!.fillStyle = COLOURS.ghostSell;
      ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      drawGlyph(x, y, "$", "#ffffff");
      return;
    }
    const ok = canBuild(state, ui.tool, x, y).ok;
    ctx!.fillStyle = ok ? COLOURS.ghostOk : COLOURS.ghostBad;
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    const stats: StructureStats = STRUCTURES[ui.tool];
    const facing = stats.directional ? ui.facing : undefined;
    drawGlyph(x, y, glyphFor(ui.tool, facing), "#ffffff");
    if (facing) {
      const target = hitTile({ x, y, facing });
      ctx!.fillStyle = COLOURS.trapTarget;
      ctx!.fillRect(target.x * TILE_SIZE, target.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  /** Range of the tower being placed, or of the tower under the cursor. */
  function drawRange(state: GameState, ui: UiState) {
    if (!ui.hover) return;
    const hovered = structureAt(state, ui.hover.x, ui.hover.y);
    const placing = isBuildTool(ui.tool) ? ui.tool : undefined;
    const kind: StructureKind | undefined = placing ?? hovered?.kind;
    if (!kind) return;
    const stats: StructureStats = STRUCTURES[kind];
    if (!stats.tower) return;
    const centre: Point = placing ? ui.hover : { x: hovered!.x, y: hovered!.y };
    const { range, minRange } = stats.tower;

    ctx!.fillStyle = COLOURS.range;
    for (let y = Math.floor(centre.y - range); y <= centre.y + range; y++) {
      for (let x = Math.floor(centre.x - range); x <= centre.x + range; x++) {
        const d = Math.hypot(x - centre.x, y - centre.y);
        if (d <= range && d >= minRange) {
          ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    ctx!.strokeStyle = COLOURS.rangeEdge;
    ctx!.beginPath();
    ctx!.arc(
      (centre.x + 0.5) * TILE_SIZE,
      (centre.y + 0.5) * TILE_SIZE,
      (range + 0.5) * TILE_SIZE,
      0,
      Math.PI * 2,
    );
    ctx!.stroke();
  }

  function drawEffects(state: GameState) {
    for (const effect of state.effects) {
      if (effect.kind === "shot") {
        ctx!.strokeStyle = COLOURS.shot;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.moveTo((effect.fromX + 0.5) * TILE_SIZE, (effect.fromY + 0.5) * TILE_SIZE);
        ctx!.lineTo((effect.toX + 0.5) * TILE_SIZE, (effect.toY + 0.5) * TILE_SIZE);
        ctx!.stroke();
        ctx!.lineWidth = 1;
      } else if (effect.kind === "spikes") {
        drawTile(effect.x, effect.y, COLOURS.spikesUp, "^", COLOURS.spikesUpGlyph);
      } else {
        const size = (effect.radius * 2 + 1) * TILE_SIZE;
        ctx!.fillStyle = COLOURS.splash;
        ctx!.fillRect(
          (effect.x - effect.radius) * TILE_SIZE,
          (effect.y - effect.radius) * TILE_SIZE,
          size,
          size,
        );
      }
    }
  }

  function drawFlow(state: GameState) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (structureAt(state, x, y)) continue;
        const next = nextStep(state, x, y);
        if (!next) continue;
        const arrow = next.y < y ? "↑" : next.x > x ? "→" : next.y > y ? "↓" : "←";
        const attacking = structureAt(state, next.x, next.y) !== undefined;
        drawGlyph(x, y, arrow, attacking ? COLOURS.flowAttack : COLOURS.flowArrow);
      }
    }
  }

  function drawEnemies(state: GameState) {
    for (const enemy of state.enemies) {
      drawGlyph(enemy.x, enemy.y, "g", COLOURS.enemy);
      if (enemy.hp < enemy.maxHp) drawHpBar(enemy.x, enemy.y, enemy.hp / enemy.maxHp);
    }
  }

  function drawHpBar(x: number, y: number, fraction: number) {
    const left = x * TILE_SIZE + 2;
    const top = y * TILE_SIZE;
    const barWidth = TILE_SIZE - 4;
    ctx!.fillStyle = COLOURS.hpBack;
    ctx!.fillRect(left, top, barWidth, 3);
    ctx!.fillStyle = COLOURS.hpFront;
    ctx!.fillRect(left, top, Math.max(1, barWidth * fraction), 3);
  }

  return {
    render(state: GameState, ui: UiState) {
      drawGrid(state);
      if (ui.showFlow) drawFlow(state);
      drawEffects(state);
      drawEnemies(state);
      drawRange(state, ui);
      drawGhost(state, ui);
    },
  };
}
