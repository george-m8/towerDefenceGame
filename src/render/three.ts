// The 3D renderer (?3d): the same game as canvas.ts, drawn with WebGL through an isometric
// orthographic camera that matches camera.ts's iso maths, so clicks land where they look.
//
// The flat renderer paints the whole map, flat, into a texture (renderFlat): the ground and the
// tops of raised blocks show that, so tiles look exactly as on the flat map, glyphs and all.
// Raised blocks are instanced boxes; enemies and units are glyphs on cards standing up and facing
// the camera, from a glyph atlas. Effects, bars and the ghost go over it all on the flat
// renderer's own canvas (renderOverlay). World units are tiles: x east, z south, y up.
import * as THREE from "three";
import { ENEMY_KINDS, UNIT_KINDS } from "../sim/config";
import { SEEN, UNEXPLORED, canSeeEnemiesAt, getSight } from "../sim/fog";
import { minimapColour } from "../ui/minimap";
import type { GameState, PlayerId } from "../sim/types";
import { ISO, tilePixels, viewCentre, type Camera } from "../ui/camera";
import type { UiState } from "../ui/state";
import { blockHeight, createRenderer } from "./canvas";
import { darknessAt, daylight, skyHour } from "./dayNight";
import { sunDirection } from "./sun";
import {
  COLOURS,
  ENEMY_COLOURS,
  FOG,
  ENEMY_GLYPH_SCALE,
  GLYPH_FONTS,
  TILE_SIZE,
  playerColour,
} from "./palette";

/** How far back the camera sits along its view line, in tiles (orthographic: only for depth). */
const CAMERA_DISTANCE = 400;
/**
 * The map texture's size limit, in pixels each way (or the GPU's, if smaller); maps too big for
 * a full tile's pixels get fewer.
 */
const MAP_TEXTURE_MAX = 8192;
/** The map texture's pixels a tile, at most (the flat map's own size). */
const MAP_TEXTURE_TILE_MAX = TILE_SIZE;
/** Repainting the map texture: at most this often when something changed... */
const REPAINT_MIN_MS = 300;
/** ...and at least this often anyway (building progress, damage, ore being mined). */
const REPAINT_MAX_MS = 1500;
/** The glyph atlas: cells across (and down), and each cell's size in pixels. */
const ATLAS_CELLS = 16;
const ATLAS_CELL_PX = 64;
/** The lights by day: the sky's fill and the sun. Night dims them (see placeSun). */
const SKY_LIGHT = 1.8;
const SUN_LIGHT = 2;
/** How much of the sky's light is left at the darkest of night. */
const NIGHT_SKY = 0.25;
/** How tall an enemy's or unit's card stands, in tiles, before its size. */
const CARD_TILES = 1.1;

/** A block's height in tiles, from canvas.ts's height in pixels. */
export function blockTiles(state: GameState, x: number, y: number): number {
  return (blockHeight(state, x, y) / TILE_SIZE) * ISO.heightScale;
}

/**
 * The camera's axes for its angles (see ISO): right and up on screen, and back towards the
 * camera. Built directly rather than with lookAt, which can't look straight down.
 */
function cameraAxes(cam: Camera) {
  const cosYaw = Math.cos(cam.yaw);
  const sinYaw = Math.sin(cam.yaw);
  const cosPitch = Math.cos(cam.pitch);
  const sinPitch = Math.sin(cam.pitch);
  return {
    right: new THREE.Vector3(cosYaw, 0, -sinYaw),
    up: new THREE.Vector3(-sinYaw * sinPitch, cosPitch, -cosYaw * sinPitch),
    back: new THREE.Vector3(sinYaw * cosPitch, sinPitch, cosYaw * cosPitch),
  };
}

/** Points the camera at the view's middle, from its angles. */
export function placeCamera(camera: THREE.OrthographicCamera, ui: UiState): void {
  const cam = ui.camera;
  const size = tilePixels(cam);
  camera.left = -cam.viewWidth / 2 / size;
  camera.right = cam.viewWidth / 2 / size;
  camera.top = cam.viewHeight / 2 / size;
  camera.bottom = -cam.viewHeight / 2 / size;
  camera.updateProjectionMatrix();
  const centre = viewCentre(cam);
  const { right, up, back } = cameraAxes(cam);
  camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
  camera.position.set(centre.x, 0, centre.y).addScaledVector(back, CAMERA_DISTANCE);
}

