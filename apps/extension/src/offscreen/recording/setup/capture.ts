import { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { consumeDesktopStream, detachCachedPreview } from './desktop-media';
import {
  buildWebcamQualityConstraints,
  resolveWebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/webcam-quality';

const logger = createLogger({ namespace: 'OffscreenRecordingSetup' });

export async function acquireRecordingSourceStream(params: {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
}) {
  if (params.captureMode === CaptureMode.SCREEN) {
    return acquireDesktopStream(params.settings);
  }

  if (params.captureMode === CaptureMode.CAMERA) {
    return acquireCameraStream(params.settings);
  }

  return acquireTabStream(params);
}

async function acquireDesktopStream(settings: VideoRecordingSettings) {
  const cached = consumeDesktopStream();
  if (
    cached.stream &&
    cached.stream.active &&
    cached.stream.getVideoTracks()[0]?.readyState !== 'ended'
  ) {
    logger.debug('Reusing cached desktop stream', { hasLabel: Boolean(cached.label) });
    return {
      stream: cached.stream,
      cursorCaptureMode: resolveCursorCaptureMode(cached.stream, settings, CaptureMode.SCREEN),
    };
  }

  detachCachedPreview();
  throw new Error('Desktop media stream was not available after source selection');
}

async function acquireCameraStream(settings: VideoRecordingSettings) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      ...(settings.webcamDeviceId ? { deviceId: { exact: settings.webcamDeviceId } } : {}),
      ...buildWebcamQualityConstraints(resolveWebcamQualitySettings(settings)),
    },
  });
  logger.debug('Acquired camera recording stream', {
    deviceSelected: Boolean(settings.webcamDeviceId),
  });
  return {
    stream,
    cursorCaptureMode: null,
  };
}

function createTabVideoConstraints(params: {
  streamId: string;
  controlledCursorCaptureEnabled?: boolean;
}): MediaTrackConstraints {
  const mandatory: Record<string, unknown> = {
    chromeMediaSource: 'tab',
    chromeMediaSourceId: params.streamId,
  };
  return {
    mandatory,
    ...(params.controlledCursorCaptureEnabled === true ? { cursor: 'never' as const } : {}),
  } as MediaTrackConstraints;
}

async function acquireTabStream({
  streamId,
  settings,
  captureMode,
}: {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
}) {
  const audioConstraints: MediaTrackConstraints | false = settings.systemAudioEnabled
    ? ({
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      } as MediaTrackConstraints)
    : false;

  const videoConstraints = createTabVideoConstraints({
    streamId,
    ...(settings.controlledCursorCaptureEnabled === undefined
      ? {}
      : { controlledCursorCaptureEnabled: settings.controlledCursorCaptureEnabled }),
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: videoConstraints,
  });
  const cursorCaptureMode = resolveCursorCaptureMode(stream, settings, captureMode);
  logger.debug('Acquired tab capture stream', {
    hasAudio: Boolean(audioConstraints),
  });
  return {
    stream,
    cursorCaptureMode,
  };
}

function getTrackSettings(
  stream: MediaStream
): (MediaTrackSettings & { cursor?: string; displaySurface?: string }) | undefined {
  const videoTrack = stream.getVideoTracks()[0];
  return videoTrack?.getSettings() as
    | (MediaTrackSettings & {
        cursor?: string;
        displaySurface?: string;
      })
    | undefined;
}

function resolveCursorCaptureMode(
  stream: MediaStream,
  settings: VideoRecordingSettings,
  captureMode?: CaptureMode
): VideoCursorCaptureMode | null {
  if (settings.controlledCursorCaptureEnabled !== true) {
    return null;
  }

  const videoTrack = stream.getVideoTracks()[0];
  const trackSettings = getTrackSettings(stream);
  const cursorSetting = trackSettings?.cursor ?? null;
  const sharedLogContext = {
    cursorSetting,
    displaySurface: trackSettings?.displaySurface ?? null,
    hasVideoTrack: videoTrack !== undefined,
    readyState: videoTrack?.readyState ?? null,
  };

  switch (captureMode) {
    case CaptureMode.SCREEN:
      if (cursorSetting === 'never') {
        logger.debug('Controlled cursor capture verified a cursor-free screen stream', {
          ...sharedLogContext,
          captureMode,
        });
        return VideoCursorCaptureMode.SEPARATE;
      }

      logger.warn('Controlled cursor capture fell back to embedded screen cursor telemetry', {
        ...sharedLogContext,
        captureMode,
      });
      return VideoCursorCaptureMode.EMBEDDED_FALLBACK;
    case CaptureMode.TAB:
    case CaptureMode.TAB_CROP:
      logger.debug('Controlled cursor capture will use embedded cursor telemetry', {
        ...sharedLogContext,
        captureMode,
      });
      return VideoCursorCaptureMode.EMBEDDED_FALLBACK;
    case CaptureMode.CAMERA:
      return null;
    case undefined:
      return VideoCursorCaptureMode.EMBEDDED_FALLBACK;
  }
}
