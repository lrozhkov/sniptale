import { getRasterImageData } from '../bitmap';

export function getRasterMaskBounds(maskCanvas: HTMLCanvasElement): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null {
  const { data, width, height } = getRasterImageData(maskCanvas);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] === 0) {
      continue;
    }

    const pixelIndex = (index - 3) / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
