import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  VideoDisplaySurface,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { buildVideoMediaRecorderOptions } from '../../../platform/media-utils/video-recording';
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
import { handleRecordingStartError } from './session';

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

function buildRecorderConfig(
  settings: VideoRecordingSettings,
  videoStream: MediaStream,
  trackSettings: MediaTrackSettings
) {
  const config = buildVideoMediaRecorderOptions(settings, videoStream, trackSettings);

  logger.debug('Built recorder config', {
    quality: settings.quality,
    ...config,
  });

  return config;
}

export function finalizeRecordingBootstrap(params: {
  resolvedRecordingId: string;
  settings: VideoRecordingSettings;
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  trackSettings: MediaTrackSettings;
  durationTracker: typeof recordingContext.durationTracker;
}) {
  const videoStream = requireRecordingVideoStream();
  const displaySurface = resolveDisplaySurface(params.trackSettings.displaySurface);
  const webcamSettings = getActiveSidecarWebcamSettings();
  const recorderConfig = buildRecorderConfig(params.settings, videoStream, params.trackSettings);
  const mediaRecorder = new MediaRecorder(videoStream, recorderConfig);
  recordingContext.bindStartingRecorder(mediaRecorder);
  recordingContext.recordedChunks.length = 0;
  const cancelStartingRecorder = attachRecorderHandlers({
    ...(params.cursorCaptureMode === undefined
      ? {}
      : { cursorCaptureMode: params.cursorCaptureMode }),
    displaySurface,
    durationTracker: params.durationTracker,
    mediaRecorder,
    recordingId: params.resolvedRecordingId,
    videoStream,
    webcamSettings,
  });
  recordingContext.registerStartingRecorderCancellation(mediaRecorder, cancelStartingRecorder);
  params.durationTracker.reset();
  mediaRecorder.start(RECORDER_TIMESLICE_MS);
}

function notifyRecordingStarted(params: {
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  displaySurface: (typeof VideoDisplaySurface)[keyof typeof VideoDisplaySurface] | null;
  recordingId: string;
  webcamSettings: ReturnType<typeof getActiveSidecarWebcamSettings>;
}): void {
  logger.info('Recording started', { recordingId: params.recordingId });
  sendRuntimeMessageBestEffort({
    context: { recordingId: params.recordingId },
    logger,
    logMessage: 'Failed to notify runtime that recording started',
    payload: {
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
      recordingId: params.recordingId,
      ...(params.cursorCaptureMode === null ? {} : { cursorCaptureMode: params.cursorCaptureMode }),
      ...(params.displaySurface === null ? {} : { displaySurface: params.displaySurface }),
      ...(params.webcamSettings === null ? {} : { webcamSettings: params.webcamSettings }),
    },
  });
}

function attachOwnedVideoTrackEndedHandlers(
  videoStream: MediaStream,
  onEnded: () => void
): () => void {
  const tracks = new Set<MediaStreamTrack>();
  for (const stream of [recordingContext.sourceStream, videoStream]) {
    if (stream && typeof stream.getVideoTracks === 'function') {
      stream.getVideoTracks().forEach((track) => tracks.add(track));
    }
  }
  tracks.forEach((track) => track.addEventListener('ended', onEnded));
  return () => tracks.forEach((track) => track.removeEventListener('ended', onEnded));
}

