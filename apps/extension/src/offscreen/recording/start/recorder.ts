import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoDisplaySurface,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getSupportedMimeType } from '../stream';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { recordingContext } from '../context';
import {
  finalizeRecording,
  notifyRecordingStoppedBestEffort,
  notifyVideoSavedToIdbBestEffort,
} from '../finalizer';
import {
  finalizeActiveSidecarRecordings,
  getActiveSidecarWebcamSettings,
  hasActiveSidecarSession,
  startActiveSidecarRecorders,
  stopActiveSidecarRecordersWithFlush,
} from '../sidecar';
import { getMediaRecorderError } from '../recorder-error';
import { cleanupResources } from './cleanup';
import { resolveRecordingStartMimeType } from './mime';

const logger = createLogger({ namespace: 'OffscreenRecordingStart' });
const RECORDER_TIMESLICE_MS = 1000;

function resolveDisplaySurface(
  value: string | undefined
): (typeof VideoDisplaySurface)[keyof typeof VideoDisplaySurface] | null {
  switch (value) {
    case undefined:
      return null;
    case VideoDisplaySurface.BROWSER:
    case VideoDisplaySurface.MONITOR:
    case VideoDisplaySurface.WINDOW:
      return value;
    default:
      return null;
  }
}

function requireRecordingVideoStream(): MediaStream {
  if (!recordingContext.videoStream) {
    throw new Error('Recording video stream is not initialized');
  }

  return recordingContext.videoStream;
}

function getAudioTrackCount(videoStream: MediaStream): number {
  return typeof videoStream.getAudioTracks === 'function' ? videoStream.getAudioTracks().length : 0;
}

function resolveRecorderMimeType(preferredMimeType: string, videoStream: MediaStream): string {
  const hasAudioTracks = getAudioTrackCount(videoStream) > 0;
  const usesDerivedVideoStream =
    recordingContext.sourceStream !== null && recordingContext.sourceStream !== videoStream;

  return resolveRecordingStartMimeType({
    fallbackMimeType: getSupportedMimeType,
    hasAudioTracks,
    preferredMimeType,
    usesDerivedVideoStream,
  });
}

function buildRecorderConfig(
  settings: VideoRecordingSettings,
  captureWidth: number | undefined,
  captureHeight: number | undefined,
  trackSettings: MediaTrackSettings,
  videoStream: MediaStream
) {
  const qualityKey =
    settings.quality && VIDEO_QUALITY_CONFIGS[settings.quality]
      ? settings.quality
      : VideoQuality.HIGH;
  const qualityConfig = VIDEO_QUALITY_CONFIGS[qualityKey];
  const mimeType = resolveRecorderMimeType(qualityConfig.mimeType, videoStream);

  const actualWidth = captureWidth || trackSettings.width || 1920;
  const actualHeight = captureHeight || trackSettings.height || 1080;
  const resolutionScale = Math.max(0.5, Math.min((actualWidth * actualHeight) / (1920 * 1080), 4));
  const scaledBitrate = Math.round(qualityConfig.videoBitsPerSecond * resolutionScale);

  logger.debug('Built recorder config', {
    qualityKey,
    mimeType,
    actualWidth,
    actualHeight,
    frameRate: trackSettings.frameRate,
    resolutionScale: Number(resolutionScale.toFixed(2)),
    videoBitsPerSecond: scaledBitrate,
  });

  return {
    mimeType,
    videoBitsPerSecond: scaledBitrate,
  };
}

export function finalizeRecordingBootstrap(params: {
  resolvedRecordingId: string;
  settings: VideoRecordingSettings;
  captureWidth: number | undefined;
  captureHeight: number | undefined;
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  trackSettings: MediaTrackSettings;
  durationTracker: typeof recordingContext.durationTracker;
}) {
  const videoStream = requireRecordingVideoStream();
  const displaySurface = resolveDisplaySurface(params.trackSettings.displaySurface);
  const webcamSettings = getActiveSidecarWebcamSettings();
  const recorderConfig = buildRecorderConfig(
    params.settings,
    params.captureWidth,
    params.captureHeight,
    params.trackSettings,
    videoStream
  );
  const mediaRecorder = new MediaRecorder(videoStream, recorderConfig);
  recordingContext.activateRecorder(mediaRecorder);
  recordingContext.recordedChunks.length = 0;
  attachRecorderHandlers(params.resolvedRecordingId, mediaRecorder);
  params.durationTracker.reset();
  startActiveSidecarRecorders(RECORDER_TIMESLICE_MS);
  mediaRecorder.start(RECORDER_TIMESLICE_MS);
  params.durationTracker.startSegment();
  logger.info('Recording started', { recordingId: params.resolvedRecordingId });
  sendRuntimeMessageBestEffort({
    context: { recordingId: params.resolvedRecordingId },
    logger,
    logMessage: 'Failed to notify runtime that recording started',
    payload: {
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
      recordingId: params.resolvedRecordingId,
      ...(params.cursorCaptureMode === null ? {} : { cursorCaptureMode: params.cursorCaptureMode }),
      ...(displaySurface === null ? {} : { displaySurface }),
      ...(webcamSettings === null ? {} : { webcamSettings }),
    },
  });
}

function attachRecorderHandlers(recordingId: string, mediaRecorder: MediaRecorder) {
  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordingContext.recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    logger.debug('MediaRecorder stopped');
    const resolveStop = recordingContext.stopRecordingResolve;
    const rejectStop = recordingContext.stopRecordingReject;
    try {
      const shouldFinalizeSidecars = hasActiveSidecarSession();
      await stopActiveSidecarRecordersWithFlush();
      const result = await finalizeRecording(
        recordingContext.recordedChunks,
        recordingId,
        undefined,
        recordingContext.discardOnStop,
        {
          notifySaved: !shouldFinalizeSidecars,
          notifyStopped: !shouldFinalizeSidecars,
        }
      );
      if (shouldFinalizeSidecars) {
        await finalizeActiveSidecarRecordings(recordingContext.discardOnStop);
        if (result) {
          await notifyVideoSavedToIdbBestEffort(result.recordingId, result.filename);
        }
        notifyRecordingStoppedBestEffort('recording-finalized-with-sidecars', recordingId);
      }
      cleanupResources();
      resolveStop?.();
    } catch (error) {
      cleanupResources();
      rejectStop?.(error);
    }
  };

  mediaRecorder.onerror = (event) => {
    const error = getMediaRecorderError(event, 'The recording failed to stop cleanly.');
    const rejectStop = recordingContext.stopRecordingReject;
    notifyRecordingRuntimeErrorBestEffort(recordingId, error);
    cleanupResources();
    rejectStop?.(error);
  };
}

function notifyRecordingRuntimeErrorBestEffort(recordingId: string, error: Error): void {
  sendRuntimeMessageBestEffort({
    context: { recordingId },
    logger,
    logMessage: 'Failed to notify runtime about recording runtime failure',
    payload: {
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: error.message,
      phase: 'stop',
      recordingId,
    },
  });
}
