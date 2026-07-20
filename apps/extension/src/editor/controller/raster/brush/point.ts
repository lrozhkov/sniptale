import { resolveRasterCircleBounds } from '../pixels';
import { resolveBrushAlpha } from './alpha';
import { compositeRasterBrushPixel } from './composite';
import type { RasterBrushPointPaintArgs } from './types';

export function paintRasterBrushPoint(args: RasterBrushPointPaintArgs): boolean {
  const { maxX, maxY, minX, minY } = resolveRasterCircleBounds({
    height: args.bitmap.height,
    point: args.point,
    radius: args.radius,
    width: args.bitmap.width,
  });
  let changed = false;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x - args.point.x, y - args.point.y);
      if (distance > args.radius) {
        continue;
      }

      const offset = (y * args.bitmap.width + x) * 4;
      if (args.mask && args.mask[offset + 3] === 0) {
        continue;
      }

      changed =
        compositeRasterBrushPixel(args.imageData.data, offset, {
          alpha: resolveBrushAlpha(args, distance),
          blue: args.color[2],
          green: args.color[1],
          red: args.color[0],
        }) || changed;
    }
  }

  return changed;
}
