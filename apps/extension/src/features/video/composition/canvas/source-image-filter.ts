import { compileSourceImageFilters } from '../../../image-filters/plan';
import { applySourceImageFilters } from '../../../image-filters/reference';
import {
  SourceImageFilterError,
  parseSourceImageFilterStack,
  type SourceImageFilterSize,
} from '../../../image-filters/contract';
import type { RenderCanvasLease, RenderResources } from './render-resources';

/** Synchronous Canvas fallback only. GPU callers use the compositor's source-plane passes. */
export function withSourceImageFilterCanvas(
  args: {
    stack: unknown;
    logical: SourceImageFilterSize;
    projectTime?: number | undefined;
    raster: SourceImageFilterSize;
    paint(context: CanvasRenderingContext2D, size: SourceImageFilterSize): void;
    resources?: RenderResources | undefined;
    ownerDocument?: Document | null | undefined;
  },
  consume: (canvas: HTMLCanvasElement) => void
): void {
  const stack = parseSourceImageFilterStack(args.stack);
  if (!stack) throw new SourceImageFilterError();
  const projectTime = args.projectTime ?? 0;
  const program = compileSourceImageFilters(stack, args.logical, projectTime);
  const { width, height } = args.raster;
  const pixels = width * height * 4;
  // Source and scratch Float32 RGBA plus input and output Uint8Clamped RGBA.
  const bytes = pixels * (4 * (program.scratchCount + 1) + 2);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(bytes) ||
    bytes > 640 * 1024 * 1024
  )
    throw new SourceImageFilterError();
  const reservation = args.resources?.bytes('source-image-filter-working', bytes);
  let lease: RenderCanvasLease | undefined;
  try {
    if (args.resources)
      lease = args.resources.canvas(
        'source-image-filter',
        { width, height },
        { alpha: true, colorSpace: 'srgb', willReadFrequently: true }
      );
    else {
      const owner = args.ownerDocument ?? (typeof document === 'undefined' ? null : document);
      if (!owner) throw new SourceImageFilterError();
      const canvas = owner.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', {
        alpha: true,
        colorSpace: 'srgb',
        willReadFrequently: true,
      });
      if (!context) {
        canvas.width = canvas.height = 0;
        throw new SourceImageFilterError();
      }
      lease = {
        canvas,
        context,
        release() {
          canvas.width = canvas.height = 0;
        },
      };
    }
    const { canvas, context } = lease;
    context.reset?.();
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.filter = 'none';
      context.clearRect(0, 0, width, height);
      args.paint(context, { width, height });
    } finally {
      context.restore();
    }
    const input = context.getImageData(0, 0, width, height);
    const filtered = applySourceImageFilters(
      input.data,
      width,
      height,
      stack,
      program.logical,
      projectTime
    );
    input.data.set(filtered);
    context.putImageData(input, 0, 0);
    consume(canvas);
  } finally {
    lease?.release();
    reservation?.release();
  }
}
