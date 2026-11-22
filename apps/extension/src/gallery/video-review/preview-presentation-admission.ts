import { reviewGpuPreviewConcurrency } from '../../workflows/video-review/gpu-preview';
import { reviewGpuPreviewAllocation } from '../../workflows/video-review/gpu-preview-geometry';
import { createPreviewRenderResources } from '../../workflows/video-review/preview-render-resources';
import {
  calculatePreviewRenderAllocation,
  resolvePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from '../../workflows/video-review/preview-render-allocation';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import type { ReviewGpuPresentedFrame } from '../../workflows/video-review/gpu-preview';
import { previewTransitionBacking } from './preview-presentation-frame';
import type { Description } from './preview-presentation-state';

type Front = { canvas: HTMLCanvasElement } & (
  | { outputKind: 'canvas2d' }
  | Pick<ReviewGpuPresentedFrame, 'outputKind' | 'retainedProviderBytes' | 'isRetiredProvider'>
);

const emptyAssets = (): PreviewRenderAllocationInput['assets'] => ({
  headerBitmap: null,
  backgroundBitmap: null,
  watermark: null,
  previousWatermarkCache: null,
});

/** The ledger owns all overlapping source, camera, transition and front-buffer reservations. */
export function createPresentationAdmission(
  transport: () => { playing: boolean; video: HTMLVideoElement | null },
  description: () => Description | null,
  time: () => number,
  front: () => Front | null,
  maximumInFlight: (scene: Description['scene']) => 1 | 2 | 3 | 4 = reviewGpuPreviewConcurrency
) {
  const resources = createPreviewRenderResources({
    maximumManagedBytes: 1,
    maximumCanvases: 1,
    maximumPresentationSurfaces: 5,
  });
  const sourceFrames = new Map<symbol, number>();
  let retainedCameraBytes: number | null = null;
  const activeCameraFrames = new Map<symbol, number>();
  const transitionPairs = new Map<symbol, readonly [number, number]>();
  let assets = emptyAssets();
  const graph = () => {
    const current = description();
    const resultTime = time();
    const previousFront = front();
    const { playing, video } = transport();
    if (!current) throw new Error('Preview description unavailable');
    const transitionBytes = transitionPairs.size
      ? [...transitionPairs.values()].reduce(
          ([left, right], [nextLeft, nextRight]) => [left + nextLeft, right + nextRight] as const,
          [0, 0] as readonly [number, number]
        )
      : null;
    return resolvePreviewRenderAllocation({
      scene: current.scene,
      dimensions: current.dimensions,
      resultTime,
      ...(current.cameraTransform ? { cameraTransform: current.cameraTransform } : {}),
      maximumInFlight: current.renderer === 'legacy' ? 1 : maximumInFlight(current.scene),
      sourceAllocationBytes: sourceFrames.size
        ? [...sourceFrames.values()].reduce((sum, bytes) => sum + bytes, 0)
        : null,
      sourceTime: playing && video ? video.currentTime : current.sourceTime,
      sourceBacking: previewTransitionBacking(current, resultTime),
      camera: {
        retainedBytes: retainedCameraBytes,
        activeBytes: activeCameraFrames.size
          ? [...activeCameraFrames.values()].reduce((sum, bytes) => sum + bytes, 0)
          : null,
      },
      transitionBytes,
      previousFront: previousFront
        ? { width: previousFront.canvas.width, height: previousFront.canvas.height }
        : null,
      outputKind:
        current.renderer !== 'legacy' && typeof navigator !== 'undefined' && navigator.gpu
          ? 'gpu-surface'
          : 'canvas2d',
      ...(previousFront ? { previousFrontKind: previousFront.outputKind } : {}),
      previousProviderBytes:
        previousFront?.outputKind === 'gpu-surface' && previousFront.isRetiredProvider()
          ? previousFront.retainedProviderBytes()
          : 0,
      assets,
    });
  };
  const admit = () => {
    const limits = calculatePreviewRenderAllocation(graph());
    const current = description();
    const gpu =
      current && typeof navigator !== 'undefined' && navigator.gpu
        ? reviewGpuPreviewAllocation(
            current.scene,
            current.dimensions,
            current.renderer === 'legacy' ? 1 : 2
          )
        : { maximumManagedBytes: 0, maximumCanvases: 0 };
    resources.replaceLimits({
      maximumManagedBytes: limits.maximumManagedBytes + gpu.maximumManagedBytes,
      maximumCanvases: limits.maximumCanvases + gpu.maximumCanvases,
    });
  };
  const cameraResources: RenderResources = {
    canvas: (role, size, options) => resources.canvas(role, size, options),
    bytes(role, count) {
      const previousRetained = retainedCameraBytes;
      const identity = Symbol();
      if (role === 'webcam.retained') retainedCameraBytes = count;
      if (role === 'webcam.active') activeCameraFrames.set(identity, count);
      try {
        admit();
        const lease = resources.bytes(role, count);
        return {
          release() {
            lease.release();
            if (role === 'webcam.retained') retainedCameraBytes = null;
            activeCameraFrames.delete(identity);
          },
        };
      } catch (error) {
        retainedCameraBytes = previousRetained;
        activeCameraFrames.delete(identity);
        throw error;
      }
    },
  };
  return {
    resources,
    graph,
    cameraResources,
    resetAssets() {
      assets = emptyAssets();
    },
    replaceAssets(next: PreviewRenderAllocationInput['assets']) {
      assets = next;
    },
    reserveSource(bytes: number, next: PreviewRenderAllocationInput['assets']) {
      const identity = Symbol();
      sourceFrames.set(identity, bytes);
      assets = next;
      try {
        admit();
        const reservation = resources.bytes('preview-source-frame', bytes);
        return {
          release() {
            reservation.release();
            sourceFrames.delete(identity);
          },
        };
      } catch (error) {
        sourceFrames.delete(identity);
        throw error;
      }
    },
    retainEndpoints(bytes: readonly [number, number]) {
      if (!description()) throw new Error('Preview endpoint admission unavailable');
      const identity = Symbol();
      transitionPairs.set(identity, bytes);
      let reservation: { release(): void };
      try {
        admit();
        reservation = resources.bytes('preview-transition-endpoints', bytes[0] + bytes[1]);
      } catch (error) {
        transitionPairs.delete(identity);
        throw error;
      }
      return {
        release() {
          reservation.release();
          transitionPairs.delete(identity);
        },
      };
    },
  };
}
