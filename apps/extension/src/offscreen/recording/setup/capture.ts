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

function createTabSourceConstraints(streamId: string): MediaTrackConstraints {
  return {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId,
    },
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
    ? createTabSourceConstraints(streamId)
    : false;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: createTabSourceConstraints(streamId),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringSetting(settings: unknown, key: string): string | null {
  if (!isRecord(settings)) return null;
  const value = settings[key];
  return typeof value === 'string' ? value : null;
}

function getTrackSettings(stream: MediaStream): {
  cursor: string | null;
  displaySurface: string | null;
} {
  const videoTrack = stream.getVideoTracks()[0];
  const settings: unknown = videoTrack?.getSettings();
  return {
    cursor: readStringSetting(settings, 'cursor'),
    displaySurface: readStringSetting(settings, 'displaySurface'),
  };
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
  const cursorSetting = trackSettings.cursor;
  const sharedLogContext = {
    cursorSetting,
    displaySurface: trackSettings.displaySurface,
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
