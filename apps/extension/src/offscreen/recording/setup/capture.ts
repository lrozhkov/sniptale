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
  excludeNativeCursor?: boolean;
  viewport?: { width: number; height: number };
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
  excludeNativeCursor?: boolean;
  viewport?: { width: number; height: number };
}): MediaTrackConstraints {
  const mandatory: Record<string, unknown> = {
    chromeMediaSource: 'tab',
    chromeMediaSourceId: params.streamId,
  };
  return {
    mandatory,
    ...(params.viewport
      ? {
          aspectRatio: { ideal: params.viewport.width / params.viewport.height },
          height: { ideal: params.viewport.height },
          width: { ideal: params.viewport.width },
        }
      : {}),
    ...(params.controlledCursorCaptureEnabled === true || params.excludeNativeCursor === true
      ? { cursor: 'never' as const }
      : {}),
  } as MediaTrackConstraints;
}

async function acquireTabStream({
  streamId,
  settings,
  captureMode,
  excludeNativeCursor,
  viewport,
}: {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
  excludeNativeCursor?: boolean;
  viewport?: { width: number; height: number };
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
    ...(viewport === undefined ? {} : { viewport }),
    ...(settings.controlledCursorCaptureEnabled === undefined
      ? {}
      : { controlledCursorCaptureEnabled: settings.controlledCursorCaptureEnabled }),
    ...(excludeNativeCursor === undefined ? {} : { excludeNativeCursor }),
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: videoConstraints,
  });
  if (excludeNativeCursor === true) assertNativeCursorExclusionNotContradicted(stream);
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

function stopAcquiredStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch (error) {
      logger.warn('Failed to stop a rejected tab capture track', error);
    }
  }
}

function assertNativeCursorExclusionNotContradicted(stream: MediaStream): void {
  if (!stream.getVideoTracks()[0]) {
    stopAcquiredStream(stream);
    throw new Error('Native cursor exclusion could not be verified');
  }
  let cursorSetting: string | null;
  let displaySurface: string | null;
  try {
    const trackSettings = getTrackSettings(stream);
    cursorSetting = trackSettings.cursor;
    displaySurface = trackSettings.displaySurface;
  } catch (error) {
    stopAcquiredStream(stream);
    throw new Error('Native cursor exclusion could not be verified', { cause: error });
  }
  if (cursorSetting === 'never') return;
  if (cursorSetting === null) {
    logger.debug('Tab capture accepted cursor-free constraints without cursor track settings', {
      displaySurface,
    });
    return;
  }
  stopAcquiredStream(stream);
  throw new Error('Native cursor exclusion could not be verified');
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
