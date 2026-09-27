import { util, type TMat2D } from 'fabric';
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

export function extendTransformedBackdropCanvasEdges(options: {
  backdropCanvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  sceneHeight: number;
  sceneWidth: number;
  viewportTransform: TMat2D;
}): void {
  const { backdropCanvas, context, sceneHeight, sceneWidth, viewportTransform } = options;
  const width = backdropCanvas.width;
  const height = backdropCanvas.height;
  const captureToScene = util.invertTransform(viewportTransform);
  const captureCorners: [number, number][] = [
    [0.5, 0.5],
    [width - 0.5, 0.5],
    [width - 0.5, height - 0.5],
    [0.5, height - 0.5],
  ];
  if (
    captureCorners.every(([x, y]) => {
      const sceneX = captureToScene[0] * x + captureToScene[2] * y + captureToScene[4];
      const sceneY = captureToScene[1] * x + captureToScene[3] * y + captureToScene[5];
      return sceneX >= 0 && sceneX < sceneWidth && sceneY >= 0 && sceneY < sceneHeight;
    })
  ) {
    return;
  }

  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const source = new Uint8ClampedArray(imageData.data);
  const inset = Math.max(
    0.5,
    Math.hypot(captureToScene[0], captureToScene[1]),
    Math.hypot(captureToScene[2], captureToScene[3])
  );
  const insetX = Math.min(inset, sceneWidth / 2);
  const insetY = Math.min(inset, sceneHeight / 2);
  let changed = false;

  for (let y = 0; y < height; y += 1) {
    let sceneX = captureToScene[0] * 0.5 + captureToScene[2] * (y + 0.5) + captureToScene[4];
    let sceneY = captureToScene[1] * 0.5 + captureToScene[3] * (y + 0.5) + captureToScene[5];
    for (let x = 0; x < width; x += 1) {
      if (sceneX < 0 || sceneX >= sceneWidth || sceneY < 0 || sceneY >= sceneHeight) {
        const clampedX = Math.max(insetX, Math.min(sceneWidth - insetX, sceneX));
        const clampedY = Math.max(insetY, Math.min(sceneHeight - insetY, sceneY));
        const sampleX = clampEdge(
          Math.floor(
            viewportTransform[0] * clampedX + viewportTransform[2] * clampedY + viewportTransform[4]
          ),
          0,
          width - 1
        );
        const sampleY = clampEdge(
          Math.floor(
            viewportTransform[1] * clampedX + viewportTransform[3] * clampedY + viewportTransform[5]
          ),
          0,
          height - 1
        );
        const sourceIndex = (sampleY * width + sampleX) * 4;
        const targetIndex = (y * width + x) * 4;
        imageData.data.set(source.subarray(sourceIndex, sourceIndex + 4), targetIndex);
        changed = true;
      }
      sceneX += captureToScene[0];
      sceneY += captureToScene[1];
    }
  }

  if (changed) {
    context.putImageData(imageData, 0, 0);
  }
}
