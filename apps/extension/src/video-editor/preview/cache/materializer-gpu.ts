import type { VideoPreviewRenderer } from '../../../features/video/preview/preferences';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
  type GpuPreviewLayer,
} from '../../../features/video/composition/canvas/gpu-preview';
import type {
  GpuPreviewOutput,
  GpuPreviewTarget,
  GpuPreviewTargetFactory,
} from '../../../features/video/composition/canvas/preview-presentation';
import type { VideoEditorPreviewRasterSize } from '../stage/sizing/raster';
/** Owns GPU availability and completion for materialized endpoint composition. */
export function createMaterializerGpuComposer(
  rasterSize: VideoEditorPreviewRasterSize,
  isCancelled: () => boolean,
  rendererPreference: VideoPreviewRenderer = 'gpu'
) {
  let joinGpu: Promise<GpuPreviewRenderer | null> | null = null;
  let joinGpuUnavailable = false;
  let backend: GpuPreviewRenderer | null = null;
  let disposed = false;
  let active = 0;
  let publicationHolds = 0;
  let fallback: 'unavailable' | 'device-failed' = 'unavailable';
  const settleRetirement = () => {
    if (active || publicationHolds || (!disposed && !joinGpuUnavailable)) return;
    const retired = backend;
    backend = null;
    retired?.dispose();
  };
  const assertCurrent = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (disposed || isCancelled())
      throw new DOMException('Preview preparation was cancelled', 'AbortError');
  };
  const acquireBackend = async (signal: AbortSignal) => {
    joinGpu ??= createGpuPreviewRenderer();
    backend = await joinGpu;
    assertCurrent(signal);
    if (!backend) joinGpuUnavailable = true;
    return backend;
  };
  const deviceFailed = (error: unknown, signal: AbortSignal) => {
    assertCurrent(signal);
    if (!(error instanceof GpuPreviewDeviceError)) throw error;
    joinGpuUnavailable = true;
    fallback = 'device-failed';
  };
  const compose = async (
    context: CanvasRenderingContext2D,
    layers: readonly GpuPreviewLayer[],
    signal: AbortSignal
  ) => {
    assertCurrent(signal);
    if (rendererPreference === 'legacy' || joinGpuUnavailable) return false;
    active++;
    let bitmap: ImageBitmap | undefined;
    try {
      const renderer = await acquireBackend(signal);
      if (!renderer) return false;
      bitmap = await renderer.render({
        output: rasterSize,
        logical: rasterSize,
        layers,
        signal,
      });
      assertCurrent(signal);
      context.save();
      try {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'copy';
        context.filter = 'none';
        context.shadowColor = 'transparent';
        context.shadowBlur = context.shadowOffsetX = context.shadowOffsetY = 0;
        context.drawImage(bitmap, 0, 0);
      } finally {
        context.restore();
      }
      return true;
    } catch (error) {
      deviceFailed(error, signal);
      return false;
    } finally {
      try {
        bitmap?.close();
      } finally {
        active--;
        settleRetirement();
      }
    }
  };
  /** Presents into a caller-owned target; the caller retains all sources through completion. */
  const present = async (
    layers: readonly GpuPreviewLayer[],
    signal: AbortSignal,
    acquire: GpuPreviewTargetFactory
  ): Promise<GpuPreviewOutput | undefined> => {
    assertCurrent(signal);
    if (rendererPreference === 'legacy' || joinGpuUnavailable) return undefined;
    active++;
    let acquired: GpuPreviewTarget | undefined;
    try {
      const renderer = await acquireBackend(signal);
      if (!renderer) return undefined;
      const target = acquire(rasterSize, renderer);
      acquired = target;
      await target.surface.present({ output: rasterSize, logical: rasterSize, layers, signal });
      assertCurrent(signal);
      publicationHolds++;
      acquired = undefined;
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
    } catch (error) {
      deviceFailed(error, signal);
      return undefined;
    } finally {
      try {
        acquired?.release();
      } finally {
        active--;
        settleRetirement();
      }
    }
  };
  return {
    compose,
    present,
    get fallbackReason() {
      return fallback;
    },
    dispose() {
      disposed = true;
      settleRetirement();
    },
  };
}
