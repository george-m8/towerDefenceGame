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
import { buildFractionAt, buildProgress } from "../sim/building";
import { facingAngle } from "../sim/aiming";
import {
  EFFECT_TICKS,
  HEAL_EFFECT_TICKS,
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
import { tilePixels, visibleTiles, type VisibleTiles } from "../ui/camera";
import { minimapColour } from "../ui/minimap";
import { KEEP, NONE, getEnclosures } from "../sim/enclosures";
import { SEEN, canSeeEnemiesAt, forEachSightTile, getSight, isExplored } from "../sim/fog";
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
} from "./palette";
import { fogImage } from "./fog";
import { curtainTier, type Curtain } from "../ui/curtain";
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
  LIGHTS.units.radius,
  ...Object.values(LIGHTS.structures).map((light) => light.radius),
);

/** How dark blocks' shadows are in full daylight, on the ground and on lower blocks beside them. */
const SHADOW_ALPHA = 0.3;

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

export function blockHeight(state: GameState, x: number, y: number): number {
  if (isKeepTile(state, x, y)) {
    // The corners stand a little taller, like towers, round a low middle.
    const keep = keepAt(state, x, y)!;
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
  if (base) return STRUCTURES[base.kind].blocksMovement ? 6 - sunk : 0;
  const terrain = terrainAt(state, x, y);
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
  /** Tile textures, drawn once each ("style:variant"). */
  const textureImages = new Map<string, HTMLCanvasElement>();
  /** False when zoomed too far out for textures to show. */
  let textured = true;
  /** The night's light map as an image, one pixel a tile (see drawNight). */
  const nightImage = document.createElement("canvas");
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
  /** The fog image and what it was made from: the sight, and the curtain's radius if any. */
  let fog: {
    tier: Uint8Array;
    radius: number | null;
    image: HTMLCanvasElement;
    lift: number;
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
        ctx!.fillStyle = minimapColour(state, x, y);
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
    drawTexture(x, y, KEEP_TEXTURE);
    if (x !== keep.x + centre || y !== keep.y + centre) {
      drawGlyph(x, y, KEEP_GLYPH, COLOURS.keepGlyph);
    }
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
    // A resource being worked shows what's left (in sight only, like enemies).
    const resource = resourceAt(state, x, y);
    if (resource && resource.goldLeft < resource.worth && canSeeEnemiesAt(state, x, y, viewer)) {
      drawHpBar(x, y, resource.goldLeft / resource.worth, COLOURS.resourceLeft);
    }
  }

  /** A tile's texture over its flat colour, unless zoomed too far out to see it. */
  function drawTexture(x: number, y: number, style: TextureStyle) {
    if (!textured) return;
    const variant = textureVariant(x, y);
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
    ctx!.drawImage(image, x * TILE_SIZE, y * TILE_SIZE);
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
   * it. The fog image is only rebuilt when sight changes. While a game is being swapped in, the
   * curtain's fog goes over it too (all of it, with fog of war off).
   */
  function drawFog(state: GameState, curtain: Curtain | null) {
    if (!state.fog && !curtain) return;
    const tier = getSight(state, viewer);
    // Rebuilt for every whole tile the curtain moves, not every frame.
    const radius = curtain && Math.round(curtain.radius);
    if (fog?.tier !== tier || fog.radius !== radius) {
      const drawn = curtain ? curtainTier(tier, state.width, state.height, curtain) : tier;
      fog = { tier, radius, ...fogImage(drawn, state.width, state.height) };
    }
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
    for (const enemy of enemies) {
      if (!canSeeEnemiesAt(state, enemy.x, enemy.y, viewer)) continue;
      const kind = ENEMY_KINDS[enemy.kind];
      ctx!.font = enemyFont(kind.variants[enemy.variant].size);
      ctx!.fillStyle = ENEMY_COLOURS[enemy.kind];
      ctx!.fillText(kind.glyph, (enemy.x + 0.5) * TILE_SIZE, (enemy.y + 0.5) * TILE_SIZE + 1);
      drawHealth(`e${enemy.id}`, enemy);
    }
  }

  /** A health bar over a tile; `front` colours what's left (always at least a sliver). */
  function drawHpBar(x: number, y: number, fraction: number, front = COLOURS.hpFront) {
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

  return {
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
      drawFog(state, ui.curtain);
      if (hour !== undefined) drawNight(state, darknessAt(hour));
      drawPending(pending);
      drawRange(state, ui);
      drawGhost(state, ui);
      hpBars.endFrame();
    },
  };
}
