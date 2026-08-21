import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  VideoDisplaySurface,
  VideoOutputCodec,
  VideoOutputContainer,
  resolveVideoTargetBitrate,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { recordingContext } from '../context';
import { buildRecordingFilename, finalizeRecording } from '../finalizer';
import {
  getActiveSidecarVideoProfiles,
  getActiveSidecarWebcamSettings,
  startActiveSidecarRecorders,
  stopActiveSidecarRecordersWithFlush,
} from '../sidecar';
import { PostRecordPublicationError } from '../post-record-publication';
import { cleanupResources } from './cleanup';
import { handleRecordingStartError } from './session';
import {
  createLiveRecordingArtifactSession,
  type LiveRecordingEncodingConfig,
} from '../encoding/live-artifact-session';
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

function resolveLiveVideoBitrate(
  settings: VideoRecordingSettings,
  trackSettings: MediaTrackSettings
): number {
  const profile = settings.outputProfile;
  const width = trackSettings.width;
  const height = trackSettings.height;
  if (!width || !height) throw new Error('Recording output dimensions are unavailable');
  return resolveVideoTargetBitrate({
    fps: profile.frameRate,
    height,
    quality: profile.quality,
    resolution: profile.resolution,
    width,
  });
}

function buildLiveEncoderConfig(
  settings: VideoRecordingSettings,
  trackSettings: MediaTrackSettings
): LiveRecordingEncodingConfig {
  const profile = settings.outputProfile;
  const width = trackSettings.width;
  const height = trackSettings.height;
  if (!width || !height) throw new Error('Recording output dimensions are unavailable');
  const config: LiveRecordingEncodingConfig = {
    audioBitrate: 128_000,
    audioCodec: profile.container === VideoOutputContainer.MP4 ? 'aac' : 'opus',
    container: profile.container === VideoOutputContainer.MP4 ? 'mp4' : 'webm',
    frameRate: profile.frameRate,
    videoBitrate: resolveLiveVideoBitrate(settings, trackSettings),
    videoCodec:
      profile.codec === VideoOutputCodec.AVC
        ? 'avc'
        : profile.codec === VideoOutputCodec.VP9
          ? 'vp9'
          : 'vp8',
    ...(profile.codec === VideoOutputCodec.AVC
      ? { videoCodecString: resolveAvcCodecString(width, height, profile.frameRate) }
      : {}),
  };

  logger.debug('Built recorder config', {
    quality: settings.outputProfile.quality,
    ...config,
  });

  return config;
}

function resolveAvcCodecString(width: number, height: number, frameRate: number): string {
  const macroblocksPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const macroblocksPerSecond = macroblocksPerFrame * frameRate;
  const levels = [
    { codec: 'avc1.64002a', maxFrame: 8_704, maxRate: 522_240 },
    { codec: 'avc1.640032', maxFrame: 22_080, maxRate: 589_824 },
    { codec: 'avc1.640033', maxFrame: 36_864, maxRate: 983_040 },
    { codec: 'avc1.640034', maxFrame: 36_864, maxRate: 2_073_600 },
  ];
  const level = levels.find(
    (candidate) =>
      macroblocksPerFrame <= candidate.maxFrame && macroblocksPerSecond <= candidate.maxRate
  );
  if (!level) {
    throw new Error(`AVC profile cannot encode ${width}x${height} at ${frameRate} FPS`);
  }
  return level.codec;
}

export async function finalizeRecordingBootstrap(params: {
  resolvedRecordingId: string;
  settings: VideoRecordingSettings;
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  encoderFrameCrop?: { x: number; y: number; width: number; height: number } | null;
  trackSettings: MediaTrackSettings;
  durationTracker: typeof recordingContext.durationTracker;
  sourceBinding?: RecordingSourceBinding;
  transformFailure?: Promise<never> | null;
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
    artifacts: [
      {
        dimensions: { height, width },
        frameRate: params.settings.outputProfile.frameRate,
      },
      ...getActiveSidecarVideoProfiles(),
    ],
    frameRate: params.settings.outputProfile.frameRate,
    resolution: params.settings.outputProfile.resolution,
  });
  const encoderConfig = buildLiveEncoderConfig(params.settings, params.trackSettings);
  const mimeType = encoderConfig.container === 'mp4' ? 'video/mp4' : 'video/webm';
  const artifactSession = await createLiveRecordingArtifactSession({
    artifactId: params.resolvedRecordingId,
    coordinator: stagingCoordinator,
    encoding: encoderConfig,
    filename: buildRecordingFilename(mimeType),
    ...(params.encoderFrameCrop ? { frameCrop: params.encoderFrameCrop } : {}),
    mimeType,
    stream: videoStream,
  });
  recordingContext.bindStartingArtifactSession(artifactSession);
  const cancelStartingRecorder = attachRecorderLifecycle({
    artifactSession,
    ...(params.cursorCaptureMode === undefined
      ? {}
      : { cursorCaptureMode: params.cursorCaptureMode }),
    displaySurface,
    durationTracker: params.durationTracker,
    recordingId: params.resolvedRecordingId,
    videoStream,
    webcamSettings,
    transformFailure: params.transformFailure ?? null,
  });
  if (params.sourceBinding) {
    const pendingSourceFailure = recordingContext.registerSourceFailureHandler(
      params.sourceBinding,
      cancelStartingRecorder.failUnexpectedly
    );
    if (pendingSourceFailure) throw pendingSourceFailure;
  }
  recordingContext.registerStartingRecorderCancellation(
    artifactSession,
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
  artifactSession: Awaited<ReturnType<typeof createLiveRecordingArtifactSession>>;
  cursorCaptureMode?: VideoCursorCaptureMode | null;
  displaySurface: (typeof VideoDisplaySurface)[keyof typeof VideoDisplaySurface] | null;
  durationTracker: typeof recordingContext.durationTracker;
  recordingId: string;
  videoStream: MediaStream;
  webcamSettings: ReturnType<typeof getActiveSidecarWebcamSettings>;
  transformFailure: Promise<never> | null;
}): { cancel: () => void; failUnexpectedly: (error: Error) => void } {
  const { artifactSession, recordingId } = params;
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

  void params.transformFailure?.catch(failUnexpectedly);

  artifactSession.setLifecycleCallbacks({
    onFailure: failUnexpectedly,
    onStart: () => {
      if (phase !== 'starting') return;
      startActiveSidecarRecorders(failUnexpectedly);
      if (isTerminal()) return;
      recordingContext.activateRecorder(artifactSession);
      phase = 'recording';
      params.durationTracker.startSegment();
      notifyRecordingStarted(params);
    },
    onStop: async (artifact) => {
      logger.debug('Live recording encoder stopped');
      recordingContext.reportArtifactFinalizing();
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
