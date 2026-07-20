import { createRasterCanvas, getRasterImageData } from '../bitmap';

export function createEmptyRasterMask(width: number, height: number): HTMLCanvasElement {
  return createRasterCanvas(width, height);
}

function clearRasterMask(maskCanvas: HTMLCanvasElement): void {
  const context = maskCanvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
}

export function rasterMaskHasPixels(maskCanvas: HTMLCanvasElement): boolean {
  const { data } = getRasterImageData(maskCanvas);
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 0) > 0) {
      return true;
    }
  }

  return false;
}

export function replaceRasterMaskWithRect(
  maskCanvas: HTMLCanvasElement,
  rect: { left: number; top: number; width: number; height: number }
): void {
  const context = maskCanvas.getContext('2d');
  if (!context) {
    return;
  }

  clearRasterMask(maskCanvas);
  context.fillStyle = '#ffffff';
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
}

export function replaceRasterMaskWithPolygon(
  maskCanvas: HTMLCanvasElement,
  points: ReadonlyArray<{ x: number; y: number }>
): void {
  const context = maskCanvas.getContext('2d');
  if (!context) {
    return;
  }

  clearRasterMask(maskCanvas);
  if (points.length < 3) {
    return;
  }

  context.fillStyle = '#ffffff';
  context.beginPath();
  context.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fill();
}
