import {
  baseAt,
  blocksAt,
  canBuild,
  isBuilt,
  isKeepTile,
  isSpawnTile,
  keepAt,
  isWalkable,
  mountAt,
  terrainAt,
  topAt,
} from "../sim/grid";
import { nextStep } from "../sim/pathfinding";
import { stretchEnds } from "../sim/raidPaths";
import { buildFractionAt, buildProgress } from "../sim/building";
import { facingAngle } from "../sim/aiming";
import {
  EFFECT_TICKS,
  HEAL_EFFECT_TICKS,
  KEEP_SIZE,
  TICK_RATE,
  ENEMY_KINDS,
  STRUCTURES,
  UNIT_KINDS,
  type StructureStats,
  type TowerStats,
} from "../sim/config";
import { guardSpotsFor } from "../sim/guards";
import { resourceAt } from "../sim/resources";
import { spawnTileOf } from "../sim/units";
import { canTarget } from "../sim/towers";
import { hitTile } from "../sim/traps";
import type {
  Enemy,
  Facing,
  GameState,
  PlayerId,
  Point,
  Structure,
  StructureKind,
} from "../sim/types";
import type { PendingBuild } from "../net/session";
import { isBuildTool, type UiState } from "../ui/state";
import {
  ISO,
  isoRise,
  tilePixels,
  tileToScreen,
  visibleTiles,
  type Camera,
  type VisibleTiles,
} from "../ui/camera";
import { minimapColour } from "../ui/minimap";
import { KEEP, NONE, getEnclosures } from "../sim/enclosures";
import {
  IN_SIGHT,
  SEEN,
  canSeeEnemiesAt,
  forEachSightTile,
  getSight,
  isExplored,
} from "../sim/fog";
import {
  AIM_LINE_TILES,
  ARROWS,
  ARROW_SYMBOLS,
  type ArrowStyle,
  COLOURS,
  ARC_SEGMENTS,
  PROJECTILES,
  BATTLEMENT_PX,
  DAY_NIGHT,
  LIGHTS,
  SUN,
  BUILD_BORDER_PX,
  CONSTRUCTION_ALPHA,
  ENEMY_COLOURS,
  GLYPH_FONT,
  STRUCTURE_COLOURS,
  TERRAIN_STYLES,
  TERRAIN_TEXTURES,
  KEEP_TEXTURE,
  FOG,
  FOG_TEXTURE,
  STRUCTURE_TEXTURES,
  DAMAGED_WALL_TEXTURE,
  WALL_DAMAGED_BELOW,
  TEXTURE_MIN_TILE_PX,
  TILE_SIZE,
  OWNER_MARK_PX,
  enemyFont,
  glyphFor,
  playerColour,
  DOOR_ALPHA,
  KEEP_GLYPH,
  CAMP_GLYPH,
  CAMP_PACKED_GLYPH,
  KING_GLYPH,
  GLYPH_FONTS,
} from "./palette";
import { isHomeTile } from "../sim/journey";
import { kingAt, lavaWarning } from "../sim/flood";
import { fromView, type Rotation } from "./rotation";
import { fogImage, fogSpans, type FogLevel } from "./fog";
import { createHpBarTracker } from "./hpBars";
import { burstPixels, burstWaiting } from "./burst";
import { textureSpecks, textureVariant, type TextureStyle } from "./textures";
import { borderColour, borderTrace } from "./buildBorder";
import { CASTERS, castShade, shadowOffset, sweptTile, type Block, type Sun } from "./sun";
import { darknessAt, daylight, skyHour } from "./dayNight";
import { nightLight } from "./lights";

/** The furthest any light reaches, in tiles: how far round the view lights are looked for. */
const MAX_LIGHT_RADIUS = Math.max(
  LIGHTS.keep.radius,
  LIGHTS.torch.radius,
  ...Object.values(LIGHTS.structures).map((light) => light.radius),
);

/** How dark blocks' shadows are in full daylight, on the ground and on lower blocks beside them. */
const SHADOW_ALPHA = 0.3;
/** A raider's death flag fades out over its last second. */
const FLAG_FADE_TICKS = TICK_RATE;
/** The numbers on a raider's pathing flags. */
const FLAG_LABEL_FONT = `${Math.round(TILE_SIZE * 0.45)}px ${GLYPH_FONTS}`;

/** Compass degrees (0 = north, clockwise) to canvas radians (0 = east, clockwise). */
function toCanvasAngle(compassDegrees: number): number {
  return ((compassDegrees - 90) * Math.PI) / 180;
}

/**
 * Raised blocks (a visual prototype): solid things are drawn lifted by their height in
 * pixels, with a darker front face below, so walls and towers read as 3D blocks.
 */
/** A wall that's taken more than half its HP: drawn cracked, and a little lower. */
export function isDamagedWall(structure: Structure): boolean {
  return structure.kind === "wall" && structure.hp < structure.maxHp * WALL_DAMAGED_BELOW;
}

/** How tall untouched rock (and gold rock) stands, in pixels. */
const ROCK_HEIGHT = 4;
/** A wall's height (a finished one, unbattered). */
const WALL_HEIGHT = 6;
/** No looking back's lava: half a wall high where it's deep, lower towards its fringes. */
const LAVA_HEIGHT = WALL_HEIGHT / 2;

/**
 * How high lava stands at (x, y): a pixel at its fringe (beside land), two a tile further in,
 * and LAVA_HEIGHT from two tiles in. Off the map counts as lava, so it's deep at the edges.
 */
function lavaHeight(state: GameState, x: number, y: number): number {
  for (let reach = 1; reach < LAVA_HEIGHT; reach++) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== reach) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        if (state.terrain[ny * state.width + nx] !== "lava") return reach;
      }
    }
  }
  return LAVA_HEIGHT;
}

export function blockHeight(state: GameState, x: number, y: number): number {
  // Journey home's keep at the end stands like any keep.
  const keep =
    keepAt(state, x, y) ??
    (isHomeTile(state, x, y) ? { ...state.journey!.home, size: KEEP_SIZE } : undefined);
  if (keep) {
    // The corners stand a little taller, like towers, round a low middle.
    const last = keep.size - 1;
    const corner = (x - keep.x) % last === 0 && (y - keep.y) % last === 0;
    const centre = Math.floor(keep.size / 2);
    if (x - keep.x === centre && y - keep.y === centre) return 4;
    return corner ? 15 : 12;
  }
  // Anything still being built lies flat until it's finished.
  const built = (s: Structure | undefined) => (s && isBuilt(s) ? s : undefined);
  const base = built(baseAt(state, x, y));
  const mount = built(mountAt(state, x, y));
  // A battered wall sinks a little, and a tower on it with it.
  const sunk = base && isDamagedWall(base) ? 1 : 0;
  if (mount) return base ? 11 - sunk : 8;
  if (base) return STRUCTURES[base.kind].blocksMovement ? WALL_HEIGHT - sunk : 0;
  const terrain = terrainAt(state, x, y);
  if (terrain === "lava") return lavaHeight(state, x, y);
  if (terrain === "tree") return 7;
  if (terrain === "rock" || terrain === "goldRock") {
    // Ore sinks as it's mined: full height while untouched, down to a sliver near the end.
    const ore = resourceAt(state, x, y);
    if (!ore) return ROCK_HEIGHT;
    return Math.max(1, Math.round(ROCK_HEIGHT * (ore.goldLeft / ore.worth)));
  }
  // Bushes stand just off the ground; they're still walked over.
  return terrain === "berries" ? 2 : 0;
}

