type RasterPixel = [number, number, number, number];

type RasterPixelBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

export function resolveRasterCircleBounds(args: {
  height: number;
  point: { x: number; y: number };
  radius: number;
  width: number;
}): RasterPixelBounds {
  return {
    maxX: Math.min(args.width - 1, Math.ceil(args.point.x + args.radius)),
    maxY: Math.min(args.height - 1, Math.ceil(args.point.y + args.radius)),
    minX: Math.max(0, Math.floor(args.point.x - args.radius)),
    minY: Math.max(0, Math.floor(args.point.y - args.radius)),
  };
}

export function readRasterPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number
): RasterPixel {
  const offset = (y * width + x) * 4;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 0];
}

export function matchesRasterTolerance(
  left: readonly number[],
  right: readonly number[],
  tolerance: number
): boolean {
  const [leftRed = 0, leftGreen = 0, leftBlue = 0, leftAlpha = 0] = left;
  const [rightRed = 0, rightGreen = 0, rightBlue = 0, rightAlpha = 0] = right;

  return (
    Math.abs(leftRed - rightRed) +
      Math.abs(leftGreen - rightGreen) +
      Math.abs(leftBlue - rightBlue) +
      Math.abs(leftAlpha - rightAlpha) <=
    tolerance
  );
}

export function pushRasterPixelNeighbors(
  queue: number[],
  pixel: number,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  if (x > 0) {
    queue.push(pixel - 1);
  }
  if (x < width - 1) {
    queue.push(pixel + 1);
  }
  if (y > 0) {
    queue.push(pixel - width);
  }
  if (y < height - 1) {
    queue.push(pixel + width);
  }
}
