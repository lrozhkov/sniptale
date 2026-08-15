import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  VideoDisplaySurface,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  buildVideoMediaRecorderOptions,
  resolveVideoRecordingArtifact,
} from '../../../platform/media-utils/video-recording';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { recordingContext } from '../context';
import { buildRecordingFilename, finalizeRecording } from '../finalizer';
import {
  getActiveSidecarVideoDimensions,
  getActiveSidecarWebcamSettings,
  startActiveSidecarRecorders,
  stopActiveSidecarRecordersWithFlush,
} from '../sidecar';
import { PostRecordPublicationError } from '../post-record-publication';
import { cleanupResources } from './cleanup';
import { handleRecordingStartError } from './session';
import { createRecordingArtifactSession } from '../encoding/artifact-session';
import { assertRecordingResourceBudget } from '../encoding/resource-budget';
import type { FinalizedRecordingStagingArtifact } from '../../../composition/persistence/recordings/staging';

type RecordingSourceBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
};

const logger = createLogger({ namespace: 'OffscreenRecordingStart' });

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
    quality: settings.outputProfile.quality,
    ...config,
  });

  return config;
}

export async function finalizeRecordingBootstrap(params: {
  resolvedRecordingId: string;
  settings: VideoRecordingSettings;
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  trackSettings: MediaTrackSettings;
  durationTracker: typeof recordingContext.durationTracker;
  sourceBinding?: RecordingSourceBinding;
}) {
  const videoStream = requireRecordingVideoStream();
  const stagingCoordinator = recordingContext.stagingCoordinator;
  if (!stagingCoordinator) {
    throw new Error('Recording staging is not initialized');
  }
  const displaySurface = resolveDisplaySurface(params.trackSettings.displaySurface);
  const webcamSettings = getActiveSidecarWebcamSettings();
  const width = params.trackSettings.width;
  const height = params.trackSettings.height;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Recording output dimensions are unavailable');
  }
  assertRecordingResourceBudget({
    dimensions: [{ height, width }, ...getActiveSidecarVideoDimensions()],
    frameRate: params.settings.outputProfile.frameRate,
    resolution: params.settings.outputProfile.resolution,
  });
  const recorderConfig = buildRecorderConfig(params.settings, videoStream, params.trackSettings);
  const artifact = resolveVideoRecordingArtifact(recorderConfig.mimeType ?? '');
  const artifactSession = await createRecordingArtifactSession({
    artifactId: params.resolvedRecordingId,
    coordinator: stagingCoordinator,
    filename: buildRecordingFilename(artifact.mimeType),
    mimeType: artifact.mimeType,
    recorderOptions: recorderConfig,
    stream: videoStream,
  });
  const mediaRecorder = artifactSession.recorder;
  recordingContext.bindStartingArtifactSession(artifactSession);
  const cancelStartingRecorder = attachRecorderLifecycle({
    artifactSession,
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
  if (params.sourceBinding) {
    const pendingSourceFailure = recordingContext.registerSourceFailureHandler(
      params.sourceBinding,
      cancelStartingRecorder.failUnexpectedly
    );
    if (pendingSourceFailure) throw pendingSourceFailure;
  }
  recordingContext.registerStartingRecorderCancellation(
    mediaRecorder,
    cancelStartingRecorder.cancel
  );
  params.durationTracker.reset();
  artifactSession.start();
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

async function finalizeStoppedRecorder(
  recordingId: string,
  primaryArtifact: FinalizedRecordingStagingArtifact
) {
  const resolveStop = recordingContext.stopRecordingResolve;
  const rejectStop = recordingContext.stopRecordingReject;
  try {
    const sidecarArtifacts = await stopActiveSidecarRecordersWithFlush();
    const staging = recordingContext.stagingCoordinator;
    if (!staging) throw new Error('Recording staging is unavailable during stop.');
    await finalizeRecording({
      artifacts: [primaryArtifact, ...sidecarArtifacts],
      discard: recordingContext.discardOnStop,
      primaryRecordingId: recordingId,
      staging,
    });
    recordingContext.artifactSession = null;
    recordingContext.stagingCoordinator = null;
    cleanupResources();
    resolveStop?.({ result: 'stopped' });
  } catch (error) {
    recordingContext.artifactSession = null;
    recordingContext.stagingCoordinator = null;
    cleanupResources();
    if (error instanceof PostRecordPublicationError) {
      rejectStop?.(error);
    } else if (resolveStop) {
      resolveStop({
        error: error instanceof Error ? error.message : String(error),
        result: 'terminal-failure',
      });
    } else {
      rejectStop?.(error);
    }
    throw error;
  }
}

function attachRecorderLifecycle(params: {
  artifactSession: Awaited<ReturnType<typeof createRecordingArtifactSession>>;
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  displaySurface: (typeof VideoDisplaySurface)[keyof typeof VideoDisplaySurface] | null;
  durationTracker: typeof recordingContext.durationTracker;
  mediaRecorder: MediaRecorder;
  recordingId: string;
  videoStream: MediaStream;
  webcamSettings: ReturnType<typeof getActiveSidecarWebcamSettings>;
}): { cancel: () => void; failUnexpectedly: (error: Error) => void } {
  const { artifactSession, mediaRecorder, recordingId } = params;
  let phase: 'starting' | 'recording' | 'terminal' = 'starting';

  const isTerminal = () => phase === 'terminal';
  const detachTrackEndedHandlers = attachOwnedVideoTrackEndedHandlers(
    params.videoStream,
    handleTrackEnded
  );

  const detachRecorderHandlers = () => {
    detachTrackEndedHandlers();
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

  artifactSession.setLifecycleCallbacks({
    onFailure: failUnexpectedly,
    onStart: () => {
      if (phase !== 'starting') return;
      startActiveSidecarRecorders(failUnexpectedly);
      if (isTerminal()) return;
      recordingContext.activateRecorder(mediaRecorder);
      phase = 'recording';
      params.durationTracker.startSegment();
      notifyRecordingStarted(params);
    },
    onStop: async (artifact) => {
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
        await finalizeStoppedRecorder(recordingId, artifact);
      }
    },
  });

  function handleTrackEnded() {
    if (phase === 'starting') {
      failUnexpectedly(new Error('The recording source ended before the encoder started.'));
      return;
    }
    if (phase !== 'recording' || recordingContext.lifecycleState !== 'recording') return;

    params.durationTracker.freeze();
    params.durationTracker.stopSegment();
    params.durationTracker.publishDuration();
    recordingContext.beginStopRequest({
      discard: false,
      reject: (reason) => {
        notifyRecordingRuntimeErrorBestEffort(
          recordingId,
          reason instanceof Error ? reason : new Error(String(reason))
        );
      },
      resolve: (outcome) => {
        if (outcome?.result === 'terminal-failure') {
          notifyRecordingRuntimeErrorBestEffort(recordingId, new Error(outcome.error));
        }
      },
    });
    void artifactSession.stop().catch(() => undefined);
  }

  return {
    cancel: () => {
      beginTerminalHandling();
      void artifactSession.abort().catch(() => undefined);
    },
    failUnexpectedly,
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
