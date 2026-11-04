import type { VideoPreviewRenderer } from '../../../features/video/preview/preferences';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
  type GpuPreviewLayer,
} from '../../../features/video/composition/canvas/gpu-preview';
import type { VideoEditorPreviewRasterSize } from '../stage/sizing/raster';
/** Owns GPU availability and completion for materialized endpoint composition. */
export function createMaterializerGpuComposer(
  rasterSize: VideoEditorPreviewRasterSize,
  isCancelled: () => boolean,
  rendererPreference: VideoPreviewRenderer = 'gpu'
) {
  let joinGpu: Promise<GpuPreviewRenderer | null> | null = null;
  let joinGpuUnavailable = false;
  let fallback: 'unavailable' | 'device-failed' = 'unavailable';
  const compose = async (
    context: CanvasRenderingContext2D,
    layers: readonly GpuPreviewLayer[],
    signal: AbortSignal
  ) => {
    if (rendererPreference === 'legacy' || joinGpuUnavailable) return false;
    let bitmap: ImageBitmap | undefined;
    try {
      joinGpu ??= createGpuPreviewRenderer();
      const renderer = await joinGpu;
      if (!renderer) {
        joinGpuUnavailable = true;
        return false;
      }
      if (isCancelled()) throw new DOMException('Preview preparation was cancelled', 'AbortError');
      bitmap = await renderer.render({
        output: rasterSize,
        logical: rasterSize,
        layers,
        signal,
      });
      signal.throwIfAborted();
      if (isCancelled()) throw new DOMException('Preview preparation was cancelled', 'AbortError');
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
      if (signal.aborted || isCancelled()) throw error;
      if (!(error instanceof GpuPreviewDeviceError)) throw error;
      joinGpuUnavailable = true;
      fallback = 'device-failed';
      void joinGpu?.then(
        (renderer) => renderer?.dispose(),
        () => {}
      );
      return false;
    } finally {
      bitmap?.close();
    }
  };
  return {
    compose,
    get fallbackReason() {
      return fallback;
    },
    dispose() {
      void joinGpu?.then(
        (renderer) => renderer?.dispose(),
        () => {}
      );
    },
  };
}
