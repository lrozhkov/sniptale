import type {
  GpuPreviewOutput,
  GpuPreviewTarget,
  GpuPreviewTargetFactory,
} from './preview-presentation';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
} from './gpu-preview';
import { getFittedMediaContentFrame } from '../draw/fitted-media';
import { traceCameraShape } from '../draw/media-shadow';
import { cameraWindowFrame, type CameraAppearance } from '../../project/camera/appearance';
import type { VideoMediaFitMode } from '../../project/types';
import type { PreviewRendererStatus } from '../../preview/preferences';

interface CameraCropGpuInput {
  media: HTMLVideoElement;
  size: { width: number; height: number };
  appearance: CameraAppearance;
  mirrored: boolean;
  fitMode: VideoMediaFitMode;
  signal: AbortSignal;
  acquire: GpuPreviewTargetFactory;
}

/** Owns source capture, retained silhouette and GPU completion without choosing visible pixels. */
export function createCameraCropGpuRenderer(
  createBackend: typeof createGpuPreviewRenderer = createGpuPreviewRenderer
) {
  let backend: GpuPreviewRenderer | null = null;
  let preparation: Promise<GpuPreviewRenderer | null> | null = null;
  let fallbackReason: PreviewRendererStatus['fallback'];
  let unavailable = false;
  let disposed = false;
  let active = false;
  let publicationHolds = 0;
  let mask: { canvas: HTMLCanvasElement; key: string } | null = null;
  const lifetime = new AbortController();
  const clearMask = () => {
    const previous = mask;
    mask = null;
    if (previous) {
      previous.canvas.width = 0;
      previous.canvas.height = 0;
    }
  };
  const settleRetirement = () => {
    if (active || (!disposed && !unavailable)) return;
    clearMask();
    if (!publicationHolds) {
      const previous = backend;
      backend = null;
      previous?.dispose();
    }
  };
  const silhouette = (input: CameraCropGpuInput) => {
    const key = JSON.stringify([
      input.size.width,
      input.size.height,
      input.appearance.shape,
      input.appearance.roundness,
    ]);
    if (mask?.key === key) return mask;
    const canvas = input.media.ownerDocument.createElement('canvas');
    canvas.width = input.size.width;
    canvas.height = input.size.height;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Camera crop silhouette is unavailable.');
      context.fillStyle = '#fff';
      traceCameraShape(
        context,
        cameraWindowFrame({ x: 0, y: 0, ...input.size }, input.appearance.shape),
        input.appearance
      );
      context.fill();
      clearMask();
      mask = { canvas, key };
      return mask;
    } catch (error) {
      canvas.width = 0;
      canvas.height = 0;
      throw error;
    }
  };
  const ready = (media: HTMLVideoElement) =>
    !media.seeking &&
    media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    media.videoWidth > 0 &&
    media.videoHeight > 0;
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
    /** Undefined permits Canvas fallback; false skips stale work without replacing the front. */
    async render(input: CameraCropGpuInput): Promise<GpuPreviewOutput | undefined | false> {
      if (disposed || input.signal.aborted || !ready(input.media)) return false;
      if (unavailable || typeof VideoFrame === 'undefined') {
        unavailable = true;
        fallbackReason ??= 'unavailable';
        return undefined;
      }
      if (active) throw new Error('Camera crop GPU frame is already in flight.');
      const { width, height } = input.size;
      if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > 0xffffffff ||
        height > 0xffffffff
      )
        throw new Error('Camera crop dimensions are invalid.');
      const signal = AbortSignal.any([input.signal, lifetime.signal]);
      let source: VideoFrame | undefined;
      let target: GpuPreviewTarget | undefined;
      active = true;
      try {
        preparation ??= createBackend();
        backend = await preparation;
        if (signal.aborted || !ready(input.media)) return false;
        if (!backend?.createSurface) {
          unavailable = true;
          fallbackReason = 'unavailable';
          return undefined;
        }
        const time = input.media.currentTime;
        const url = input.media.currentSrc || input.media.src;
        source = new VideoFrame(input.media);
        const coverage = silhouette(input);
        const frame = { x: 0, y: 0, width, height };
        const rect = getFittedMediaContentFrame({
          cameraAppearance: input.appearance,
          fitMode: input.fitMode,
          frame,
          sourceWidth: input.media.videoWidth,
          sourceHeight: input.media.videoHeight,
        });
        target = input.acquire({ width, height }, backend);
        await target.surface.present({
          output: { width, height },
          logical: { width, height },
          layers: [
            {
              source,
              rect,
              inverse: input.mirrored
                ? [-1, 0, width, 0, 1, 0, 0, 0, 1]
                : [1, 0, 0, 0, 1, 0, 0, 0, 1],
              alphaMask: {
                source: coverage.canvas,
                rect: frame,
                cache: { key: 'camera-crop-mask', revision: coverage.key },
              },
            },
          ],
          signal,
        });
        if (
          signal.aborted ||
          !ready(input.media) ||
          input.media.currentTime !== time ||
          (input.media.currentSrc || input.media.src) !== url
        )
          return false;
        const completed = target;
        target = undefined;
        publicationHolds++;
        let released = false;
        return {
          canvas: completed.canvas,
          release() {
            if (released) return;
            released = true;
            try {
              completed.release();
            } finally {
              publicationHolds--;
              settleRetirement();
            }
          },
        };
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
          try {
            source?.close();
          } finally {
            active = false;
            settleRetirement();
          }
        }
      }
    },
  };
}
