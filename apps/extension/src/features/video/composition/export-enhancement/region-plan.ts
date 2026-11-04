import { parseEnhancementMode } from './mode';
import type { VideoExportDetailMode } from '../../project/types/export';

interface RasterSize {
  width: number;
  height: number;
}
export interface EnhancementRect extends RasterSize {
  x: number;
  y: number;
}
export interface EnhancementRegionRequest {
  mode?: VideoExportDetailMode | undefined;
  sourceSize: RasterSize;
  roi: EnhancementRect;
  targetSize: RasterSize;
  zoomActive: boolean;
  context?: number;
  coreLimit?: RasterSize;
}

function positive(value: number, name: string, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new TypeError(`Invalid ${name}`);
}

/** Координаты ROI относятся к исходным RGB-пикселям. Destination — пиксели вывода. */
export function planEnhancedRegion({
  mode,
  sourceSize,
  roi,
  targetSize,
  zoomActive,
  context = 32,
  coreLimit = { width: 960, height: 540 },
}: EnhancementRegionRequest) {
  mode = parseEnhancementMode(mode);
  positive(sourceSize.width, 'source width', true);
  positive(sourceSize.height, 'source height', true);
  positive(targetSize.width, 'target width', true);
  positive(targetSize.height, 'target height', true);
  positive(roi.width, 'roi width');
  positive(roi.height, 'roi height');
  if (
    ![roi.x, roi.y].every(Number.isFinite) ||
    roi.x < 0 ||
    roi.y < 0 ||
    roi.x + roi.width > sourceSize.width ||
    roi.y + roi.height > sourceSize.height
  )
    throw new RangeError('ROI outside source');
  if (typeof zoomActive !== 'boolean') throw new TypeError('Invalid zoom activity');
  if (!Number.isSafeInteger(context) || context < 32)
    throw new RangeError('Context must be at least 32');
  positive(coreLimit.width, 'core width', true);
  positive(coreLimit.height, 'core height', true);
  if (coreLimit.width > 960 || coreLimit.height > 540)
    throw new RangeError('Core exceeds prepared budget');
  const sx = targetSize.width / roi.width,
    sy = targetSize.height / roi.height;
  if (mode === 'off' || !zoomActive || Math.max(sx, sy) <= 1)
    return { mode, applied: false, tiles: [] };
  const stepX = Math.max(1, Math.floor(coreLimit.width * sx));
  const stepY = Math.max(1, Math.floor(coreLimit.height * sy));
  const tiles = [];
  for (let dy = 0; dy < targetSize.height; dy += stepY) {
    for (let dx = 0; dx < targetSize.width; dx += stepX) {
      const dw = Math.min(stepX, targetSize.width - dx),
        dh = Math.min(stepY, targetSize.height - dy);
      const core = { x: roi.x + dx / sx, y: roi.y + dy / sy, width: dw / sx, height: dh / sy };
      // Единая чётная сетка исходника сохраняет фазу PixelUnshuffle между тайлами.
      const left = Math.floor((core.x - context) / 2) * 2;
      const top = Math.floor((core.y - context) / 2) * 2;
      const right = Math.ceil((core.x + core.width + context) / 2) * 2;
      const bottom = Math.ceil((core.y + core.height + context) / 2) * 2;
      const input = { x: left, y: top, width: right - left, height: bottom - top };
      if (input.width > 1920 || input.height > 1080)
        throw new RangeError('Clark input exceeds supported size');
      tiles.push({
        input,
        core,
        destination: { x: dx, y: dy, width: dw, height: dh },
        coreInInput: { x: core.x - left, y: core.y - top, width: core.width, height: core.height },
      });
    }
  }
  return { mode, applied: true, sourceSize: { ...sourceSize }, tiles };
}

/** Заполняет контекст крайними пикселями. Исходник копируется строго 1:1. */
export function paintPaddedInput(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceSize: RasterSize,
  input: EnhancementRect
) {
  const x = Math.max(0, input.x),
    y = Math.max(0, input.y);
  const right = Math.min(sourceSize.width, input.x + input.width);
  const bottom = Math.min(sourceSize.height, input.y + input.height);
  const xParts: [number, number, number, number][] = [[x, right - x, x - input.x, right - x]];
  const yParts: [number, number, number, number][] = [[y, bottom - y, y - input.y, bottom - y]];
  if (input.x < 0) xParts.push([0, 1, 0, -input.x]);
  if (input.x + input.width > sourceSize.width)
    xParts.push([
      sourceSize.width - 1,
      1,
      sourceSize.width - input.x,
      input.x + input.width - sourceSize.width,
    ]);
  if (input.y < 0) yParts.push([0, 1, 0, -input.y]);
  if (input.y + input.height > sourceSize.height)
    yParts.push([
      sourceSize.height - 1,
      1,
      sourceSize.height - input.y,
      input.y + input.height - sourceSize.height,
    ]);
  context.save();
  try {
    context.imageSmoothingEnabled = false;
    for (const [sx, sw, dx, dw] of xParts)
      for (const [sy, sh, dy, dh] of yParts)
        context.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
  } finally {
    context.restore();
  }
}
