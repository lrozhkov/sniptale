import type { PixelBounds, RasterSize, SourcePoint } from './contracts';

type RasterCropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type RasterCropAction = RasterCropHandle | 'move' | 'new';

export function rasterCropHandles(bounds: PixelBounds): [RasterCropHandle, SourcePoint][] {
  const { x, y, width, height } = bounds;
  return [
    ['nw', { x, y }],
    ['n', { x: x + width / 2, y }],
    ['ne', { x: x + width, y }],
    ['e', { x: x + width, y: y + height / 2 }],
    ['se', { x: x + width, y: y + height }],
    ['s', { x: x + width / 2, y: y + height }],
    ['sw', { x, y: y + height }],
    ['w', { x, y: y + height / 2 }],
  ];
}

export function hitRasterCrop(
  bounds: PixelBounds,
  point: SourcePoint,
  tolerance: SourcePoint
): RasterCropAction {
  const { x, y, width, height } = bounds;
  const nearX = (value: number) => Math.abs(point.x - value) <= tolerance.x;
  const nearY = (value: number) => Math.abs(point.y - value) <= tolerance.y;
  for (const [handle, corner] of rasterCropHandles(bounds).filter(
    ([handle]) => handle.length === 2
  )) {
    if (nearX(corner.x) && nearY(corner.y)) return handle;
  }
  if (point.x >= x && point.x <= x + width) {
    if (nearY(y)) return 'n';
    if (nearY(y + height)) return 's';
  }
  if (point.y >= y && point.y <= y + height) {
    if (nearX(x)) return 'w';
    if (nearX(x + width)) return 'e';
  }
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
    ? 'move'
    : 'new';
}

/** Fit within the existing frame, preserving its center and integer source-pixel bounds. */
export function fitRasterCropRatio(bounds: PixelBounds, ratio: number): PixelBounds {
  const width = Math.max(1, Math.round(Math.min(bounds.width, bounds.height * ratio)));
  const height = Math.max(1, Math.round(Math.min(bounds.height, bounds.width / ratio)));
  return {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + (bounds.height - height) / 2),
    width,
    height,
  };
}

/** Keep the opposite edge/corner fixed. Side handles preserve the perpendicular center. */
export function transformRasterCrop(
  size: RasterSize,
  bounds: PixelBounds,
  action: Exclude<RasterCropAction, 'new'>,
  delta: SourcePoint,
  ratio: number | null
): PixelBounds {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  if (action === 'move')
    return {
      ...bounds,
      x: clamp(Math.round(bounds.x + delta.x), 0, size.width - bounds.width),
      y: clamp(Math.round(bounds.y + delta.y), 0, size.height - bounds.height),
    };
  const west = action.includes('w'),
    east = action.includes('e'),
    north = action.includes('n'),
    south = action.includes('s');
  const horizontal = west || east,
    vertical = north || south;
  const anchorX = west ? bounds.x + bounds.width : east ? bounds.x : bounds.x + bounds.width / 2;
  const anchorY = north
    ? bounds.y + bounds.height
    : south
      ? bounds.y
      : bounds.y + bounds.height / 2;
  const maxWidth = horizontal
    ? west
      ? anchorX
      : size.width - anchorX
    : 2 * Math.min(anchorX, size.width - anchorX);
  const maxHeight = vertical
    ? north
      ? anchorY
      : size.height - anchorY
    : 2 * Math.min(anchorY, size.height - anchorY);
  let width = horizontal ? bounds.width + (west ? -delta.x : delta.x) : bounds.width;
  let height = vertical ? bounds.height + (north ? -delta.y : delta.y) : bounds.height;
  if (ratio) {
    const useWidth =
      horizontal &&
      (!vertical || Math.abs(width - bounds.width) >= Math.abs(height - bounds.height) * ratio);
    width = useWidth ? Math.max(1, width) : Math.max(1, height) * ratio;
    width = Math.min(maxWidth, maxHeight * ratio, width);
    height = width / ratio;
  } else {
    width = clamp(width, 1, maxWidth);
    height = clamp(height, 1, maxHeight);
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const x = west ? anchorX - width : east ? anchorX : anchorX - width / 2;
  const y = north ? anchorY - height : south ? anchorY : anchorY - height / 2;
  return {
    x: clamp(Math.round(x), 0, size.width - width),
    y: clamp(Math.round(y), 0, size.height - height),
    width,
    height,
  };
}
