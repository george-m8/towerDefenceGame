import {
  baseAt,
  blocksAt,
  canBuild,
  isKeepTile,
  isSpawnTile,
  isWalkable,
  mountAt,
  terrainAt,
  topAt,
} from "../sim/grid";
import { nextStep } from "../sim/pathfinding";
import { facingAngle } from "../sim/aiming";
import { STRUCTURES, type StructureStats, type TowerStats } from "../sim/config";
import { canTarget } from "../sim/towers";
import { hitTile } from "../sim/traps";
import type { Facing, GameState, Point, Structure, StructureKind } from "../sim/types";
import { isBuildTool, type UiState } from "../ui/state";
import {
  AIM_LINE_TILES,
  COLOURS,
  NOTCH_DEPTH_PX,
  NOTCH_LENGTH_PX,
  KEEP_HP_FONT,
  BATTLEMENT_PX,
  GLYPH_FONT,
  STRUCTURE_COLOURS,
  TERRAIN_STYLES,
  TILE_SIZE,
  glyphFor,
} from "./palette";

/** Compass degrees (0 = north, clockwise) to canvas radians (0 = east, clockwise). */
function toCanvasAngle(compassDegrees: number): number {
  return ((compassDegrees - 90) * Math.PI) / 180;
}

function isTower(kind: StructureKind): boolean {
  const stats: StructureStats = STRUCTURES[kind];
  return stats.tower !== undefined;
}

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
        const base = baseAt(state, x, y);
        if (base) drawStructure(base);
        else if (isKeepTile(state, x, y)) drawKeepTile(state, x, y);
        else if (isSpawnTile(state, x, y)) drawTile(x, y, COLOURS.spawn, ".", COLOURS.spawnGlyph);
        else drawTerrain(state, x, y);
        const mount = mountAt(state, x, y);
        if (mount && base) drawMountOnWall(mount, base);
        else if (mount) drawStructure(mount);
      }
    }
  }

  /** Keep tiles show "K", except the centre, which shows the keep's HP. */
  function drawKeepTile(state: GameState, x: number, y: number) {
    const { keep } = state;
    const centre = Math.floor(keep.size / 2);
    if (x !== keep.x + centre || y !== keep.y + centre) {
      drawTile(x, y, COLOURS.keep, "K", COLOURS.keepGlyph);
      return;
    }
    drawTile(x, y, COLOURS.keep);
    ctx!.font = KEEP_HP_FONT;
    ctx!.fillStyle = COLOURS.keepGlyph;
    ctx!.fillText(
      String(Math.ceil(keep.hp)),
      (x + 0.5) * TILE_SIZE,
      (y + 0.5) * TILE_SIZE + 1,
      TILE_SIZE - 2,
    );
  }

  function drawTerrain(state: GameState, x: number, y: number) {
    const terrain = terrainAt(state, x, y);
    if (terrain === "ground") {
      drawTile(x, y, (x + y) % 2 === 0 ? COLOURS.ground : COLOURS.groundAlt);
      return;
    }
    const style = TERRAIN_STYLES[terrain];
    drawTile(x, y, style.bg, style.glyph, style.fg);
  }

  function drawFeatures(state: GameState) {
    for (const feature of state.features) {
      if (feature.kind === "chest") drawGlyph(feature.x, feature.y, "$", COLOURS.chest);
    }
  }

  function drawStructure(structure: Structure) {
    const { x, y } = structure;
    const colours = STRUCTURE_COLOURS[structure.kind];
    drawTile(x, y, colours.bg, glyphFor(structure.kind, structure.facing), colours.fg);
    if (isTower(structure.kind)) drawFacingNotch(x, y, structure.facing);
    if (structure.hp < structure.maxHp) drawHpBar(x, y, structure.hp / structure.maxHp);
  }

  /** A tower on a wall: the wall shows through, the tower glyph sits on it under a battlement strip. */
  function drawMountOnWall(tower: Structure, wall: Structure) {
    const { x, y } = tower;
    const towerColour = STRUCTURE_COLOURS[tower.kind].bg;
    drawTile(x, y, STRUCTURE_COLOURS[wall.kind].bg, glyphFor(tower.kind), towerColour);
    ctx!.fillStyle = towerColour;
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, BATTLEMENT_PX);
    drawFacingNotch(x, y, tower.facing);
    if (wall.hp < wall.maxHp) drawHpBar(x, y, wall.hp / wall.maxHp);
  }

  function drawGhost(state: GameState, ui: UiState) {
    if (!ui.tool || !ui.hover) return;
    const { x, y } = ui.hover;
    if (ui.tool === "sell") {
      if (!topAt(state, x, y)) return;
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
    if (stats.tower) drawFacingNotch(x, y, ui.facing);
    if (facing) {
      const target = hitTile({ x, y, facing });
      ctx!.fillStyle = COLOURS.trapTarget;
      ctx!.fillRect(target.x * TILE_SIZE, target.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  /** Range of the tower being placed, or of the tower under the cursor. */
  function drawRange(state: GameState, ui: UiState) {
    if (!ui.hover) return;
    const hovered = mountAt(state, ui.hover.x, ui.hover.y);
    const placing = isBuildTool(ui.tool) ? ui.tool : undefined;
    const kind: StructureKind | undefined = placing ?? hovered?.kind;
    if (!kind) return;
    const stats: StructureStats = STRUCTURES[kind];
    if (!stats.tower) return;
    const centre: Point = placing ? ui.hover : { x: hovered!.x, y: hovered!.y };
    const facing = placing ? ui.facing : hovered!.facing;
    const tower = stats.tower;
    const { range } = tower;

    // Exactly the tiles this tower could fire at: the same rule targeting uses.
    ctx!.fillStyle = COLOURS.range;
    for (let y = Math.floor(centre.y - range); y <= centre.y + range; y++) {
      for (let x = Math.floor(centre.x - range); x <= centre.x + range; x++) {
        if (canTarget(tower, centre, facing, { x, y })) {
          ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    drawRangeOutline(centre, tower, facing);
    if (!placing && hovered!.aim !== undefined) drawAimLine(centre, hovered!.aim);
  }

  /** A circle for all-round towers, a wedge for fixed ones. */
  function drawRangeOutline(centre: Point, tower: TowerStats, facing: Facing | undefined) {
    const cx = (centre.x + 0.5) * TILE_SIZE;
    const cy = (centre.y + 0.5) * TILE_SIZE;
    const radius = (tower.range + 0.5) * TILE_SIZE;
    ctx!.strokeStyle = COLOURS.rangeEdge;
    ctx!.beginPath();
    if (tower.turnDegreesPerSecond > 0 || tower.arcDegrees >= 360 || !facing) {
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
    } else {
      const aim = facingAngle(facing);
      ctx!.moveTo(cx, cy);
      ctx!.arc(
        cx,
        cy,
        radius,
        toCanvasAngle(aim - tower.arcDegrees / 2),
        toCanvasAngle(aim + tower.arcDegrees / 2),
      );
      ctx!.closePath();
    }
    ctx!.stroke();
  }

  function drawAimLine(centre: Point, aim: number) {
    const cx = (centre.x + 0.5) * TILE_SIZE;
    const cy = (centre.y + 0.5) * TILE_SIZE;
    const length = AIM_LINE_TILES * TILE_SIZE;
    ctx!.strokeStyle = COLOURS.aimLine;
    ctx!.lineWidth = 2;
    ctx!.beginPath();
    ctx!.moveTo(cx, cy);
    ctx!.lineTo(
      cx + Math.cos(toCanvasAngle(aim)) * length,
      cy + Math.sin(toCanvasAngle(aim)) * length,
    );
    ctx!.stroke();
    ctx!.lineWidth = 1;
  }

  /** A small mark on the tile edge a tower faces. */
  function drawFacingNotch(x: number, y: number, facing: Facing | undefined) {
    if (!facing) return;
    const left = x * TILE_SIZE;
    const top = y * TILE_SIZE;
    const mid = (TILE_SIZE - NOTCH_LENGTH_PX) / 2;
    const far = TILE_SIZE - NOTCH_DEPTH_PX;
    const rects: Record<Facing, [number, number, number, number]> = {
      N: [left + mid, top, NOTCH_LENGTH_PX, NOTCH_DEPTH_PX],
      E: [left + far, top + mid, NOTCH_DEPTH_PX, NOTCH_LENGTH_PX],
      S: [left + mid, top + far, NOTCH_LENGTH_PX, NOTCH_DEPTH_PX],
      W: [left, top + mid, NOTCH_DEPTH_PX, NOTCH_LENGTH_PX],
    };
    ctx!.fillStyle = COLOURS.facingNotch;
    ctx!.fillRect(...rects[facing]);
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
        if (topAt(state, x, y) || !isWalkable(state, x, y)) continue;
        const next = nextStep(state, x, y);
        if (!next) continue;
        const arrow = next.y < y ? "↑" : next.x > x ? "→" : next.y > y ? "↓" : "←";
        const attacking = blocksAt(state, next.x, next.y);
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
      drawFeatures(state);
      if (ui.showFlow) drawFlow(state);
      drawEffects(state);
      drawEnemies(state);
      drawRange(state, ui);
      drawGhost(state, ui);
    },
  };
}
