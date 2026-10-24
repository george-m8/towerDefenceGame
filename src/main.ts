import { GRID_HEIGHT, GRID_WIDTH } from "./sim/config";
import { createRenderer } from "./render/canvas";

const canvas = document.querySelector<HTMLCanvasElement>("#map")!;
const renderer = createRenderer(canvas, GRID_WIDTH, GRID_HEIGHT);
renderer.render();
