import type { BlurBackdropBounds } from '../bounds';

function clampEdge(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function extendBackdropCanvasEdges(options: {
  backdropCanvas: HTMLCanvasElement;
  bounds: BlurBackdropBounds;
  context: CanvasRenderingContext2D;
  sceneHeight: number;
  sceneWidth: number;
}): void {
  const { backdropCanvas, bounds, context, sceneHeight, sceneWidth } = options;
  const width = backdropCanvas.width;
  const height = backdropCanvas.height;
  const leftEdge = clampEdge(Math.ceil(-bounds.left), 0, width);
  const topEdge = clampEdge(Math.ceil(-bounds.top), 0, height);
  const rightEdge = clampEdge(Math.floor(sceneWidth - bounds.left), 0, width);
  const bottomEdge = clampEdge(Math.floor(sceneHeight - bounds.top), 0, height);

  if (leftEdge > 0 && leftEdge < width) {
    context.drawImage(backdropCanvas, leftEdge, 0, 1, height, 0, 0, leftEdge, height);
  }
  if (rightEdge > 0 && rightEdge < width) {
    context.drawImage(
      backdropCanvas,
      rightEdge - 1,
      0,
      1,
      height,
      rightEdge,
      0,
      width - rightEdge,
      height
    );
  }
  if (topEdge > 0 && topEdge < height) {
    context.drawImage(backdropCanvas, 0, topEdge, width, 1, 0, 0, width, topEdge);
  }
  if (bottomEdge > 0 && bottomEdge < height) {
    context.drawImage(
      backdropCanvas,
      0,
      bottomEdge - 1,
      width,
      1,
      0,
      bottomEdge,
      width,
      height - bottomEdge
    );
  }
}