/** A block's sides: its own colour, but a tower on a wall shows the wall it stands on. */
export function blockSideColour(state: GameState, x: number, y: number): string {
  const base = mountAt(state, x, y) && baseAt(state, x, y);
  return base ? STRUCTURE_COLOURS[base.kind].bg : minimapColour(state, x, y);
}

/**
 * The row an enemy is drawn with. Blocks in front hide it, except the keep: an enemy standing
 * against the back of the keep (attacking it) is drawn in front, not sunk under the keep's top.
 */
export function enemyDrawRow(state: GameState, enemy: Enemy): number {
  const row = Math.round(enemy.y);
  return isKeepTile(state, Math.round(enemy.x), row + 1) ? row + 1 : row;
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

/** The tallest a block stands, in pixels (a keep's corner), for pickIsoTile's search. */
const TALLEST_BLOCK = 16;
/** How finely pickIsoTile steps down the view line, in tiles of height. */
const PICK_STEP = 1 / 32;

/**
 * The tile under a point over the 3D view, given the ground point under it (fractional tiles).
 * Blocks stand up into the view, so the point may be on a block's top or front nearer the
 * camera: follow the view line from as high as any block stands down to the ground, and take
 * the first block it meets. A point raised h shows where the ground further from the camera
 * does (isoRise), so at height h the line is over the ground point moved back towards it.
 */
export function pickIsoTile(state: GameState | null, cam: Camera, px: number, py: number): Point {
  if (state) {
    const rise = isoRise(cam);
    const top = (TALLEST_BLOCK / TILE_SIZE) * ISO.heightScale;
    for (let h = top; h > 0; h -= PICK_STEP) {
      const x = Math.floor(px + rise.x * h);
      const y = Math.floor(py + rise.y * h);
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      if ((blockHeight(state, x, y) / TILE_SIZE) * ISO.heightScale >= h) return { x, y };
    }
  }
  return { x: Math.floor(px), y: Math.floor(py) };
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
  /** The hovered tile and the time this frame, for when health bars show (hpBars.ts). */
  let hover: Point | null = null;
  let now = 0;
  const hpBars = createHpBarTracker();
  /** False while painting the flat map for the 3D view: bars change too often to bake in. */
  let barsShown = true;
  /**
   * Over the 3D view (renderOverlay): the camera, the game and the screen's pixel ratio, so
   * map-pixel drawing goes through the iso transform and bars stand upright over things.
   */
  let iso: { cam: Camera; state: GameState; dpr: number } | null = null;
  /** Tile textures, drawn once each ("style:variant"). */
  const textureImages = new Map<string, HTMLCanvasElement>();
  /** False when zoomed too far out for textures to show. */
  let textured = true;
  /** The night's light map as an image, one pixel a tile (see drawNight). */
  const nightImage = document.createElement("canvas");
  /** Each raiders' path's end, worked out again only when the paths change. */
  let pathEnds: { paths: number[]; ends: number[] } = { paths: [], ends: [] };
  /** Blocks' shadows this frame: fainter as the light fades (see dayNight.ts). */
  let shadow = `rgba(0, 0, 0, ${SHADOW_ALPHA})`;
  /**
   * Blocks' heights this frame, for the view and a shadow's reach round it, so the shadow passes
   * (which look at every tile round each block) don't work each one out again.
   */
  let heights = { x0: 0, y0: 0, width: 0, height: 0, data: new Uint8Array(0) };

  /** Works out every block's height for the view and a shadow's reach round it. */
  function measureHeights(state: GameState) {
    const x0 = Math.max(0, view.x0 - SUN.reachTiles);
    const y0 = Math.max(0, view.y0 - SUN.reachTiles);
    const width = Math.min(state.width - 1, view.x1 + SUN.reachTiles) - x0 + 1;
    const height = Math.min(state.height - 1, view.y1 + SUN.reachTiles) - y0 + 1;
    if (heights.data.length < width * height) heights.data = new Uint8Array(width * height);
    heights = { x0, y0, width, height, data: heights.data };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++)
        heights.data[y * width + x] = blockHeight(state, x0 + x, y0 + y);
    }
  }

  /** A block's height from this frame's measure: 0 off the map or out of reach of the view. */
  function heightAt(x: number, y: number): number {
    const { x0, y0, width, height, data } = heights;
    const col = x - x0;
    const row = y - y0;
    return col >= 0 && row >= 0 && col < width && row < height ? data[row * width + col] : 0;
  }
  /** The fog image and the sight it was made from. */
  let fog: {
    tier: Uint8Array;
    image: HTMLCanvasElement;
    lift: number;
    levels: (FogLevel | undefined)[];
  } | null = null;

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
    // A construction site shows the ground through it.
    if (base && !isBuilt(base)) drawTerrain(state, x, y);
    if (base) drawStructure(base);
    else if (isKeepTile(state, x, y)) drawKeepTile(state, x, y);
    else if (isHomeTile(state, x, y)) drawHomeTile(state, x, y);
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

  function drawGrid(state: GameState, sun: Sun) {
    const { x0, y0, x1, y1 } = view;
    measureHeights(state);
    const showOwners = Object.keys(state.players).length > 1;
    // Flat tiles first (ground under raised ones), then raised blocks back to front, so a
    // block's lifted top covers the row behind it.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (heightAt(x, y) > 0) {
          drawGround(x, y);
          continue;
        }
        drawTileContents(state, x, y, showOwners);
        drawEnclosureTint(state, x, y, 0);
      }
    }
    drawDoors(state);
    // Shadows cast away from the sun, under every block, from a shadow's reach beyond the view
    // too. One fill, so overlapping shadows aren't darker.
    const { dx, dy } = shadowOffset(sun);
    ctx!.fillStyle = shadow;
    ctx!.beginPath();
    for (let y = heights.y0; y < heights.y0 + heights.height; y++) {
      for (let x = heights.x0; x < heights.x0 + heights.width; x++) {
        const h = heightAt(x, y);
        if (h > 0) tracePolygon(sweptTile(x, y, h * dx, h * dy));
      }
    }
    ctx!.fill();
    // Enemies and units go in with their row, so blocks in front of them (further down) hide them.
    const enemiesByRow = new Map<number, GameState["enemies"]>();
    for (const enemy of state.enemies) {
      const row = enemyDrawRow(state, enemy);
      enemiesByRow.set(row, [...(enemiesByRow.get(row) ?? []), enemy]);
    }
    const unitsByRow = new Map<number, GameState["units"]>();
    for (const unit of state.units) {
      const row = Math.round(unit.y);
      unitsByRow.set(row, [...(unitsByRow.get(row) ?? []), unit]);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      drawFeatures(state, y - 1);
      drawUnits(state, unitsByRow.get(y - 1) ?? []);
      drawEnemies(state, enemiesByRow.get(y - 1) ?? []);
      for (let x = x0; x <= x1; x++) {
        const h = heightAt(x, y);
        if (h === 0) continue;
        // Front face: the block's colour, darkened; the top sits h pixels higher.
        ctx!.fillStyle = blockSideColour(state, x, y);
        ctx!.fillRect(x * TILE_SIZE, (y + 1) * TILE_SIZE - h, TILE_SIZE, h);
        ctx!.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx!.fillRect(x * TILE_SIZE, (y + 1) * TILE_SIZE - h, TILE_SIZE, h);
        ctx!.save();
        ctx!.translate(0, -h);
        drawTileContents(state, x, y, showOwners);
        ctx!.restore();
        drawEnclosureTint(state, x, y, h);
        drawCastShadows({ x, y, height: h }, { dx, dy });
      }
    }
  }

  /**
   * The shadows taller blocks round it cast over a lower block's front face and top:
   * e.g. a catapult on a wall shading the wall beside it. One fill, so overlaps aren't darker.
   */
  function drawCastShadows(receiver: Block, offset: { dx: number; dy: number }) {
    const length = Math.hypot(offset.dx, offset.dy);
    ctx!.beginPath();
    for (const [dx, dy] of CASTERS) {
      const caster = heightAt(receiver.x + dx, receiver.y + dy);
      if (caster <= receiver.height) continue;
      // Too far away for its shadow to reach: the tiles between are wider than the shadow is long.
      if ((Math.max(Math.abs(dx), Math.abs(dy)) - 1) * TILE_SIZE >= caster * length) continue;
      const at = { x: receiver.x + dx, y: receiver.y + dy, height: caster };
      const { top, face } = castShade(offset, at, receiver);
      if (top) tracePolygon(top);
      if (face) tracePolygon(face);
    }
    ctx!.fillStyle = shadow;
    ctx!.fill();
  }

  /**
   * Night: a dark wash over the whole view, map and fog alike (previews go over it), lifted round
   * lights (the town, units) and warmed where they're brightest. On the map it's drawn from a
   * light map, one pixel a tile, scaled up smoothly; beyond the map it's flat.
   */
  function drawNight(state: GameState, darkness: number) {
    if (darkness <= 0) return;
    const reach = Math.ceil(MAX_LIGHT_RADIUS);
    const x0 = Math.max(0, view.x0 - reach);
    const y0 = Math.max(0, view.y0 - reach);
    const region = {
      x0,
      y0,
      width: Math.min(state.width - 1, view.x1 + reach) - x0 + 1,
      height: Math.min(state.height - 1, view.y1 + reach) - y0 + 1,
    };
    const light = nightLight(state, region);
    // Beyond the lit region (off the map): flat night. Everything but the region, by even-odd.
    const far = 1e6;
    const left = region.x0 * TILE_SIZE;
    const top = region.y0 * TILE_SIZE;
    const width = region.width * TILE_SIZE;
    const height = region.height * TILE_SIZE;
    ctx!.fillStyle = `rgba(${DAY_NIGHT.nightColour}, ${darkness})`;
    ctx!.beginPath();
    ctx!.rect(-far, -far, 2 * far, 2 * far);
    ctx!.rect(left, top, width, height);
    ctx!.fill("evenodd");
    // On the region: darkness lifted by the light, then the warm glow.
    const [nr, ng, nb] = DAY_NIGHT.nightColour.split(",").map(Number);
    const [tr, tg, tb] = LIGHTS.tint.split(",").map(Number);
    const warmth = (LIGHTS.tintStrength * darkness) / DAY_NIGHT.darkness;
    const night = nightImage.getContext("2d")!;
    nightImage.width = region.width;
    nightImage.height = region.height;
    const dark = night.createImageData(region.width, region.height);
    const glow = night.createImageData(region.width, region.height);
    for (let i = 0; i < light.length; i++) {
      const p = i * 4;
      dark.data[p] = nr;
      dark.data[p + 1] = ng;
      dark.data[p + 2] = nb;
      dark.data[p + 3] = 255 * darkness * (1 - light[i]);
      glow.data[p] = tr;
      glow.data[p + 1] = tg;
      glow.data[p + 2] = tb;
      glow.data[p + 3] = 255 * warmth * light[i];
    }
    ctx!.imageSmoothingEnabled = true; // soft pools of light
    for (const image of [dark, glow]) {
      night.putImageData(image, 0, 0);
      ctx!.drawImage(nightImage, left, top, width, height);
    }
  }

  /** Adds a closed polygon to the path being built. */
  function tracePolygon(points: [number, number][]) {
    ctx!.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx!.lineTo(...point);
    ctx!.closePath();
  }

  /**
   * Keep tiles show KEEP_GLYPH, except the centre, which has the keep's HP over it (see
   * drawKeepHp). A PvP keep is drawn in its owner's colour.
   */
  function drawKeepTile(state: GameState, x: number, y: number) {
    const keep = keepAt(state, x, y)!;
    const bg = keep.owner !== null ? playerColour(keep.owner) : COLOURS.keep;
    const centre = Math.floor(keep.size / 2);
    drawTile(x, y, bg);
    if (state.journey) {
      // Journey home's camp: a tent, pitched or packed up.
      const pitched = state.journey.phase === "camped";
      drawGlyph(x, y, pitched ? CAMP_GLYPH : CAMP_PACKED_GLYPH, COLOURS.keepGlyph);
      return;
    }
    drawTexture(x, y, KEEP_TEXTURE);
    if (x !== keep.x + centre || y !== keep.y + centre) {
      drawGlyph(x, y, KEEP_GLYPH, COLOURS.keepGlyph);
    }
  }

  /** Journey home's keep, where the camp is heading: a keep, with no HP to show. */
  function drawHomeTile(state: GameState, x: number, y: number) {
    const { home } = state.journey!;
    drawTile(x, y, COLOURS.keep);
    drawTexture(x, y, KEEP_TEXTURE);
    if (x !== home.x + 1 || y !== home.y + 1) drawGlyph(x, y, KEEP_GLYPH, COLOURS.keepGlyph);
  }

  /**
   * No looking back: a glow over the land the lava's about to take, stronger and quicker to pulse
   * the nearer it is (under the fog). The lava's edge is worked out on the map (its rows and the
   * world's columns), so each tile of the (maybe turned) view is looked up by its place there.
   */
  function drawLavaWarning(state: GameState, turns: Rotation, pulsing = true) {
    const flood = state.flood;
    if (!flood) return;
    const odd = turns % 2 === 1;
    const w = odd ? state.height : state.width;
    const h = odd ? state.width : state.height;
    for (let y = view.y0; y <= view.y1; y++) {
      for (let x = view.x0; x <= view.x1; x++) {
        const on = turns === 0 ? { x, y } : fromView({ x, y }, turns, w, h);
        const warning = lavaWarning(state, on.x, on.y);
        if (warning === null) continue;
        const pulse = pulsing
          ? 0.5 + 0.5 * Math.sin(performance.now() / (400 - 300 * warning))
          : 0.5;
        ctx!.fillStyle = COLOURS.lavaWarn;
        ctx!.globalAlpha = 0.08 + warning * (0.2 + 0.25 * pulse);
        ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx!.globalAlpha = 1;
      }
    }
  }

  /**
   * Where a map point on (x, y)'s top shows, as a point on the ground: up the screen on the flat
   * map, and over the 3D view, the ground point further from the camera that it covers.
   */
  function onTop(state: GameState, p: Point): Point {
    const height = blockHeight(state, Math.round(p.x), Math.round(p.y));
    if (!iso) return { x: p.x, y: p.y - height / TILE_SIZE };
    const rise = isoRise(iso.cam);
    const tiles = (height / TILE_SIZE) * ISO.heightScale;
    return { x: p.x - rise.x * tiles, y: p.y - rise.y * tiles };
  }

  /**
   * No looking back: the king's plan, drawn as a raider's (numbered flags, joined from him by a
   * faint line), with his way to the next flag as Journey home draws the camp's (a dot a tile);
   * then, on the flat map, the king, part way to his next tile (the 3D view stands him up as a
   * card). Each sits on its tile's top.
   */
  function drawKing(state: GameState) {
    const flood = state.flood;
    if (!flood) return;
    const colour = playerColour(flood.owner);
    ctx!.fillStyle = colour;
    ctx!.globalAlpha = 0.5;
    const dot = TILE_SIZE / 4;
    for (const p of flood.path) {
      const at = onTop(state, p);
      ctx!.fillRect(
        (at.x + 0.5) * TILE_SIZE - dot / 2,
        (at.y + 0.5) * TILE_SIZE - dot / 2,
        dot,
        dot,
      );
    }
    ctx!.globalAlpha = 1;
    const king = onTop(state, kingAt(flood));
    drawPathFlags(
      flood.plan.map((p) => onTop(state, p)),
      colour,
      king,
    );
    if (iso) return;
    const kx = (king.x + 0.5) * TILE_SIZE;
    const ky = (king.y + 0.5) * TILE_SIZE;
    ctx!.fillStyle = colour;
    ctx!.beginPath();
    ctx!.arc(kx, ky, TILE_SIZE * 0.45, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.strokeStyle = COLOURS.keepGlyph;
    ctx!.lineWidth = 1.5;
    ctx!.stroke();
    ctx!.lineWidth = 1;
    ctx!.font = GLYPH_FONT;
    ctx!.fillStyle = COLOURS.keepGlyph;
    ctx!.fillText(KING_GLYPH, kx, ky + 1);
  }

  /** Journey home: the way the camp is going, to where it's going. */
  function drawCampPath(state: GameState) {
    const journey = state.journey;
    if (!journey?.goal) return;
    ctx!.fillStyle = playerColour(state.keeps[0].owner ?? 1);
    ctx!.globalAlpha = 0.5;
    const dot = TILE_SIZE / 4;
    for (const p of journey.path) {
      ctx!.fillRect((p.x + 0.5) * TILE_SIZE - dot / 2, (p.y + 0.5) * TILE_SIZE - dot / 2, dot, dot);
    }
    ctx!.globalAlpha = 1;
    outlineTile(journey.goal, playerColour(state.keeps[0].owner ?? 1));
  }

  /**
   * Each keep's HP, over its middle. The middle sits low, mostly hidden by the keep's walls, so
   * the number is drawn after every block, at the height of the walls round it.
   */
  function drawKeepHp(state: GameState) {
    ctx!.font = GLYPH_FONT;
    ctx!.lineWidth = 2;
    ctx!.lineJoin = "round";
    ctx!.strokeStyle = "rgba(0, 0, 0, 0.6)"; // an outline, as it crosses walls and their faces
    ctx!.fillStyle = COLOURS.keepGlyph;
    for (const keep of state.keeps) {
      if (state.journey) continue; // the camp's HP is with the stats
      const centre = Math.floor(keep.size / 2);
      const x = keep.x + centre;
      const y = keep.y + centre;
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
      const lift = blockHeight(state, x, keep.y);
      const text = String(Math.ceil(keep.hp));
      const px = (x + 0.5) * TILE_SIZE;
      const py = (y + 0.5) * TILE_SIZE + 1 - lift;
      ctx!.strokeText(text, px, py, TILE_SIZE - 2);
      ctx!.fillText(text, px, py, TILE_SIZE - 2);
    }
  }

  function drawTerrain(state: GameState, x: number, y: number) {
    const terrain = terrainAt(state, x, y);
    if (terrain === "ground") {
      drawTile(x, y, (x + y) % 2 === 0 ? COLOURS.ground : COLOURS.groundAlt);
      drawTexture(x, y, TERRAIN_TEXTURES.ground);
      return;
    }
    const style = TERRAIN_STYLES[terrain];
    drawTile(x, y, style.bg);
    drawTexture(x, y, TERRAIN_TEXTURES[terrain]);
    if (style.glyph && style.fg) drawGlyph(x, y, style.glyph, style.fg);
    drawResourceLeft(state, x, y);
  }

  /** A resource being worked shows what's left (in sight only, like enemies). */
  function drawResourceLeft(state: GameState, x: number, y: number) {
    const resource = resourceAt(state, x, y);
    if (resource && resource.goldLeft < resource.worth && canSeeEnemiesAt(state, x, y, viewer)) {
      drawHpBar(x, y, resource.goldLeft / resource.worth, COLOURS.resourceLeft);
    }
  }

  /** A tile's texture over its flat colour, unless zoomed too far out to see it. */
  function drawTexture(x: number, y: number, style: TextureStyle) {
    if (!textured) return;
    ctx!.drawImage(textureImage(style, textureVariant(x, y)), x * TILE_SIZE, y * TILE_SIZE);
  }

  /** One variant of a texture, drawn the first time it's wanted. */
  function textureImage(style: TextureStyle, variant: number): HTMLCanvasElement {
    const key = `${style}:${variant}`;
    let image = textureImages.get(key);
    if (!image) {
      image = document.createElement("canvas");
      image.width = image.height = TILE_SIZE;
      const tctx = image.getContext("2d")!;
      for (const s of textureSpecks(style, variant)) {
        tctx.fillStyle = s.colour;
        tctx.fillRect(s.x, s.y, s.w, s.h);
      }
      textureImages.set(key, image);
    }
    return image;
  }

  /**
   * Shades a tile of an enclosed area or its walls, drawn with the tile (h is its block height)
   * so it sits on the block and under anyone standing there: warm for the keep's enclosure,
   * cool for others, and red for a PvP rival's (where you can't build).
   */
  function drawEnclosureTint(state: GameState, x: number, y: number, h: number) {
    if (isKeepTile(state, x, y)) return; // the keep's own colour says whose it is
    const { kind, owner } = getEnclosures(state);
    const i = y * state.width + x;
    const k = kind[i];
    if (k === NONE) return;
    const rival = owner[i] !== 0 && owner[i] !== viewer;
    ctx!.fillStyle = rival
      ? COLOURS.enclosureRival
      : k === KEEP
        ? COLOURS.enclosureKeep
        : COLOURS.enclosureOuter;
    // A raised block's top sits h higher, with its front face below it: tint both.
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE - h, TILE_SIZE, TILE_SIZE + h);
  }

  /**
   * Fog of war, over everything drawn so far: a white mist raised like the blocks, thin and low
   * over seen land, solid and high over unexplored land, stepping down in see-through bands
   * along its edge. Enemies and effects out of sight are left out before this, not covered by
   * it. The fog image is only rebuilt when sight changes. A dithered haze lies over each fog
   * tile's top, as see-through as its fog.
   */
  function drawFog(state: GameState) {
    if (!state.fog) return;
    const tier = getSight(state, viewer);
    if (fog?.tier !== tier) fog = { tier, ...fogImage(tier, state.width, state.height) };
    ctx!.imageSmoothingEnabled = false; // hard tile edges
    ctx!.drawImage(fog.image, 0, -fog.lift, state.width * TILE_SIZE, fog.image.height);
    ctx!.imageSmoothingEnabled = true;
    if (textured) drawHaze(state, fog.levels);
  }

  /** The haze texture on the visible fog tops, cut short where higher fog in front hides it. */
  function drawHaze(state: GameState, levels: (FogLevel | undefined)[]) {
    // One row past the view: its fog is raised into the view's bottom row.
    const y1 = Math.min(state.height - 1, view.y1 + 1);
    for (let y = view.y0; y <= y1; y++) {
      for (let x = view.x0; x <= view.x1; x++) {
        const level = levels[y * state.width + x];
        if (!level) continue;
        const front = y + 1 < state.height ? (levels[(y + 1) * state.width + x]?.height ?? 0) : 0;
        const { top } = fogSpans(y, level.height, front);
        const shown = top.bottom - top.top;
        if (shown <= 0) continue;
        ctx!.globalAlpha = level.opacity;
        const image = textureImage(FOG_TEXTURE, textureVariant(x, y));
        ctx!.drawImage(image, 0, 0, TILE_SIZE, shown, x * TILE_SIZE, top.top, TILE_SIZE, shown);
      }
    }
    ctx!.globalAlpha = 1;
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

  /** A structure still being built is see-through (the caller draws what's under it). */
  function drawStructure(structure: Structure) {
    const { x, y } = structure;
    const colours = STRUCTURE_COLOURS[structure.kind];
    if (!isBuilt(structure)) ctx!.globalAlpha = CONSTRUCTION_ALPHA;
    drawStructureTile(x, y, structure.kind, isDamagedWall(structure));
    drawSymbol(x, y, structure.kind, structure.facing, colours.fg, structure.aim);
    ctx!.globalAlpha = 1;
    drawBars(structure, structure);
  }

  /** A structure's tile colour, textured for those that have one (stone walls). */
  function drawStructureTile(x: number, y: number, kind: StructureKind, damaged = false) {
    drawTile(x, y, STRUCTURE_COLOURS[kind].bg);
    const texture = damaged ? DAMAGED_WALL_TEXTURE : STRUCTURE_TEXTURES[kind];
    if (texture) drawTexture(x, y, texture);
  }

  /** A tower on a wall: the wall shows through, the tower glyph sits on it under a battlement strip. */
  function drawMountOnWall(tower: Structure, wall: Structure) {
    const { x, y } = tower;
    const towerColour = STRUCTURE_COLOURS[tower.kind].bg;
    if (!isBuilt(wall)) ctx!.globalAlpha = CONSTRUCTION_ALPHA;
    drawStructureTile(x, y, wall.kind, isDamagedWall(wall));
    ctx!.globalAlpha = isBuilt(tower) ? 1 : CONSTRUCTION_ALPHA;
    drawSymbol(x, y, tower.kind, tower.facing, towerColour, tower.aim);
    ctx!.fillStyle = towerColour;
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, BATTLEMENT_PX);
    ctx!.globalAlpha = 1;
    drawBars(isBuilt(wall) ? tower : wall, wall);
  }

  /** How far `building` has got while it's going up, else how damaged `hp` is. */
  function drawBars(building: Structure, hp: Structure) {
    const { x, y } = building;
    if (!isBuilt(building)) drawHpBar(x, y, buildProgress(building), COLOURS.buildFront);
    else drawHealth(`s${hp.id}`, hp);
  }

  /**
   * A health bar for something damaged, while its tile is hovered or for a moment after it was
   * hit (then fading out).
   */
  function drawHealth(key: string, thing: { x: number; y: number; hp: number; maxHp: number }) {
    const x = Math.round(thing.x);
    const y = Math.round(thing.y);
    const hovered = hover !== null && hover.x === x && hover.y === y;
    const alpha = hpBars.alpha(key, thing.hp, now, hovered);
    if (alpha <= 0 || thing.hp >= thing.maxHp) return;
    ctx!.globalAlpha = alpha;
    drawHpBar(thing.x, thing.y, thing.hp / thing.maxHp);
    ctx!.globalAlpha = 1;
  }

  /** The ghost sits on top of whatever it's placed on (or selling). */
  function drawGhost(state: GameState, ui: UiState) {
    if (!ui.tool || !ui.hover) return;
    ctx!.save();
    liftBy(blockHeight(state, ui.hover.x, ui.hover.y));
    drawGhostAt(state, ui);
    ctx!.restore();
  }

  /** A white edge round the tile under the pointer, on top of whatever's on it (raised blocks too). */
  function drawHoverEdge(state: GameState, ui: UiState) {
    if (!ui.hover) return;
    ctx!.save();
    liftBy(blockHeight(state, ui.hover.x, ui.hover.y));
    outlineTile(ui.hover, COLOURS.hoverEdge);
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
    if (ui.tool === "moveCamp") {
      // Somewhere in sight with nothing on it (the move itself says why not, if it can't).
      const ok =
        getSight(state, ui.playerId)[y * state.width + x] === IN_SIGHT && !topAt(state, x, y);
      ctx!.fillStyle = ok ? COLOURS.ghostOk : COLOURS.ghostBad;
      ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      drawGlyph(x, y, CAMP_GLYPH, "#ffffff");
      return;
    }
    if (ui.tool === "route") {
      // Where the next flag would go.
      ctx!.fillStyle = COLOURS.ghostOk;
      ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      return;
    }
    const ok = canBuild(state, ui.playerId, ui.tool, x, y).ok;
    ctx!.fillStyle = ok ? COLOURS.ghostOk : COLOURS.ghostBad;
    ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    const stats: StructureStats = STRUCTURES[ui.tool];
    drawSymbol(x, y, ui.tool, ui.facing, "#ffffff");
    if (stats.spawner) {
      // Where its units will come out (and a guard building's guards will stand).
      const placing = { x, y, facing: ui.facing };
      if (UNIT_KINDS[stats.spawner.unit].behaviour === "guard") {
        for (const spot of guardSpotsFor(state, placing)) outlineTile(spot, COLOURS.guardSpot);
      }
      const door = spawnTileOf(state, placing);
      if (door) outlineTile(door, COLOURS.door);
    }
    if (stats.directional && stats.trap) {
      const facing = ui.facing;
      const target = hitTile({ x, y, facing });
      ctx!.fillStyle = COLOURS.trapTarget;
      ctx!.fillRect(target.x * TILE_SIZE, target.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    drawBuildBorder(x, y, buildFractionAt(state, x, y, ui.playerId));
  }

  /**
   * How long building here takes: the tile's border fills clockwise from the top middle, over
   * a dark track, leaving the ghost inside in view. Nothing at all where building is instant.
   */
  function drawBuildBorder(x: number, y: number, fraction: number) {
    const filled = borderTrace(fraction);
    if (filled.length === 0) return;
    // Drawn just inside the tile, so neighbouring tiles stay clear.
    const inset = BUILD_BORDER_PX / 2;
    const span = TILE_SIZE - BUILD_BORDER_PX;
    const trace = (points: Point[]) => {
      ctx!.beginPath();
      points.forEach((p, i) => {
        const px = x * TILE_SIZE + inset + p.x * span;
        const py = y * TILE_SIZE + inset + p.y * span;
        if (i === 0) ctx!.moveTo(px, py);
        else ctx!.lineTo(px, py);
      });
      ctx!.stroke();
    };
    ctx!.lineWidth = BUILD_BORDER_PX;
    ctx!.strokeStyle = COLOURS.buildTrack;
    trace(borderTrace(1));
    ctx!.strokeStyle = borderColour(fraction);
    trace(filled);
    ctx!.lineWidth = 1;
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

  /**
   * A small flag in a raider's colour where their enemy died: a pole with a pennant, fading out
   * over its last FLAG_FADE_TICKS.
   */
  function drawFlag(effect: Extract<GameState["effects"][number], { kind: "flag" }>) {
    drawPennant(effect, playerColour(effect.owner), Math.min(1, effect.ttl / FLAG_FADE_TICKS));
  }

  /** A ring in the raider's colour round the enemy they're playing. */
  function drawOwnRing(enemy: Point) {
    ctx!.strokeStyle = playerColour(viewer);
    ctx!.lineWidth = 2;
    ctx!.beginPath();
    const r = TILE_SIZE * 0.47;
    ctx!.arc((enemy.x + 0.5) * TILE_SIZE, (enemy.y + 0.5) * TILE_SIZE, r, 0, Math.PI * 2);
    ctx!.stroke();
    ctx!.lineWidth = 1;
  }

  /** A small flag on a tile: a pole and a pennant, with a number beside it if given. */
  function drawPennant(at: Point, colour: string, alpha = 1, label?: string) {
    const left = (at.x + 0.35) * TILE_SIZE;
    const top = (at.y + 0.15) * TILE_SIZE;
    ctx!.globalAlpha = alpha;
    ctx!.strokeStyle = COLOURS.flagPole;
    ctx!.lineWidth = 1.5;
    ctx!.beginPath();
    ctx!.moveTo(left, top);
    ctx!.lineTo(left, top + TILE_SIZE * 0.7);
    ctx!.stroke();
    ctx!.fillStyle = colour;
    ctx!.beginPath();
    ctx!.moveTo(left, top);
    ctx!.lineTo(left + TILE_SIZE * 0.4, top + TILE_SIZE * 0.15);
    ctx!.lineTo(left, top + TILE_SIZE * 0.3);
    ctx!.closePath();
    ctx!.fill();
    if (label) {
      ctx!.font = FLAG_LABEL_FONT;
      ctx!.fillStyle = colour;
      ctx!.fillText(label, left + TILE_SIZE * 0.35, top + TILE_SIZE * 0.55);
    }
    ctx!.globalAlpha = 1;
    ctx!.lineWidth = 1;
  }

  /**
   * A raider's pathing flags, numbered in the order they'll be done, joined from `from` (their
   * enemy) by a faint line. Only the raider sees them.
   */
  function drawPathFlags(flags: readonly Point[], colour: string, from?: Point) {
    if (flags.length === 0) return;
    ctx!.strokeStyle = colour;
    ctx!.globalAlpha = 0.5;
    ctx!.setLineDash([3, 3]);
    ctx!.beginPath();
    const points = from ? [from, ...flags] : flags;
    points.forEach((p, i) => {
      const x = (p.x + 0.5) * TILE_SIZE;
      const y = (p.y + 0.5) * TILE_SIZE;
      if (i === 0) ctx!.moveTo(x, y);
      else ctx!.lineTo(x, y);
    });
    ctx!.stroke();
    ctx!.setLineDash([]);
    ctx!.globalAlpha = 1;
    flags.forEach((f, i) => drawPennant(f, colour, 0.9, String(i + 1)));
  }

  /**
   * The raiders' paths: a wash over each painted tile, and a flag on each stretch's end, where
   * enemies leave it. Only raiders see them.
   */
  function drawRaidPaths(state: GameState) {
    if (state.raidPaths.length === 0) return;
    ctx!.fillStyle = COLOURS.raidPath;
    ctx!.globalAlpha = 0.3;
    for (const i of state.raidPaths) {
      const x = i % state.width;
      const y = Math.floor(i / state.width);
      ctx!.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    ctx!.globalAlpha = 1;
    if (pathEnds.paths !== state.raidPaths) {
      pathEnds = { paths: state.raidPaths, ends: stretchEnds(state) };
    }
    for (const i of pathEnds.ends) {
      drawPennant({ x: i % state.width, y: Math.floor(i / state.width) }, COLOURS.raidPathEnd);
    }
  }

  /** A border just inside a tile. */
  function outlineTile(p: Point, colour: string) {
    ctx!.strokeStyle = colour;
    ctx!.lineWidth = 2;
    ctx!.strokeRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx!.lineWidth = 1;
  }

  /** A faint S on each spawner's door, over the terrain, so you can see where not to build. */
  function drawDoors(state: GameState) {
    for (const structure of Object.values(state.structures)) {
      const stats: StructureStats = STRUCTURES[structure.kind];
      if (!stats.spawner || !isBuilt(structure)) continue;
      const door = spawnTileOf(state, structure);
      if (!door || !isExplored(state, door.x, door.y, viewer)) continue;
      ctx!.globalAlpha = DOOR_ALPHA;
      drawGlyph(door.x, door.y, "S", COLOURS.door);
      ctx!.globalAlpha = 1;
    }
  }

  function drawEffects(state: GameState) {
    for (const effect of state.effects) {
      const lands = effect.kind === "shot" ? { x: effect.toX, y: effect.toY } : effect;
      if (!canSeeEnemiesAt(state, lands.x, lands.y, viewer)) continue;
      if (effect.kind === "shot") {
        ctx!.strokeStyle = COLOURS.shot;
        ctx!.lineWidth = 2;
        const fromX = (effect.fromX + 0.5) * TILE_SIZE;
        const fromY = (effect.fromY + 0.5) * TILE_SIZE;
        const toX = (effect.toX + 0.5) * TILE_SIZE;
        const toY = (effect.toY + 0.5) * TILE_SIZE;
        // Every shot rises up the screen and drops onto its target, along a curve through a
        // point above the middle (higher the further it flies, and highest for a catapult).
        // Its projectile is part way along, with the arc it has flown trailing behind.
        const look = PROJECTILES[effect.projectile];
        const lift = Math.hypot(toX - fromX, toY - fromY) * look.arc;
        const cx = (fromX + toX) / 2;
        const cy = (fromY + toY) / 2 - lift;
        const at = (t: number) => ({
          x: (1 - t) ** 2 * fromX + 2 * (1 - t) * t * cx + t ** 2 * toX,
          y: (1 - t) ** 2 * fromY + 2 * (1 - t) * t * cy + t ** 2 * toY,
        });
        const flown = (effect.flight - effect.ttl + 1) / effect.flight;
        ctx!.beginPath();
        ctx!.moveTo(fromX, fromY);
        for (let i = 1; i <= ARC_SEGMENTS; i++) {
          const p = at((flown * i) / ARC_SEGMENTS);
          ctx!.lineTo(p.x, p.y);
        }
        ctx!.stroke();
        const head = at(flown);
        ctx!.save();
        ctx!.translate(head.x, head.y);
        if (look.turns) {
          // Point along the curve: its direction is the derivative of the curve at `flown`.
          const dx = (1 - flown) * (cx - fromX) + flown * (toX - cx);
          const dy = (1 - flown) * (cy - fromY) + flown * (toY - cy);
          ctx!.rotate(Math.atan2(dy, dx));
        }
        ctx!.font = GLYPH_FONT;
        ctx!.fillStyle = COLOURS.projectile;
        ctx!.fillText(look.glyph, 0, 1);
        ctx!.restore();
        ctx!.lineWidth = 1;
      } else if (effect.kind === "spikes") {
        drawTile(effect.x, effect.y, COLOURS.spikesUp, "^", COLOURS.spikesUpGlyph);
      } else if (effect.kind === "heal") {
        // Floats up a little over its life, above the enemy it healed.
        const rise = (1 - effect.ttl / HEAL_EFFECT_TICKS) * TILE_SIZE * 0.5;
        ctx!.font = GLYPH_FONT;
        ctx!.fillStyle = COLOURS.heal;
        ctx!.fillText("+", (effect.x + 0.5) * TILE_SIZE, (effect.y + 0.2) * TILE_SIZE - rise);
      } else if (effect.kind === "burst") {
        drawBurst(effect);
      } else if (effect.kind === "flag") {
        drawFlag(effect);
      } else {
        if (effect.ttl > EFFECT_TICKS) continue; // the shot is still in the air
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

  /**
   * Something destroyed: still there a moment with its health bar emptied (black, with a
   * sliver of red), then its pixels flying apart and fading: an enemy in its colour with a few
   * sparks, a structure in its fill with bits of its symbol colour. The emptied bar fades out
   * with the pieces.
   */
  function drawBurst(burst: Extract<GameState["effects"][number], { kind: "burst" }>) {
    const colours = burst.enemy
      ? [ENEMY_COLOURS[burst.enemy], ENEMY_COLOURS[burst.enemy], COLOURS.burstSpark]
      : burst.unit && burst.owner !== undefined
        ? [playerColour(burst.owner), playerColour(burst.owner), COLOURS.burstSpark]
        : burst.structure
          ? [
              STRUCTURE_COLOURS[burst.structure].bg,
              STRUCTURE_COLOURS[burst.structure].bg,
              STRUCTURE_COLOURS[burst.structure].fg,
            ]
          : [COLOURS.burstSpark];
    if (burstWaiting(burst)) {
      // Still there for a moment, health bar emptied, before it bursts.
      if (burst.enemy) {
        const kind = ENEMY_KINDS[burst.enemy];
        ctx!.font = enemyFont(kind.variants[0].size);
        ctx!.fillStyle = ENEMY_COLOURS[burst.enemy];
        ctx!.fillText(kind.glyph, (burst.x + 0.5) * TILE_SIZE, (burst.y + 0.5) * TILE_SIZE + 1);
      } else if (burst.unit && burst.owner !== undefined) {
        ctx!.font = GLYPH_FONT;
        ctx!.fillStyle = playerColour(burst.owner);
        const glyph = UNIT_KINDS[burst.unit].glyph;
        ctx!.fillText(glyph, (burst.x + 0.5) * TILE_SIZE, (burst.y + 0.5) * TILE_SIZE + 1);
      } else if (burst.structure) {
        const look = STRUCTURE_COLOURS[burst.structure];
        drawStructureTile(burst.x, burst.y, burst.structure);
        drawGlyph(burst.x, burst.y, glyphFor(burst.structure), look.fg);
      }
      drawHpBar(burst.x, burst.y, 0, COLOURS.hpEmpty);
      return;
    }
    const pixels = burstPixels(burst, colours.length);
    ctx!.globalAlpha = pixels[0]?.alpha ?? 0;
    drawHpBar(burst.x, burst.y, 0, COLOURS.hpEmpty);
    for (const p of pixels) {
      ctx!.globalAlpha = p.alpha;
      ctx!.fillStyle = colours[p.colour];
      ctx!.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx!.globalAlpha = 1;
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

  /** Units in their owner's colour. A rival's are hidden in fog, as enemies are. */
  function drawUnits(state: GameState, units: GameState["units"]) {
    ctx!.font = GLYPH_FONT;
    for (const unit of units) {
      if (!canSeeEnemiesAt(state, unit.x, unit.y, viewer)) continue;
      ctx!.fillStyle = playerColour(unit.owner);
      const glyph = UNIT_KINDS[unit.kind].glyph;
      ctx!.fillText(glyph, (unit.x + 0.5) * TILE_SIZE, (unit.y + 0.5) * TILE_SIZE + 1);
      drawHealth(`u${unit.id}`, unit);
    }
  }

  function drawEnemies(state: GameState, enemies: GameState["enemies"]) {
    // A raider's own enemy gets a ring, on their screen only: nobody else can tell it apart.
    const own = state.players[viewer]?.raid?.enemyId ?? null;
    for (const enemy of enemies) {
      if (!canSeeEnemiesAt(state, enemy.x, enemy.y, viewer)) continue;
      if (enemy.id === own) drawOwnRing(enemy);
      const kind = ENEMY_KINDS[enemy.kind];
      ctx!.font = enemyFont(kind.variants[enemy.variant].size);
      ctx!.fillStyle = ENEMY_COLOURS[enemy.kind];
      ctx!.fillText(kind.glyph, (enemy.x + 0.5) * TILE_SIZE, (enemy.y + 0.5) * TILE_SIZE + 1);
      drawHealth(`e${enemy.id}`, enemy);
    }
  }

  /** A health bar over a tile; `front` colours what's left (always at least a sliver). */
  function drawHpBar(x: number, y: number, fraction: number, front = COLOURS.hpFront) {
    if (!barsShown) return;
    if (iso) {
      drawUprightBar(x, y, fraction, front);
      return;
    }
    const left = x * TILE_SIZE + 2;
    const top = y * TILE_SIZE;
    const barWidth = TILE_SIZE - 4;
    ctx!.fillStyle = COLOURS.hpBack;
    ctx!.fillRect(left, top, barWidth, 3);
    ctx!.fillStyle = front;
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

  /**
   * Lifts what's drawn next by a block's height (in map pixels): up the screen on the flat map,
   * and up off the ground over the 3D view.
   */
  function liftBy(height: number) {
    if (!iso) {
      ctx!.translate(0, -height);
      return;
    }
    const m = ctx!.getTransform();
    const { cam, dpr } = iso;
    const up = (height / TILE_SIZE) * ISO.heightScale * Math.cos(cam.pitch) * tilePixels(cam) * dpr;
    ctx!.setTransform(m.a, m.b, m.c, m.d, m.e, m.f - up);
  }

  /** Map pixels to the screen through the iso view: the ground plane is an affine map. */
  function isoTransform(cam: Camera, dpr: number) {
    const origin = tileToScreen(cam, 0, 0);
    const east = tileToScreen(cam, 1, 0);
    const south = tileToScreen(cam, 0, 1);
    const k = dpr / TILE_SIZE;
    ctx!.setTransform(
      (east.x - origin.x) * k,
      (east.y - origin.y) * k,
      (south.x - origin.x) * k,
      (south.y - origin.y) * k,
      origin.x * dpr,
      origin.y * dpr,
    );
  }

  /** A health bar over the 3D view: upright on screen, over the top of what it's for. */
  function drawUprightBar(x: number, y: number, fraction: number, front: string) {
    const { cam, state, dpr } = iso!;
    const tileX = Math.round(x);
    const tileY = Math.round(y);
    const standing = blockHeight(state, tileX, tileY) > 0 ? 0.25 : 1;
    const height = (blockHeight(state, tileX, tileY) / TILE_SIZE) * ISO.heightScale + standing;
    const at = tileToScreen(cam, x + 0.5, y + 0.5, height);
    const width = Math.max(12, tilePixels(cam) * 0.9);
    const m = ctx!.getTransform();
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.fillStyle = COLOURS.hpBack;
    ctx!.fillRect(at.x - width / 2, at.y, width, 3);
    ctx!.fillStyle = front;
    ctx!.fillRect(at.x - width / 2, at.y, Math.max(1, width * fraction), 3);
    ctx!.setTransform(m);
  }

  /** Each keep's HP over the 3D view, upright over its middle. */
  function drawUprightKeepHp(state: GameState, cam: Camera, dpr: number) {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.font = `${Math.round(Math.max(12, tilePixels(cam) * 0.8))}px ${GLYPH_FONTS}`;
    ctx!.lineWidth = 3;
    ctx!.lineJoin = "round";
    ctx!.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx!.fillStyle = COLOURS.keepGlyph;
    for (const keep of state.keeps) {
      const centre = keep.size / 2;
      const top = (blockHeight(state, keep.x, keep.y) / TILE_SIZE) * ISO.heightScale;
      const at = tileToScreen(cam, keep.x + centre, keep.y + centre, top + 0.6);
      const text = String(Math.ceil(keep.hp));
      ctx!.strokeText(text, at.x, at.y);
      ctx!.fillText(text, at.x, at.y);
    }
    ctx!.lineWidth = 1;
  }

  return {
    /**
     * The whole map drawn flat, every tile, at `pixelsPerTile`: for the 3D view's ground and
     * block tops. No bars (they're drawn over the 3D view), no shadows or lift; fog as a tint.
     */
    renderFlat(state: GameState, viewer_: PlayerId, pixelsPerTile: number, turns: Rotation = 0) {
      viewer = viewer_;
      hover = null;
      now = performance.now();
      const width = state.width * pixelsPerTile;
      const height = state.height * pixelsPerTile;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const scale = pixelsPerTile / TILE_SIZE;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      view = { x0: 0, y0: 0, x1: state.width - 1, y1: state.height - 1 };
      textured = pixelsPerTile >= TEXTURE_MIN_TILE_PX;
      barsShown = false;
      const showOwners = Object.keys(state.players).length > 1;
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          drawTileContents(state, x, y, showOwners);
          drawEnclosureTint(state, x, y, 0);
        }
      }
      drawDoors(state);
      // No looking back's glow over the land the next wave of lava takes (repainted every so
      // often, so it doesn't pulse here).
      drawLavaWarning(state, turns, false);
      barsShown = true;
      if (!state.fog) return;
      const tiers = getSight(state, viewer);
      ctx.fillStyle = FOG.colour;
      for (let i = 0; i < tiers.length; i++) {
        if (tiers[i] === IN_SIGHT) continue;
        ctx.globalAlpha = tiers[i] === SEEN ? FOG.seen.opacity : 1;
        const x = i % state.width;
        const y = (i - x) / state.width;
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
      ctx.globalAlpha = 1;
    },

    /**
     * What goes over the 3D view, on a see-through canvas: effects, builds on the way, the
     * ghost and range, the hover edge, raiders' paths and flags through the iso transform, and
     * health bars and keeps' HP upright.
     */
    renderOverlay(state: GameState, ui: UiState, pending: readonly PendingBuild[] = []) {
      viewer = ui.playerId;
      hover = ui.hover;
      now = performance.now();
      const cam = ui.camera;
      const dpr = canvas.width / cam.viewWidth;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      iso = { cam, state, dpr };
      isoTransform(cam, dpr);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      view = visibleTiles(cam);
      if (ui.showFlow) drawFlow(state);
      drawEffects(state);
      drawPending(pending);
      if (!ui.pickerOpen) {
        drawRange(state, ui);
        drawGhost(state, ui);
      }
      drawHoverEdge(state, ui);
      drawKing(state);
      const raid = state.players[viewer]?.raid;
      const own = raid ? state.enemies.find((e) => e.id === raid.enemyId) : undefined;
      if (raid) {
        drawRaidPaths(state);
        if (ui.raidTarget && raid.enemyId !== null)
          outlineTile(ui.raidTarget, playerColour(viewer));
        drawPathFlags(raid.plan, playerColour(viewer), own);
      }
      if (own) drawOwnRing(own);
      // Health bars, upright over what they're for.
      for (const structure of Object.values(state.structures)) {
        const { x, y } = structure;
        if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
        if (!isExplored(state, x, y, viewer)) continue;
        drawBars(structure, structure);
      }
      for (let y = view.y0; y <= view.y1; y++) {
        for (let x = view.x0; x <= view.x1; x++) {
          if (state.resources[y * state.width + x] > 0) drawResourceLeft(state, x, y);
        }
      }
      for (const unit of state.units) {
        if (canSeeEnemiesAt(state, unit.x, unit.y, viewer)) drawHealth(`u${unit.id}`, unit);
      }
      for (const enemy of state.enemies) {
        if (canSeeEnemiesAt(state, enemy.x, enemy.y, viewer)) drawHealth(`e${enemy.id}`, enemy);
      }
      drawUprightKeepHp(state, cam, dpr);
      iso = null;
      hpBars.endFrame();
    },

    render(state: GameState, ui: UiState, pending: readonly PendingBuild[] = []) {
      viewer = ui.playerId;
      hover = ui.hover;
      now = performance.now();
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
      textured = tilePixels(cam) >= TEXTURE_MIN_TILE_PX;
      const hour = skyHour(state.clock, ui.clock);
      shadow = `rgba(0, 0, 0, ${SHADOW_ALPHA * (hour === undefined ? 1 : daylight(hour))})`;
      drawGrid(state, ui.sun);
      drawKeepHp(state);
      if (ui.showFlow) drawFlow(state);
      drawEffects(state);
      drawLavaWarning(state, ui.rotation);
      drawFog(state);
      if (hour !== undefined) drawNight(state, darknessAt(hour));
      drawPending(pending);
      // While the build menu is open, what's chosen in it isn't on the map yet: no ghost or range.
      if (!ui.pickerOpen) {
        drawRange(state, ui);
        drawGhost(state, ui);
      }
      drawHoverEdge(state, ui);
      drawCampPath(state);
      drawKing(state);
      const raid = state.players[viewer]?.raid;
      if (raid) {
        // The paths every free enemy keeps to, the raider's target, and their enemy's flags.
        drawRaidPaths(state);
        if (ui.raidTarget && raid.enemyId !== null)
          outlineTile(ui.raidTarget, playerColour(viewer));
        const own = state.enemies.find((e) => e.id === raid.enemyId);
        drawPathFlags(raid.plan, playerColour(viewer), own);
      }
      hpBars.endFrame();
    },
  };
}
