import { prepare, render, paint, drawReplacement, ENGINE_VERSION } from './engine/render.mjs';
import { sampleBackground } from './engine/detector.mjs';
import { attachEraseSupport } from './engine/erasures.mjs';
import type { SimplifySettings } from './settings';

export type SimplifyPaintContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type SimplifyCanvasSource = HTMLCanvasElement | OffscreenCanvas;

export interface SimplifyPixelSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface SimplifyRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SimplifyRaster {
  readonly version: string;
  readonly width: number;
  readonly height: number;
  prepare(): void;
  render(
    context: SimplifyPaintContext,
    source: SimplifyCanvasSource,
    region: SimplifyRegion,
    settings: SimplifySettings
  ): void;
}

const SIMPLIFY_MAX_SOURCE_PIXELS = 16_777_216;

function validatePixels(image: SimplifyPixelSource): void {
  const count = image.width * image.height;
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    count > SIMPLIFY_MAX_SOURCE_PIXELS ||
    !ArrayBuffer.isView(image.data) ||
    Object.prototype.toString.call(image.data) !== '[object Uint8ClampedArray]' ||
    image.data.length !== count * 4
  )
    throw new Error('Invalid simplify source raster.');
}

function validateRegion(image: SimplifyPixelSource, region: SimplifyRegion): void {
  if (
    ![region.x, region.y, region.width, region.height].every(Number.isSafeInteger) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width < 1 ||
    region.height < 1 ||
    region.x + region.width > image.width ||
    region.y + region.height > image.height
  )
    throw new Error('Simplify region is outside the source raster.');
}

/** Owns immutable numerical evidence; callers own canvas, worker and cancellation lifetimes. */
export function createSimplifyRaster(input: SimplifyPixelSource): SimplifyRaster {
  validatePixels(input);
  const image = {
    width: input.width,
    height: input.height,
    data: new Uint8ClampedArray(input.data),
  };
  let catalog: object | null = null;
  const prepareCatalog = () => {
    catalog ??= prepare(image);
  };
  return {
    version: ENGINE_VERSION,
    width: image.width,
    height: image.height,
    prepare: prepareCatalog,
    render(context, source, region, settings) {
      validateRegion(image, region);
      if (source.width !== image.width || source.height !== image.height) {
        throw new Error('Simplify canvas dimensions do not match its source raster.');
      }
      const bounds = { x: region.x, y: region.y, w: region.width, h: region.height };
      const style = {
        content: settings.content,
        sensitivity: settings.sensitivity,
        thickness: settings.thickness,
        color: settings.color === null ? ('auto' as const) : ('custom' as const),
        customColor: settings.color ?? '#8da8c7',
      };
      if (settings.automatic) {
        prepareCatalog();
        if (!catalog) throw new Error('Simplify analysis is unavailable.');
        render(context, source, catalog, style, bounds);
        return;
      }
      context.clearRect(0, 0, image.width, image.height);
      context.drawImage(source, 0, 0);
      context.save();
      try {
        context.beginPath();
        context.rect(bounds.x, bounds.y, bounds.w, bounds.h);
        context.clip();
        const bg = sampleBackground(image, bounds);
        const proposal = { ...bounds, bg, shape: settings.manualKind };
        if (settings.manualKind === 'image') {
          paint(context, proposal, style);
          return;
        }
        const lineHeight = Math.min(16, bounds.h);
        const pitch = lineHeight * settings.lineSpacing;
        const count = 1 + Math.floor((bounds.h - lineHeight) / pitch);
        const top = bounds.y + (bounds.h - lineHeight - (count - 1) * pitch) / 2;
        // Restore the complete source area once. Additional rows only paint replacements.
        const box = attachEraseSupport(image, proposal);
        paint(
          context,
          {
            ...box,
            textSize: Math.max(2, lineHeight - 4),
            textHeightLimit: lineHeight,
            textCenterY: top + lineHeight / 2,
          },
          style
        );
        for (let row = 1; row < count; row++)
          drawReplacement(context, { ...proposal, y: top + row * pitch, h: lineHeight }, style);
      } finally {
        context.restore();
      }
    },
  };
}
