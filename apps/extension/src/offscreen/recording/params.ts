import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

type RecordingViewportParams = {
  captureMode?: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number };
  emulatedViewportCssSize?: { width: number; height: number };
  targetResolution?: { width: number; height: number };
  viewport?: { width: number; height: number; devicePixelRatio?: number };
};

export function appendRecordingViewportParams<T extends object>(
  target: T,
  params: RecordingViewportParams
) {
  return {
    ...target,
    ...(params.viewport === undefined ? {} : { viewport: params.viewport }),
    ...(params.captureMode === undefined ? {} : { captureMode: params.captureMode }),
    ...(params.cropRegion === undefined ? {} : { cropRegion: params.cropRegion }),
    ...(params.targetResolution === undefined ? {} : { targetResolution: params.targetResolution }),
    ...(params.emulatedViewportCssSize === undefined
      ? {}
      : { emulatedViewportCssSize: params.emulatedViewportCssSize }),
  };
}