/** An instanced mesh that grows when it needs more room than it has. */
function instances(
  scene: THREE.Scene,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  shadows: boolean,
  /** Gives each new mesh its own geometry, e.g. with per-instance attributes added. */
  geometryFor?: (room: number) => THREE.BufferGeometry,
) {
  let mesh: THREE.InstancedMesh | null = null;
  return {
    /** Starts a frame's worth with room for `count`. */
    reserve(count: number): THREE.InstancedMesh {
      if (!mesh || mesh.instanceMatrix.count < count) {
        if (mesh) {
          scene.remove(mesh);
          if (geometryFor) mesh.geometry.dispose();
          mesh.dispose();
        }
        const room = Math.max(64, Math.ceil(count * 1.5));
        mesh = new THREE.InstancedMesh(geometryFor?.(room) ?? geometry, material, room);
        mesh.castShadow = shadows;
        mesh.receiveShadow = shadows;
        mesh.frustumCulled = false; // its bounds are its first instance's: cull by hand instead
        scene.add(mesh);
      }
      mesh.count = 0;
      return mesh;
    },
    /** Says the matrices, colours and attributes set since reserve() are ready to draw. */
    done() {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        if (attribute instanceof THREE.InstancedBufferAttribute) attribute.needsUpdate = true;
      }
    },
  };
}

/**
 * White glyphs with a dark edge, one a cell, tinted by each card's colour. Cells are handed out
 * as glyphs are first asked for, and all redrawn once the map's font has loaded.
 */
function createGlyphAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ATLAS_CELLS * ATLAS_CELL_PX;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const cells = new Map<string, number>();

  function paint(glyph: string, cell: number) {
    const x = (cell % ATLAS_CELLS) * ATLAS_CELL_PX;
    const y = Math.floor(cell / ATLAS_CELLS) * ATLAS_CELL_PX;
    ctx.clearRect(x, y, ATLAS_CELL_PX, ATLAS_CELL_PX);
    ctx.font = `${Math.round(ATLAS_CELL_PX * 0.8)}px ${GLYPH_FONTS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = ATLAS_CELL_PX * 0.1;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.strokeText(glyph, x + ATLAS_CELL_PX / 2, y + ATLAS_CELL_PX / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(glyph, x + ATLAS_CELL_PX / 2, y + ATLAS_CELL_PX / 2);
    texture.needsUpdate = true;
  }

  document.fonts?.addEventListener("loadingdone", () => {
    for (const [glyph, cell] of cells) paint(glyph, cell);
  });

  return {
    texture,
    /** The glyph's cell as (column, row from the bottom), the way the texture's UVs run. */
    cellOf(glyph: string): [number, number] {
      let cell = cells.get(glyph);
      if (cell === undefined) {
        cell = cells.size % (ATLAS_CELLS * ATLAS_CELLS); // full: reuse the oldest (unlikely)
        cells.set(glyph, cell);
        paint(glyph, cell);
      }
      return [cell % ATLAS_CELLS, ATLAS_CELLS - 1 - Math.floor(cell / ATLAS_CELLS)];
    },
  };
}

export function createRenderer3d(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOURS.offMap);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_DISTANCE * 2);

  const sky = new THREE.HemisphereLight(0xfff4e0, 0x403020, SKY_LIGHT);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xfff0d0, SUN_LIGHT);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // The map, painted flat by the flat renderer, as one texture.
  const paintCanvas = document.createElement("canvas");
  const painter = createRenderer(paintCanvas);
  const mapTexture = new THREE.CanvasTexture(paintCanvas);
  mapTexture.colorSpace = THREE.SRGBColorSpace;
  mapTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Hard pixel edges close up, as on the flat map (its font is a pixel font at a tile's size);
  // smoothed when zoomed out, so it doesn't shimmer.
  mapTexture.magFilter = THREE.NearestFilter;
  const textureMax = Math.min(MAP_TEXTURE_MAX, renderer.capabilities.maxTextureSize);
  /** The map's size in tiles, for the block tops' UVs. */
  const mapSize = { value: new THREE.Vector2(1, 1) };

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0.5),
    new THREE.MeshLambertMaterial({ map: mapTexture }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // Blocks: the top shows the map texture at the block's tile; the sides are plain, in the
  // block's colour (its instance colour), shaded by the light.
  const blockMaterial = new THREE.MeshLambertMaterial({ map: mapTexture });
  blockMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.mapSize = mapSize;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 mapSize;\nvarying float vTop;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vTop = normal.y > 0.5 ? 1.0 : 0.0;
        vec2 onMap = (instanceMatrix[3].xz - 0.5 + position.xz + 0.5) / mapSize;
        vMapUv = vec2(onMap.x, 1.0 - onMap.y);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vTop;")
      .replace("#include <map_fragment>", "if (vTop > 0.5) {\n#include <map_fragment>\n}")
      .replace("#include <color_fragment>", "if (vTop < 0.5) {\n#include <color_fragment>\n}");
  };
  const blocks = instances(
    scene,
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    blockMaterial,
    true,
  );

  // Cards: an enemy's or unit's glyph, standing on its point and turned to face the camera.
  const atlas = createGlyphAtlas();
  const cardGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const cardMaterial = new THREE.MeshBasicMaterial({
    map: atlas.texture,
    transparent: true,
    alphaTest: 0.4,
  });
  cardMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 cell;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>\nvMapUv = (cell + uv) / ${ATLAS_CELLS.toFixed(1)};`,
      );
  };
  // No shadows: a card's shadow would be its whole square, not its glyph.
  const cards = instances(scene, cardGeometry, cardMaterial, false, (room) => {
    const geometry = cardGeometry.clone();
    const cells = new THREE.InstancedBufferAttribute(new Float32Array(room * 2), 2);
    return geometry.setAttribute("cell", cells);
  });
  const chests = instances(
    scene,
    new THREE.BoxGeometry(0.5, 0.35, 0.4).translate(0, 0.175, 0),
    new THREE.MeshLambertMaterial(),
    true,
  );

  const colours = new Map<string, THREE.Color>();
  const colourOf = (css: string) => {
    let colour = colours.get(css);
    if (!colour) colours.set(css, (colour = new THREE.Color(css)));
    return colour;
  };
  const matrix = new THREE.Matrix4();
  const side = new THREE.Color();
  const fogColour = new THREE.Color(FOG.colour);
  const spot = new THREE.Vector3();
  const cardScale = new THREE.Vector3();

  let painted: { key: string; tiers: Uint8Array | null; at: number } = {
    key: "",
    tiers: null,
    at: -Infinity,
  };

  /** Repaints the map texture and rebuilds the blocks, when the map or sight changes. */
  function build(state: GameState, viewer: PlayerId, now: number) {
    const tiers = state.fog ? getSight(state, viewer) : null;
    const key = `${state.width}x${state.height}:${state.gridVersion}:${state.fog}`;
    const changed = key !== painted.key || tiers !== painted.tiers;
    if (now - painted.at < (changed ? REPAINT_MIN_MS : REPAINT_MAX_MS)) return;
    painted = { key, tiers, at: now };
    const { width, height } = state;
    const pixels = Math.max(
      4,
      Math.min(MAP_TEXTURE_TILE_MAX, Math.floor(textureMax / Math.max(width, height))),
    );
    const resized = paintCanvas.width !== width * pixels || paintCanvas.height !== height * pixels;
    painter.renderFlat(state, viewer, pixels);
    if (resized) mapTexture.dispose(); // a new size needs a new GPU texture
    mapTexture.needsUpdate = true;
    mapSize.value.set(width, height);
    ground.scale.set(width, 1, height);

    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) if (blockHeight(state, x, y) > 0) count++;
    }
    const mesh = blocks.reserve(count);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const h = blockTiles(state, x, y);
        const tier = tiers?.[y * width + x];
        if (h <= 0 || tier === UNEXPLORED) continue;
        matrix.makeScale(1, h, 1).setPosition(x + 0.5, 0, y + 0.5);
        mesh.setMatrixAt(mesh.count, matrix);
        // The sides' colour: the block's own, misted like its top where it's only been seen.
        side.copy(colourOf(minimapColour(state, x, y)));
        if (tier === SEEN) side.lerp(fogColour, FOG.seen.opacity);
        mesh.setColorAt(mesh.count, side);
        mesh.count++;
      }
    }
    blocks.done();
  }

  /** Enemies, units and chests: every frame, where the viewer can see them. */
  function placeMovers(state: GameState, viewer: PlayerId) {
    const mesh = cards.reserve(state.enemies.length + state.units.length);
    const cell = mesh.geometry.getAttribute("cell") as THREE.InstancedBufferAttribute;
    const card = (x: number, y: number, size: number, glyph: string, colour: string) => {
      // Standing on a block (a unit on a wall), it stands on the block's top.
      const top = blockTiles(state, Math.round(x), Math.round(y));
      spot.set(x + 0.5, top, y + 0.5);
      matrix.compose(spot, camera.quaternion, cardScale.setScalar(size));
      mesh.setMatrixAt(mesh.count, matrix);
      mesh.setColorAt(mesh.count, colourOf(colour));
      const [col, row] = atlas.cellOf(glyph);
      cell.setXY(mesh.count, col, row);
      mesh.count++;
    };
    for (const enemy of state.enemies) {
      if (!canSeeEnemiesAt(state, enemy.x, enemy.y, viewer)) continue;
      const kind = ENEMY_KINDS[enemy.kind];
      const scale = ENEMY_GLYPH_SCALE[kind.variants[enemy.variant].size];
      card(enemy.x, enemy.y, CARD_TILES * scale, kind.glyph, ENEMY_COLOURS[enemy.kind]);
    }
    for (const unit of state.units) {
      if (!canSeeEnemiesAt(state, unit.x, unit.y, viewer)) continue;
      card(unit.x, unit.y, CARD_TILES, UNIT_KINDS[unit.kind].glyph, playerColour(unit.owner));
    }
    cards.done();

    // Chests lie under the fog until their tile's explored, as on the flat map.
    const tiers = state.fog ? getSight(state, viewer) : null;
    const c = chests.reserve(state.features.length);
    for (const feature of state.features) {
      if (feature.kind !== "chest") continue;
      if (tiers?.[feature.y * state.width + feature.x] === UNEXPLORED) continue;
      matrix.makeTranslation(feature.x + 0.5, 0, feature.y + 0.5);
      c.setMatrixAt(c.count, matrix);
      c.setColorAt(c.count, colourOf(COLOURS.chest));
      c.count++;
    }
    chests.done();
  }

  /**
   * The sun where the flat map has it (the sun slider, or the day's clock), its shadows covering
   * what's on screen; dimmed with the daylight, the sky's light too as night falls.
   */
  function placeSun(state: GameState, ui: UiState) {
    const centre = viewCentre(ui.camera);
    const reach = Math.max(camera.right - camera.left, camera.top - camera.bottom);
    const way = sunDirection(ui.sun);
    sun.position.set(centre.x + way.x * reach * 2, way.y * reach * 2, centre.y + way.z * reach * 2);
    sun.target.position.set(centre.x, 0, centre.y);
    const hour = skyHour(state.clock, ui.clock);
    sun.intensity = SUN_LIGHT * (hour === undefined ? 1 : daylight(hour));
    const dark = hour === undefined ? 0 : darknessAt(hour);
    sky.intensity = SKY_LIGHT * (1 - (1 - NIGHT_SKY) * dark);
    const shadow = sun.shadow.camera;
    shadow.left = shadow.bottom = -reach;
    shadow.right = shadow.top = reach;
    shadow.near = 0.1;
    shadow.far = reach * 4;
    shadow.updateProjectionMatrix();
  }

  return {
    render(state: GameState, ui: UiState) {
      const cam = ui.camera;
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(cam.viewWidth, cam.viewHeight, false);
      placeCamera(camera, ui);
      placeSun(state, ui);
      build(state, ui.playerId, performance.now());
      placeMovers(state, ui.playerId);
      renderer.render(scene, camera);
    },
  };
}
