// Modules made up at build time by Vite plugins (see vite.config.ts).

declare module "virtual:music-packs" {
  /** Music packs found in public/music/music-packs/ (tools/musicPacks.ts). */
  const packs: import("./audio/places").PackFiles;
  export default packs;
}
