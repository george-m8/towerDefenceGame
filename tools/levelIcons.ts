// `npm run level-icons [-- --all]`: saves each campaign level's icon into its `.level` file
// (see saveLevelIcons in levels.ts).
import { saveLevelIcons } from "./levels";

const written = saveLevelIcons("levels", { all: process.argv.includes("--all") });
console.log(written.length ? `Saved icons for ${written.join(", ")}` : "Every level has its icon");
