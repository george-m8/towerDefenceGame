import { COLOURS, TILE_SIZE } from "./palette";

export function createRenderer(canvas: HTMLCanvasElement, width: number, height: number) {
  canvas.width = width * TILE_SIZE;
  canvas.height = height * TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  return {
    render() {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? COLOURS.ground : COLOURS.groundAlt;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    },
  };
}
