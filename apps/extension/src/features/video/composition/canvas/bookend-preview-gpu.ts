import { parseColor, type RgbaColor } from '@sniptale/foundation/color';
import type { BookendMediaFraming } from '../../project/scene/bookend-media';
import { resolveMediaFitFrame } from '../../project/window-geometry';
import type { PreviewRendererStatus } from '../../preview/preferences';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewLayer,
  type GpuPreviewRenderer,
} from './gpu-preview';
import type {
  GpuPreviewOutput,
  GpuPreviewTarget,
  GpuPreviewTargetFactory,
} from './preview-presentation';

export interface BookendPreviewGpuInput {
  /** Borrowed through completion; source retirement belongs to the caller. */
  source: ImageBitmap | VideoFrame;
  sourceSize: { width: number; height: number };
  output: { width: number; height: number };
  logical: { width: number; height: number };
  framing: BookendMediaFraming;
  orientation?: GpuPreviewLayer['orientation'];
  signal: AbortSignal;
  acquire: GpuPreviewTargetFactory;
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
function validateInput(input: BookendPreviewGpuInput): void {
  const source =
    'width' in input.source
      ? { width: input.source.width, height: input.source.height }
      : { width: input.source.displayWidth, height: input.source.displayHeight };
  if (
    ![source, input.sourceSize, input.logical].every((size) =>
      [size.width, size.height].every(
        (value) => Number.isFinite(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER
      )
    ) ||
    ![input.output.width, input.output.height].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff
    )
  )
    throw new Error('Bookend preview dimensions are unavailable.');
}

function bookendLayers(
  input: BookendPreviewGpuInput,
  fill: HTMLCanvasElement,
  color: RgbaColor
): GpuPreviewLayer[] {
  const fit = resolveMediaFitFrame({
    source: input.sourceSize,
    output: input.logical,
    fit: input.framing.fit,
    crop: input.framing.crop,
  });
  return [
    {
      source: fill,
      rect: { x: 0, y: 0, ...input.logical },
      inverse: IDENTITY,
      tint: [color.red / 255, color.green / 255, color.blue / 255, color.alpha],
      cache: { key: 'bookend-preview-fill', revision: fill },
    },
    {
      source: input.source,
      rect: { x: fit.x, y: fit.y, width: fit.width, height: fit.height },
      inverse: IDENTITY,
      ...(input.orientation ? { orientation: input.orientation } : {}),
      cache: { key: 'bookend-preview-media', revision: input.source },
    },
  ];
}

/** Owns GPU composition and completed targets without acquiring or retiring media sources. */
export function createBookendPreviewGpuRenderer(
  createBackend: typeof createGpuPreviewRenderer = createGpuPreviewRenderer
) {
  let backend: GpuPreviewRenderer | null = null;
  let preparation: Promise<GpuPreviewRenderer | null> | null = null;
  let fallbackReason: PreviewRendererStatus['fallback'];
  let unavailable = false,
    disposed = false,
    active = false,
    publicationHolds = 0;
  let white: HTMLCanvasElement | null = null;
  const lifetime = new AbortController();
  const settleRetirement = () => {
    if (active || (!disposed && !unavailable)) return;
    if (white) {
      white.width = 0;
      white.height = 0;
      white = null;
    }
    if (!publicationHolds) {
      const previous = backend;
      backend = null;
      previous?.dispose();
    }
  };
  const fillSource = (document: Document) => {
    if (white) return white;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Bookend fill context is unavailable.');
      context.fillStyle = '#ffffffff';
      context.fillRect(0, 0, 1, 1);
      white = canvas;
      return canvas;
    } catch (error) {
      canvas.width = canvas.height = 0;
      throw error;
    }
  };
  const retainOutput = (target: GpuPreviewTarget): GpuPreviewOutput => {
    publicationHolds++;
    let released = false;
    return {
      canvas: target.canvas,
      release() {
        if (released) return;
        released = true;
        try {
          target.release();
        } finally {
          publicationHolds--;
          settleRetirement();
        }
      },
    };
  };
  return {
    get fallbackReason() {
      return fallbackReason;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      settleRetirement();
    },
    /** Undefined permits the caller's existing fallback; false skips canceled work. */
    async render(input: BookendPreviewGpuInput): Promise<GpuPreviewOutput | undefined | false> {
      if (disposed || input.signal.aborted) return false;
      if (active) throw new Error('Bookend preview GPU frame is already in flight.');
      validateInput(input);
      const color = parseColor(input.framing.fillColor);
      if (!color) throw new Error('Bookend fill color is unavailable.');
      if (unavailable) return undefined;
      const signal = AbortSignal.any([input.signal, lifetime.signal]);
      let target: GpuPreviewTarget | undefined;
      active = true;
      try {
        preparation ??= createBackend();
        backend = await preparation;
        if (signal.aborted) return false;
        if (!backend?.createSurface) {
          unavailable = true;
          fallbackReason = 'unavailable';
          return undefined;
        }
        target = input.acquire(input.output, backend);
        const fill = fillSource(target.canvas.ownerDocument);
        await target.surface.present({
          output: input.output,
          logical: input.logical,
          signal,
          layers: bookendLayers(input, fill, color),
        });
        if (signal.aborted) return false;
        const completed = target;
        target = undefined;
        return retainOutput(completed);
      } catch (error) {
        if (signal.aborted) return false;
        if (!(error instanceof GpuPreviewDeviceError)) throw error;
        unavailable = true;
        fallbackReason = 'device-failed';
        return undefined;
      } finally {
        try {
          target?.release();
        } finally {
          active = false;
          settleRetirement();
        }
      }
    },
  };
}