async function finalizeStoppedRecorder(recordingId: string, mediaRecorder: MediaRecorder) {
  const resolveStop = recordingContext.stopRecordingResolve;
  const rejectStop = recordingContext.stopRecordingReject;
  try {
    const shouldFinalizeSidecars = hasActiveSidecarSession();
    await stopActiveSidecarRecordersWithFlush();
    const result = await finalizeRecording(
      recordingContext.recordedChunks,
      recordingId,
      mediaRecorder.mimeType,
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
    resolveStop?.({ result: 'stopped' });
  } catch (error) {
    cleanupResources();
    if (resolveStop) {
      resolveStop({
        error: error instanceof Error ? error.message : String(error),
        result: 'terminal-failure',
      });
    } else {
      rejectStop?.(error);
    }
  }
}

function attachRecorderHandlers(params: {
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  displaySurface: (typeof VideoDisplaySurface)[keyof typeof VideoDisplaySurface] | null;
  durationTracker: typeof recordingContext.durationTracker;
  mediaRecorder: MediaRecorder;
  recordingId: string;
  videoStream: MediaStream;
  webcamSettings: ReturnType<typeof getActiveSidecarWebcamSettings>;
}) {
  const { mediaRecorder, recordingId } = params;
  let phase: 'starting' | 'recording' | 'terminal' = 'starting';

  const isTerminal = () => phase === 'terminal';
  const detachTrackEndedHandlers = attachOwnedVideoTrackEndedHandlers(
    params.videoStream,
    handleTrackEnded
  );

  const detachRecorderHandlers = () => {
    detachTrackEndedHandlers();
    mediaRecorder.ondataavailable = null;
    mediaRecorder.onerror = null;
    mediaRecorder.onstart = null;
    mediaRecorder.onstop = null;
  };

  const beginTerminalHandling = (): boolean => {
    if (isTerminal()) {
      return false;
    }
    phase = 'terminal';
    detachRecorderHandlers();
    return true;
  };

  const failBoundStop = (error: Error) => {
    if (!beginTerminalHandling()) {
      return;
    }
    const resolveStop = recordingContext.stopRecordingResolve;
    const rejectStop = recordingContext.stopRecordingReject;
    cleanupResources();
    resolveStop?.({ error: error.message, result: 'terminal-failure' });
    if (!resolveStop) rejectStop?.(error);
  };

  const failUnexpectedly = (error: Error) => {
    if (recordingContext.lifecycleState === 'stopping') {
      failBoundStop(error);
      return;
    }
    const failedDuringStart = phase === 'starting';
    if (!beginTerminalHandling()) {
      return;
    }
    if (failedDuringStart) {
      handleRecordingStartError(error, recordingId);
      return;
    }
    notifyRecordingRuntimeErrorBestEffort(recordingId, error);
    cleanupResources();
  };

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordingContext.recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstart = () => {
    if (phase !== 'starting') {
      return;
    }
    try {
      startActiveSidecarRecorders(RECORDER_TIMESLICE_MS, failUnexpectedly);
      if (isTerminal()) {
        return;
      }
      recordingContext.activateRecorder(mediaRecorder);
      phase = 'recording';
      params.durationTracker.startSegment();
      notifyRecordingStarted(params);
    } catch (error) {
      failUnexpectedly(error instanceof Error ? error : new Error(String(error)));
    }
  };

  mediaRecorder.onstop = async () => {
    logger.debug('MediaRecorder stopped');
    if (recordingContext.lifecycleState !== 'stopping') {
      failUnexpectedly(
        new Error(
          phase === 'starting'
            ? 'The recording stopped before the encoder started.'
            : 'The recording stopped unexpectedly.'
        )
      );
      return;
    }
    if (beginTerminalHandling()) {
      await finalizeStoppedRecorder(recordingId, mediaRecorder);
    }
  };

  mediaRecorder.onerror = (event) => {
    const fallbackMessage =
      recordingContext.lifecycleState === 'stopping'
        ? 'The recording failed to stop cleanly.'
        : phase === 'starting'
          ? 'The recording encoder failed to start.'
          : 'The recording encoder failed unexpectedly.';
    failUnexpectedly(getMediaRecorderError(event, fallbackMessage));
  };

  function handleTrackEnded() {
    failUnexpectedly(
      new Error(
        phase === 'starting'
          ? 'The recording source ended before the encoder started.'
          : 'The recording source ended unexpectedly.'
      )
    );
  }

  return () => {
    beginTerminalHandling();
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
      phase: 'runtime',
      recordingId,
    },
  });
}
