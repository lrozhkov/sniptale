import type { RasterBrushPointPaintArgs } from './types';

export function resolveBrushAlpha(
  args: Pick<RasterBrushPointPaintArgs, 'color' | 'hardness' | 'opacity' | 'radius'>,
  distance: number
): number {
  const colorAlpha = args.color[3] / 255;
  const innerRadius = args.radius * args.hardness;
  const falloff =
    args.hardness >= 1 || distance <= innerRadius
      ? 1
      : (args.radius - distance) / Math.max(args.radius - innerRadius, 0.001);

  return Math.max(0, Math.min(1, colorAlpha * args.opacity * falloff));
}
