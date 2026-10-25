import {
  baseAt,
  blocksAt,
  canBuild,
  isKeepTile,
  isSpawnTile,
  keepAt,
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
import type { Facing, GameState, PlayerId, Point, Structure, StructureKind } from "../sim/types";
import type { PendingBuild } from "../net/session";
import { isBuildTool, type UiState } from "../ui/state";
import { visibleTiles, type VisibleTiles } from "../ui/camera";
import { minimapColour } from "../ui/minimap";
import { KEEP, NONE, getEnclosures } from "../sim/enclosures";
import { SEEN, canSeeEnemiesAt, forEachSightTile, getSight } from "../sim/fog";
import {
  AIM_LINE_TILES,
  ARROWS,
  ARROW_SYMBOLS,
  type ArrowStyle,
  COLOURS,
  NOTCH_DEPTH_PX,
  NOTCH_LENGTH_PX,
  KEEP_HP_FONT,
  BATTLEMENT_PX,
  GLYPH_FONT,
  STRUCTURE_COLOURS,
  TERRAIN_STYLES,
  TILE_SIZE,
  OWNER_MARK_PX,
  glyphFor,
  playerColour,
} from "./palette";
import { fogImage } from "./fog";

/** Compass degrees (0 = north, clockwise) to canvas radians (0 = east, clockwise). */
function toCanvasAngle(compassDegrees: number): number {
  return ((compassDegrees - 90) * Math.PI) / 180;
}

function isTower(kind: StructureKind): boolean {
  const stats: StructureStats = STRUCTURES[kind];
  return stats.tower !== undefined;
}

/**
 * Raised blocks (a visual prototype): solid things are drawn lifted by their height in
 * pixels, with a darker front face below, so walls and towers read as 3D blocks.
 */
export function blockHeight(state: GameState, x: number, y: number): number {
  if (isKeepTile(state, x, y)) return 12;
  const base = baseAt(state, x, y);
  const mount = mountAt(state, x, y);
  if (mount) return base ? 11 : 8;
  if (base) return STRUCTURES[base.kind].blocksMovement ? 6 : 0;
  const terrain = terrainAt(state, x, y);
  return terrain === "tree" ? 7 : terrain === "rock" ? 4 : 0;
}

/**
 * The tile under a point (fractional tile coordinates). A block's top is drawn lifted into
 * the row behind it, so a point on that lifted top picks the block, not the tile behind.
 */
export function pickTile(state: GameState | null, px: number, py: number): Point {
  const x = Math.floor(px);
  const y = Math.floor(py);
  if (!state) return { x, y };
  const lift = blockHeight(state, x, y + 1) / TILE_SIZE;
  return py - y >= 1 - lift ? { x, y: y + 1 } : { x, y };
}

/**
 * Draws the game through the camera in `ui.camera`. Everything below draws in map pixels
 * (TILE_SIZE per tile); the canvas transform turns that into the zoomed, scrolled view, and
 * only tiles on screen are drawn. The canvas's own size is set by main.ts to fit the window.
 */
export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  /** The tiles on screen this frame. */
  let view: VisibleTiles = { x0: 0, y0: 0, x1: -1, y1: -1 };
  /** The player looking: in PvP, sight and enclosures are theirs. */
  let viewer: PlayerId = 1;
  /** The fog image and the sight it was made from. */
  let fog: { tier: Uint8Array; image: HTMLCanvasElement; lift: number } | null = null;

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

  /** A small corner triangle in the owner's colour (multiplayer only). */
  function drawOwnerMark(structure: Structure | undefined) {
    if (!structure || structure.owner === null) return;
    const left = structure.x * TILE_SIZE;
    const top = structure.y * TILE_SIZE;
    ctx!.fillStyle = playerColour(structure.owner);
    ctx!.beginPath();
    ctx!.moveTo(left, top);
    ctx!.lineTo(left + OWNER_MARK_PX, top);
    ctx!.lineTo(left, top + OWNER_MARK_PX);
    ctx!.fill();
  }

  function drawTileContents(state: GameState, x: number, y: number, showOwners: boolean) {
    const base = baseAt(state, x, y);
    if (base) drawStructure(base);
    else if (isKeepTile(state, x, y)) drawKeepTile(state, x, y);
    else if (isSpawnTile(state, x, y)) drawTile(x, y, COLOURS.spawn, ".", COLOURS.spawnGlyph);
    else drawTerrain(state, x, y);
    const mount = mountAt(state, x, y);
    if (mount && base) drawMountOnWall(mount, base);
    else if (mount) drawStructure(mount);
    if (showOwners) drawOwnerMark(mount ?? base);
  }

  function drawGround(x: number, y: number) {
    drawTile(x, y, (x + y) % 2 === 0 ? COLOURS.ground : COLOURS.groundAlt);
  }

  function drawGrid(state: GameState) {
    const { x0, y0, x1, y1 } = view;
    const showOwners = Object.keys(state.players).length > 1;
    // Flat tiles first (ground under raised ones), then raised blocks back to front, so a
    // block's lifted top covers the row behind it.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (blockHeight(state, x, y) > 0) drawGround(x, y);
        else drawTileContents(state, x, y, showOwners);
      }
    }
    // Shadows cast down and to the right, under every block.
    ctx!.fillStyle = "rgba(0, 0, 0, 0.3)";
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const h = blockHeight(state, x, y);
        if (h > 0) ctx!.fillRect(x * TILE_SIZE + h / 2, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    // Enemies go in with their row, so blocks in front of them (further down) hide them.
    const enemiesByRow = new Map<number, GameState["enemies"]>();
    for (const enemy of state.enemies) {
      const row = Math.round(enemy.y);
      enemiesByRow.set(row, [...(enemiesByRow.get(row) ?? []), enemy]);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      drawFeatures(state, y - 1);
      drawEnemies(state, enemiesByRow.get(y - 1) ?? []);
      for (let x = x0; x <= x1; x++) {
        const h = blockHeight(state, x, y);
        if (h === 0) continue;
        // Front face: the block's colour, darkened; the top sits h pixels higher.
        ctx!.fillStyle = minimapColour(state, x, y);
        ctx!.fillRect(x * TILE_SIZE, (y + 1) * TILE_SIZE - h, TILE_SIZE, h);
        ctx!.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx!.fillRect(x * TILE_SIZE, (y + 1) * TILE_SIZE - h, TILE_SIZE, h);
        ctx!.save();
        ctx!.translate(0, -h);
        drawTileContents(state, x, y, showOwners);
        ctx!.restore();
      }
    }
  }

  /**
   * Keep tiles show "K", except the centre, which shows the keep's HP. A PvP keep is drawn in
   * its owner's colour.
   */
  function drawKeepTile(state: GameState, x: number, y: number) {
    const keep = keepAt(state, x, y)!;
    const bg = keep.owner !== null ? playerColour(keep.owner) : COLOURS.keep;
    const centre = Math.floor(keep.size / 2);
    if (x !== keep.x + centre || y !== keep.y + centre) {
      drawTile(x, y, bg, "K", COLOURS.keepGlyph);
      return;
    }
    drawTile(x, y, bg);
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

  /**
   * Shades enclosed areas and their walls: warm for the keep's enclosure, cool for others, and
   * red for a PvP rival's (where you can't build).
   */
  function drawEnclosures(state: GameState) {
    const { kind, owner } = getEnclosures(state);
    for (let y = view.y0; y <= view.y1; y++) {
      for (let x = view.x0; x <= view.x1; x++) {
        const i = y * state.width + x;
        const k = kind[i];
        if (k === NONE) continue;
        const rival = owner[i] !== 0 && owner[i] !== viewer;
        ctx!.fillStyle = rival
          ? COLOURS.enclosureRival
          : k === KEEP
            ? COLOURS.enclosureKeep
            : COLOURS.enclosureOuter;
        ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  /**
   * Fog of war, over everything drawn so far: a white mist raised like the blocks, thin and low
   * over seen land, solid and high over unexplored land, stepping down in see-through bands
   * along its edge. Enemies and effects out of sight are left out before this, not covered by
   * it. The fog image is only rebuilt when sight changes.
   */
  function drawFog(state: GameState) {
    if (!state.fog) return;
    const tier = getSight(state, viewer);
    if (fog?.tier !== tier) fog = { tier, ...fogImage(tier, state.width, state.height) };
    ctx!.imageSmoothingEnabled = false; // hard tile edges
    ctx!.drawImage(fog.image, 0, -fog.lift, state.width * TILE_SIZE, fog.image.height);
    ctx!.imageSmoothingEnabled = true;
  }

  /** Chests in one row, drawn with that row so blocks in front hide them. */
  function drawFeatures(state: GameState, row: number) {
    for (const feature of state.features) {
      if (feature.kind === "chest" && feature.y === row)
        drawGlyph(feature.x, feature.y, "$", COLOURS.chest);
    }
  }

  /**
   * An arrow pointing `angle` (compass degrees), drawn as a vector shape so every direction
   * looks the same on every system (font arrows vary, and some turn into emoji).
   */
  function drawArrow(x: number, y: number, angle: number, colour: string, style: ArrowStyle) {
    const { headHalfWidth, headLength, shaftHalfWidth, reach, fletchWidth, fletchLength } =
      ARROWS[style];
    ctx!.save();
    ctx!.translate((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
    ctx!.rotate((angle * Math.PI) / 180); // drawn pointing north, then turned
    ctx!.fillStyle = colour;
    ctx!.strokeStyle = colour;
    if (fletchLength > 0) {
      // Two pairs of feathers angled back from the tail.
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      for (const along of [reach - fletchLength, reach - fletchLength / 2]) {
        ctx!.moveTo(-fletchWidth, along + fletchLength / 2);
        ctx!.lineTo(0, along);
        ctx!.lineTo(fletchWidth, along + fletchLength / 2);
      }
      ctx!.stroke();
    }
    ctx!.beginPath();
    ctx!.moveTo(0, -reach); // tip
    ctx!.lineTo(headHalfWidth, -reach + headLength);
    ctx!.lineTo(shaftHalfWidth, -reach + headLength);
    ctx!.lineTo(shaftHalfWidth, reach);
    ctx!.lineTo(-shaftHalfWidth, reach);
    ctx!.lineTo(-shaftHalfWidth, -reach + headLength);
    ctx!.lineTo(-headHalfWidth, -reach + headLength);
    ctx!.closePath();
    ctx!.fill();
    ctx!.restore();
  }

  /**
   * A structure's symbol: arrow-drawn structures (wall spikes, archers) point where they aim, or
   * else where they face; everything else draws its letter.
   */
  function drawSymbol(
    x: number,
    y: number,
    kind: StructureKind,
    facing: Facing | undefined,
    colour: string,
    aim?: number,
  ) {
    const style = ARROW_SYMBOLS[kind];
    const angle = aim ?? (facing ? facingAngle(facing) : undefined);
    if (style && angle !== undefined) drawArrow(x, y, angle, colour, style);
    else drawGlyph(x, y, glyphFor(kind), colour);
  }

  /** Towers drawn as an arrow already show their facing; the rest get the edge notch. */
  function needsNotch(kind: StructureKind): boolean {
    return isTower(kind) && !ARROW_SYMBOLS[kind];
  }

  function drawStructure(structure: Structure) {
    const { x, y } = structure;
    const colours = STRUCTURE_COLOURS[structure.kind];
    drawTile(x, y, colours.bg);
    drawSymbol(x, y, structure.kind, structure.facing, colours.fg, structure.aim);
    if (needsNotch(structure.kind)) drawFacingNotch(x, y, structure.facing);
    if (structure.hp < structure.maxHp) drawHpBar(x, y, structure.hp / structure.maxHp);
  }

  /** A tower on a wall: the wall shows through, the tower glyph sits on it under a battlement strip. */
  function drawMountOnWall(tower: Structure, wall: Structure) {
    const { x, y } = tower;
    const towerColour = STRUCTURE_COLOURS[tower.kind].bg;
    drawTile(x, y, STRUCTURE_COLOURS[wall.kind].bg);
    drawSymbol(x, y, tower.kind, tower.facing, towerColour, tower.aim);
    ctx!.fillStyle = towerColour;
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, BATTLEMENT_PX);
    if (needsNotch(tower.kind)) drawFacingNotch(x, y, tower.facing);
    if (wall.hp < wall.maxHp) drawHpBar(x, y, wall.hp / wall.maxHp);
  }

  /** The ghost sits on top of whatever it's placed on (or selling). */
  function drawGhost(state: GameState, ui: UiState) {
    if (!ui.tool || !ui.hover) return;
    ctx!.save();
    ctx!.translate(0, -blockHeight(state, ui.hover.x, ui.hover.y));
    drawGhostAt(state, ui);
    ctx!.restore();
  }

  function drawGhostAt(state: GameState, ui: UiState) {
    if (!ui.tool || !ui.hover) return;
    const { x, y } = ui.hover;
    if (ui.tool === "sell") {
      if (!topAt(state, x, y)) return;
      ctx!.fillStyle = COLOURS.ghostSell;
      ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      drawGlyph(x, y, "$", "#ffffff");
      return;
    }
    const ok = canBuild(state, ui.playerId, ui.tool, x, y).ok;
    ctx!.fillStyle = ok ? COLOURS.ghostOk : COLOURS.ghostBad;
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    const stats: StructureStats = STRUCTURES[ui.tool];
    drawSymbol(x, y, ui.tool, ui.facing, "#ffffff");
    if (needsNotch(ui.tool)) drawFacingNotch(x, y, ui.facing);
    if (stats.directional) {
      const facing = ui.facing;
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
    const centre: Point = placing ? ui.hover : { x: hovered!.x, y: hovered!.y };
    const facing = placing ? ui.facing : hovered!.facing;
    if (!stats.tower) {
      // A mount that doesn't fire (a watchtower) shows how far it sees instead.
      if (stats.layer === "mount") drawSight(state, { kind, ...centre });
      return;
    }
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

  /** Tiles a structure sees: brighter where it sees enemies, fainter where it sees land. */
  function drawSight(state: GameState, viewer: { kind: StructureKind; x: number; y: number }) {
    forEachSightTile(state, viewer, (i, tier) => {
      ctx!.fillStyle = tier === SEEN ? COLOURS.sightOuter : COLOURS.sightInner;
      const x = i % state.width;
      const y = Math.floor(i / state.width);
      ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    });
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
      const lands = effect.kind === "shot" ? { x: effect.toX, y: effect.toY } : effect;
      if (!canSeeEnemiesAt(state, lands.x, lands.y, viewer)) continue;
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
    for (let y = view.y0; y <= view.y1; y++) {
      for (let x = view.x0; x <= view.x1; x++) {
        if (topAt(state, x, y) || !isWalkable(state, x, y)) continue;
        const next = nextStep(state, x, y);
        if (!next) continue;
        const arrow = next.y < y ? "↑" : next.x > x ? "→" : next.y > y ? "↓" : "←";
        const attacking = blocksAt(state, next.x, next.y);
        drawGlyph(x, y, arrow, attacking ? COLOURS.flowAttack : COLOURS.flowArrow);
      }
    }
  }

  function drawEnemies(state: GameState, enemies: GameState["enemies"]) {
    for (const enemy of enemies) {
      if (!canSeeEnemiesAt(state, enemy.x, enemy.y, viewer)) continue;
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

  /** Builds sent to the server but not confirmed yet: faint, so they read as "on the way". */
  function drawPending(pending: readonly PendingBuild[]) {
    for (const build of pending) {
      ctx!.fillStyle = COLOURS.ghostPending;
      ctx!.fillRect(build.x * TILE_SIZE, build.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      drawSymbol(build.x, build.y, build.kind, build.facing, COLOURS.ghostPendingGlyph);
    }
  }

  return {
    render(state: GameState, ui: UiState, pending: readonly PendingBuild[] = []) {
      viewer = ui.playerId;
      const cam = ui.camera;
      // Clear to the "off the map" colour, then draw the map scrolled and zoomed.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = COLOURS.offMap;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = cam.zoom * (canvas.width / cam.viewWidth); // includes the device pixel ratio
      ctx.setTransform(scale, 0, 0, scale, -cam.x * TILE_SIZE * scale, -cam.y * TILE_SIZE * scale);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      view = visibleTiles(cam);
      drawGrid(state);
      drawEnclosures(state);
      if (ui.showFlow) drawFlow(state);
      drawEffects(state);
      drawFog(state);
      drawPending(pending);
      drawRange(state, ui);
      drawGhost(state, ui);
    },
  };
}
