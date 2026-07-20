import { createLogger } from '@sniptale/platform/observability/logger';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { recordingContext } from '../context';
import { applyCanvasCrop, createViewportPresetStream } from '../stream';
import type { RecordingViewport } from './video.types';

type DerivedRecordingStreamParams = {
  captureMode?: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number };
  emulatedViewportCssSize?: { width: number; height: number };
  fullStream: MediaStream;
  quality: VideoRecordingSettings['quality'];
  targetResolution?: { width: number; height: number };
  viewportSizeInPixels?: { width: number; height: number };
};

const logger = createLogger({ namespace: 'OffscreenRecordingSetup' });

export function resolveViewportSizeInPixels(viewport?: RecordingViewport) {
  if (!viewport) {
    return undefined;
  }

  return {
    width: Math.max(1, Math.round(viewport.width * (viewport.devicePixelRatio || 1))),
    height: Math.max(1, Math.round(viewport.height * (viewport.devicePixelRatio || 1))),
  };
}

export function createDerivedRecordingStream(params: DerivedRecordingStreamParams) {
  const { captureMode, cropRegion, fullStream, quality } = params;
  if (captureMode === CaptureMode.TAB_CROP && cropRegion) {
    return createCropFallbackStream({ ...params, captureMode, cropRegion });
  }

  if (captureMode === CaptureMode.VIEWPORT_EMULATION && params.targetResolution) {
    return createViewportPresetVideoStream({
      fullStream,
      quality,
      targetResolution: params.targetResolution,
      ...(params.emulatedViewportCssSize === undefined
        ? {}
        : { emulatedViewportCssSize: params.emulatedViewportCssSize }),
    });
  }

  if (captureMode === CaptureMode.VIEWPORT_EMULATION && cropRegion) {
    return createCropFallbackStream({ ...params, captureMode, cropRegion });
  }
  return null;
}

async function createCropFallbackStream(params: {
  captureMode: CaptureMode.TAB_CROP | CaptureMode.VIEWPORT_EMULATION;
  cropRegion: { x: number; y: number; width: number; height: number };
  fullStream: MediaStream;
  quality: VideoRecordingSettings['quality'];
  viewportSizeInPixels?: { width: number; height: number };
}) {
  logger.debug(getCropStartLabel(params.captureMode), params.cropRegion);
  const stream = await applyCanvasCrop(
    params.fullStream,
    params.cropRegion,
    params.quality,
    params.viewportSizeInPixels
  );
  logger.debug(getCropCompleteLabel(params.captureMode));
  return stream;
}

function getCropStartLabel(captureMode: CaptureMode): string {
  return captureMode === CaptureMode.TAB_CROP
    ? 'Applying tab crop stream'
    : 'Using viewport-emulation crop fallback';
}

function getCropCompleteLabel(captureMode: CaptureMode): string {
  return captureMode === CaptureMode.TAB_CROP
    ? 'Applied tab crop stream'
    : 'Applied viewport-emulation crop fallback';
}

async function createViewportPresetVideoStream(params: {
  emulatedViewportCssSize?: { width: number; height: number };
  fullStream: MediaStream;
  quality: VideoRecordingSettings['quality'];
  targetResolution: { width: number; height: number };
}) {
  logger.debug('Creating viewport preset stream', {
    targetResolution: params.targetResolution,
    viewportSizeInPixels: params.emulatedViewportCssSize,
  });
  const viewportPreset = await createViewportPresetStream(
    params.fullStream,
    params.targetResolution,
    params.quality,
    params.emulatedViewportCssSize
  );
  recordingContext.updateViewportPresetCrop = viewportPreset.updateCrop;
  recordingContext.updateViewportPresetDrawState = viewportPreset.updateDrawState;
  logger.debug('Viewport preset stream created');
  return viewportPreset.stream;
}
