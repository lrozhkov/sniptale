import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { recordingContext } from '../context';
import { cleanupResources } from './cleanup';
import {
  markRecordingStartErrorReported,
  RecordingStartCleanupConfirmedError,
} from './error-reporting';
import type { RecordingFrameClockBinding } from '../../../contracts/video/recording-frame-clock';

const logger = createLogger({ namespace: 'OffscreenRecordingStart' });

export function initializeRecordingSession(params: {
  settings: VideoRecordingSettings;
  streamId: string;
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  captureMode?: string;
  cropRegion?: { x: number; y: number; width: number; height: number };
  generation: number;
  streamInstanceId: string;
  surface?: { presetId: string; target: 'window'; width: number; height: number };
  recordingId: string;
}) {
  logger.debug('Initializing recording session', {
    captureMode: params.captureMode ?? 'TAB',
    hasViewport: Boolean(params.viewport),
    hasCropRegion: Boolean(params.cropRegion),
    generation: params.generation,
    hasSurface: Boolean(params.surface),
    recordingIdProvided: Boolean(params.recordingId),
  });

  const resolvedRecordingId = params.recordingId;
  recordingContext.beginRecordingSession(resolvedRecordingId, params.generation);
  recordingContext.configureMicrophoneObservation(params.settings.microphoneEnabled);
  recordingContext.bindStreamInstance({
    generation: params.generation,
    recordingId: resolvedRecordingId,
    streamInstanceId: params.streamInstanceId,
  });
  logger.debug('Resolved recording session ID', { recordingId: resolvedRecordingId });
  return resolvedRecordingId;
}

export function handleRecordingStartError(
  error: unknown,
  recordingId?: string,
  binding?: RecordingFrameClockBinding
) {
  const ownsBinding = binding !== undefined && recordingContext.matchesSourceBinding(binding);
  const hasPendingArtifacts =
    recordingContext.artifactSession !== null || recordingContext.stagingCoordinator !== null;
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
  return markRecordingStartErrorReported(
    ownsBinding && binding && !hasPendingArtifacts
      ? new RecordingStartCleanupConfirmedError(error, binding)
      : error
  );
}
