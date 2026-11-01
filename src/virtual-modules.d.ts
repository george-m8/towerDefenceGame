// Modules made up at build time by Vite plugins (see vite.config.ts).

declare module "virtual:music-packs" {
  /** Music packs found in public/music/music-packs/ (tools/musicPacks.ts). */
  const packs: import("./audio/places").PackFiles;
  export default packs;
}

declare module "virtual:maps" {
  /** The `.map` files in maps/, parsed, by name (tools/maps.ts). */
  const maps: Record<string, import("./sim/mapFile").MapFile>;
  export default maps;
}

declare module "virtual:items" {
  /** The `.items` files in items/, parsed, by name (tools/items.ts). */
  const items: Record<string, import("./sim/itemsFile").ItemsFile>;
  export default items;
}

declare module "virtual:levels" {
  /** The campaign levels, a folder each in levels/, read and checked, in order (tools/levels.ts). */
  const levels: Record<string, import("./sim/levelFile").Level>;
  export default levels;
}
