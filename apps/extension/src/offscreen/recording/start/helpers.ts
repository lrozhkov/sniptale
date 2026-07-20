import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { recordingContext } from '../context';
import { cleanupResources } from './cleanup';
import { finalizeRecordingBootstrap as bootstrapRecorder } from './recorder';
import { markRecordingStartErrorReported } from './error-reporting';

const logger = createLogger({ namespace: 'OffscreenRecordingStart' });

export function initializeRecordingSession(params: {
  settings: VideoRecordingSettings;
  streamId: string;
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  captureMode?: string;
  cropRegion?: { x: number; y: number; width: number; height: number };
  targetResolution?: { width: number; height: number };
  emulatedViewportCssSize?: { width: number; height: number };
  recordingId?: string;
}) {
  logger.debug('Initializing recording session', {
    captureMode: params.captureMode ?? 'TAB',
    hasViewport: Boolean(params.viewport),
    hasCropRegion: Boolean(params.cropRegion),
    hasTargetResolution: Boolean(params.targetResolution),
    hasEmulatedViewportCssSize: Boolean(params.emulatedViewportCssSize),
    recordingIdProvided: Boolean(params.recordingId),
  });

  const resolvedRecordingId =
    params.recordingId || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  recordingContext.beginRecordingSession(resolvedRecordingId);
  logger.debug('Resolved recording session ID', { recordingId: resolvedRecordingId });
  return resolvedRecordingId;
}

export function finalizeRecordingBootstrap({
  resolvedRecordingId,
  settings,
  captureWidth,
  captureHeight,
  cursorCaptureMode,
  trackSettings,
  durationTracker,
}: {
  resolvedRecordingId: string;
  settings: VideoRecordingSettings;
  captureWidth: number | undefined;
  captureHeight: number | undefined;
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  trackSettings: MediaTrackSettings;
  durationTracker: typeof recordingContext.durationTracker;
}) {
  bootstrapRecorder({
    resolvedRecordingId,
    settings,
    captureWidth,
    captureHeight,
    ...(cursorCaptureMode === undefined ? {} : { cursorCaptureMode }),
    trackSettings,
    durationTracker,
  });
}

export function handleRecordingStartError(error: unknown, recordingId?: string) {
  const scopedRecordingId = recordingId ?? recordingContext.currentRecordingId ?? undefined;
  const payload =
    scopedRecordingId === undefined
      ? {
          type: VideoMessageType.OFFSCREEN_ERROR,
          error: error instanceof Error ? error.message : String(error),
          phase: 'start' as const,
        }
      : {
          type: VideoMessageType.OFFSCREEN_ERROR,
          error: error instanceof Error ? error.message : String(error),
          phase: 'start' as const,
          recordingId: scopedRecordingId,
        };

  logger.error('Failed to start recording', error);
  sendRuntimeMessageBestEffort({
    context: {
      originalErrorMessage: error instanceof Error ? error.message : String(error),
    },
    logger,
    logMessage: 'Failed to notify runtime about recording start failure',
    payload,
  });
  cleanupResources();
  return markRecordingStartErrorReported(error);
}

export { cleanupResources } from './cleanup';
