import { createPreviewRenderResources } from '../../workflows/video-review/preview-render-resources';
import {
  calculatePreviewRenderAllocation,
  resolvePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from '../../workflows/video-review/preview-render-allocation';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { previewTransitionBacking } from './preview-presentation-frame';
import type { Description, Renderer } from './preview-presentation-state';

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
  front: () => ReturnType<Renderer['render']> | null
) {
  const resources = createPreviewRenderResources({ maximumManagedBytes: 1, maximumCanvases: 1 });
  let sourceBytes: number | null = null;
  let retainedCameraBytes: number | null = null;
  let activeCameraBytes: number | null = null;
  let transitionBytes: readonly [number, number] | null = null;
  let assets = emptyAssets();
  const graph = () => {
    const current = description();
    const resultTime = time();
    const previousFront = front();
    const { playing, video } = transport();
    if (!current) throw new Error('Preview description unavailable');
    return resolvePreviewRenderAllocation({
      scene: current.scene,
      dimensions: current.dimensions,
      resultTime,
      ...(current.cameraTransform ? { cameraTransform: current.cameraTransform } : {}),
      sourceAllocationBytes: sourceBytes,
      sourceTime: playing && video ? video.currentTime : current.sourceTime,
      sourceBacking: previewTransitionBacking(current, resultTime),
      camera: { retainedBytes: retainedCameraBytes, activeBytes: activeCameraBytes },
      transitionBytes,
      previousFront: previousFront
        ? { width: previousFront.canvas.width, height: previousFront.canvas.height }
        : null,
      assets,
    });
  };
  const admit = () => resources.replaceLimits(calculatePreviewRenderAllocation(graph()));
  const cameraResources: RenderResources = {
    canvas: (role, size, options) => resources.canvas(role, size, options),
    bytes(role, count) {
      const previousRetained = retainedCameraBytes;
      const previousActive = activeCameraBytes;
      if (role === 'webcam.retained') retainedCameraBytes = count;
      if (role === 'webcam.active') activeCameraBytes = count;
      try {
        admit();
        const lease = resources.bytes(role, count);
        return {
          release() {
            lease.release();
            if (role === 'webcam.retained') retainedCameraBytes = null;
            if (role === 'webcam.active') activeCameraBytes = null;
          },
        };
      } catch (error) {
        retainedCameraBytes = previousRetained;
        activeCameraBytes = previousActive;
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
      sourceBytes = bytes;
      assets = next;
      try {
        admit();
        const reservation = resources.bytes('preview-source-frame', bytes);
        return {
          release() {
            reservation.release();
            sourceBytes = null;
          },
        };
      } catch (error) {
        sourceBytes = null;
        throw error;
      }
    },
    retainEndpoints(bytes: readonly [number, number]) {
      if (!description() || transitionBytes)
        throw new Error('Preview endpoint admission unavailable');
      transitionBytes = bytes;
      let reservation: { release(): void };
      try {
        admit();
        reservation = resources.bytes('preview-transition-endpoints', bytes[0] + bytes[1]);
      } catch (error) {
        transitionBytes = null;
        throw error;
      }
      return {
        release() {
          reservation.release();
          if (transitionBytes === bytes) transitionBytes = null;
        },
      };
    },
  };
}
