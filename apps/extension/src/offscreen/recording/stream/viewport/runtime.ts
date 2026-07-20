import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createViewportPresetRuntimeState,
  drawViewportPresetFrame,
  updateViewportPresetDrawState,
  updateViewportPresetRuntimeCrop,
  type ViewportPresetRuntimeState,
} from './helpers';

const logger = createLogger({ namespace: 'OffscreenViewportRuntime' });

type ViewportPresetTargetResolution = { width: number; height: number };
type ViewportSizeInPixels = { width: number; height: number };

export function createViewportPresetCanvas(
  video: HTMLVideoElement,
  targetResolution: ViewportPresetTargetResolution,
  viewportSizeInPixels?: ViewportSizeInPixels
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: ViewportPresetRuntimeState;
} {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const state = createViewportPresetRuntimeState({
    targetResolution,
    sourceSize: {
      width: video.videoWidth,
      height: video.videoHeight,
    },
    ...(viewportSizeInPixels === undefined ? {} : { viewportSizeInPixels }),
  });

  canvas.width = state.targetWidth;
  canvas.height = state.targetHeight;
  return { canvas, ctx, state };
}

export function createViewportPresetFrameDrawer(args: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: ViewportPresetRuntimeState;
  video: HTMLVideoElement;
  isRunning: () => boolean;
}): () => void {
  return () => {
    if (!args.isRunning()) {
      return;
    }
    drawViewportPresetFrame({
      canvas: args.canvas,
      ctx: args.ctx,
      state: args.state,
      video: args.video,
    });
  };
}

export function createViewportPresetCropUpdater(
  canvas: Pick<HTMLCanvasElement, 'height' | 'width'>,
  state: ViewportPresetRuntimeState,
  video: Pick<HTMLVideoElement, 'videoHeight' | 'videoWidth'>
): (params: {
  targetResolution?: ViewportPresetTargetResolution;
  viewportSizeInPixels?: ViewportSizeInPixels;
}) => void {
  return ({ targetResolution: nextTarget, viewportSizeInPixels: nextViewport }) => {
    updateViewportPresetRuntimeCrop(state, {
      ...(nextTarget === undefined ? {} : { targetResolution: nextTarget }),
      ...(nextViewport === undefined ? {} : { viewportSizeInPixels: nextViewport }),
    });
    canvas.width = state.targetWidth;
    canvas.height = state.targetHeight;

    logger.log('Viewport preset crop updated', {
      targetWidth: state.targetWidth,
      targetHeight: state.targetHeight,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight,
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
    });
  };
}

export function createViewportPresetDrawStateUpdater(
  state: ViewportPresetRuntimeState,
  video: Pick<HTMLVideoElement, 'videoHeight' | 'videoWidth'>
): (params: { frozen: boolean; navigationEpoch: number }) => void {
  return ({ frozen, navigationEpoch }) => {
    const applied = updateViewportPresetDrawState(state, { frozen, navigationEpoch });
    if (!applied) {
      return;
    }

    logger.log('Viewport preset draw state updated', {
      frozen: state.drawFrozen,
      navigationEpoch: state.navigationEpoch,
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
    });
  };
}
