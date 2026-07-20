import { prepareRecordingStream } from '../setup';
import { recordingContext } from '../context';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { OFFSCREEN_RECORDING_START_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { appendRecordingViewportParams } from '../params';
import { initializeSidecarRecorders } from '../sidecar';
import {
  cleanupResources,
  finalizeRecordingBootstrap,
  handleRecordingStartError,
  initializeRecordingSession,
} from './helpers';

type StartRecordingParams = {
  streamId: string;
  settings: VideoRecordingSettings;
  tabId?: number;
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  recordingId?: string;
  captureMode?: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number };
  targetResolution?: { width: number; height: number };
  emulatedViewportCssSize?: { width: number; height: number };
};

export async function startRecording(params: StartRecordingParams): Promise<void> {
  try {
    await withRecordingStartTimeout(
      startRecordingInternal(params, recordingContext.durationTracker)
    );
  } catch (error) {
    throw handleRecordingStartError(error, params.recordingId);
  }
}

function withRecordingStartTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Timed out while starting offscreen recording'));
      }, OFFSCREEN_RECORDING_START_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

function isRecordingSessionStillStarting(resolvedRecordingId: string): boolean {
  return (
    recordingContext.currentRecordingId === resolvedRecordingId &&
    recordingContext.lifecycleState === 'starting'
  );
}

async function startRecordingInternal(
  params: StartRecordingParams,
  durationTracker: typeof recordingContext.durationTracker
) {
  const { streamId, settings } = params;

  const resolvedRecordingId = initializeRecordingSession(params);

  const { captureWidth, captureHeight, cursorCaptureMode, trackSettings } =
    await prepareRecordingStream(
      appendRecordingViewportParams(
        {
          streamId,
          settings,
        },
        params
      )
    );

  if (!isRecordingSessionStillStarting(resolvedRecordingId)) {
    cleanupResources();
    return;
  }

  await initializeSidecarRecorders({
    baseRecordingId: resolvedRecordingId,
    settings,
    ...(params.captureMode === undefined ? {} : { captureMode: params.captureMode }),
  });

  if (!isRecordingSessionStillStarting(resolvedRecordingId)) {
    cleanupResources();
    return;
  }

  finalizeRecordingBootstrap({
    resolvedRecordingId,
    settings,
    captureWidth,
    captureHeight,
    cursorCaptureMode,
    trackSettings,
    durationTracker,
  });
}

export { cleanupResources };
