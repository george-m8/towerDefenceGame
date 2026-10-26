// A player's picture: a 3x3 grid of the game's own tiles (land, buildings, the keep, enemies
// and units), drawn in their map colours and glyphs. Chosen on the player select screen; a
// player who hasn't chosen one gets one made from their name, so it's always the same.
import {
  ENEMY_KIND_ORDER,
  ENEMY_KINDS,
  STRUCTURES,
  TERRAIN,
  UNIT_KIND_ORDER,
  UNIT_KINDS,
} from "../sim/config";
import type { StructureKind, Terrain } from "../sim/types";
import {
  COLOURS,
  ENEMY_COLOURS,
  GLYPHS,
  KEEP_GLYPH,
  PLAYER_COLOURS,
  STRUCTURE_COLOURS,
  TERRAIN_STYLES,
} from "../render/palette";

/** The cells in a picture, row by row. */
export const PICTURE_CELLS = 9;

export type PictureGroup = "Land" | "Buildings" | "Enemies" | "Units";

export interface PictureTile {
  /** Saved in the picture: "land:tree", "building:archer", "keep", "enemy:goblin", "unit:militia". */
  id: string;
  name: string;
  group: PictureGroup;
  glyph: string;
  fg: string;
  bg: string;
}

/** A picture: PICTURE_CELLS tile ids. */
export type Picture = string[];

const land: PictureTile[] = (Object.keys(TERRAIN) as Terrain[]).map((terrain) => {
  const style = terrain === "ground" ? { bg: COLOURS.ground } : TERRAIN_STYLES[terrain];
  return {
    id: `land:${terrain}`,
    name: TERRAIN[terrain].name,
    group: "Land",
    glyph: "glyph" in style ? (style.glyph ?? "") : "",
    fg: "fg" in style ? (style.fg ?? "#ffffff") : "#ffffff",
    bg: style.bg,
  };
});

const buildings: PictureTile[] = [
  {
    id: "keep",
    name: "Keep",
    group: "Buildings",
    glyph: KEEP_GLYPH,
    fg: COLOURS.keepGlyph,
    bg: COLOURS.keep,
  },
  ...(Object.keys(STRUCTURES) as StructureKind[]).map((kind) => ({
    id: `building:${kind}`,
    name: STRUCTURES[kind].name,
    group: "Buildings" as const,
    glyph: GLYPHS[kind],
    fg: STRUCTURE_COLOURS[kind].fg,
    bg: STRUCTURE_COLOURS[kind].bg,
  })),
];

const enemies: PictureTile[] = ENEMY_KIND_ORDER.map((kind) => ({
  id: `enemy:${kind}`,
  name: ENEMY_KINDS[kind].name,
  group: "Enemies",
  glyph: ENEMY_KINDS[kind].glyph,
  fg: ENEMY_COLOURS[kind],
  bg: COLOURS.ground,
}));

const units: PictureTile[] = UNIT_KIND_ORDER.map((kind) => ({
  id: `unit:${kind}`,
  name: UNIT_KINDS[kind].name,
  group: "Units",
  glyph: UNIT_KINDS[kind].glyph,
  fg: PLAYER_COLOURS[0],
  bg: COLOURS.ground,
}));

/** Every tile a picture can use, grouped as the picker shows them. */
export const PICTURE_TILES: PictureTile[] = [...land, ...buildings, ...enemies, ...units];
export const PICTURE_GROUPS: PictureGroup[] = ["Land", "Buildings", "Enemies", "Units"];
const BY_ID = new Map(PICTURE_TILES.map((t) => [t.id, t]));

export function pictureTile(id: string): PictureTile {
  return BY_ID.get(id) ?? BY_ID.get("land:ground")!;
}

/**
 * A random picture: a patch of land with a few things on it. The same seed (a player's name)
 * always gives the same picture.
 */
export function randomPicture(seed: string): Picture {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const pick = (from: PictureTile[]) => from[Math.floor(random() * from.length)].id;
  const things = [...buildings, ...enemies, ...units];
  return Array.from({ length: PICTURE_CELLS }, () => pick(random() < 0.5 ? land : things));
}

/** A saved picture, checked: unknown tiles become ground, and a missing one is made up. */
export function cleanPicture(raw: unknown, seed: string): Picture {
  if (!Array.isArray(raw) || raw.length !== PICTURE_CELLS) return randomPicture(seed);
  return raw.map((id) => (typeof id === "string" && BY_ID.has(id) ? id : "land:ground"));
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One tile of a picture as HTML (a coloured square with its glyph). */
export function tileHtml(id: string, attributes = ""): string {
  const tile = pictureTile(id);
  return `<span class="picture-tile" style="background:${tile.bg};color:${tile.fg}" title="${escapeHtml(tile.name)}" ${attributes}>${escapeHtml(tile.glyph)}</span>`;
}
