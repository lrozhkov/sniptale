import { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { consumeDesktopStream, detachCachedPreview } from './desktop-media';
import { resolveRecordingSafeDimension } from '../dimensions';
import {
  buildWebcamQualityConstraints,
  resolveWebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/webcam-quality';

const logger = createLogger({ namespace: 'OffscreenRecordingSetup' });

export function resolveCaptureDimensions(params: {
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  captureMode?: CaptureMode;
  targetResolution?: { width: number; height: number };
}) {
  const dpr = params.viewport?.devicePixelRatio || 1;
  let captureWidth = params.viewport
    ? resolveRecordingSafeDimension(params.viewport.width * dpr)
    : undefined;
  let captureHeight = params.viewport
    ? resolveRecordingSafeDimension(params.viewport.height * dpr)
    : undefined;

  if (params.captureMode === CaptureMode.VIEWPORT_EMULATION && params.targetResolution) {
    captureWidth = resolveRecordingSafeDimension(params.targetResolution.width);
    captureHeight = resolveRecordingSafeDimension(params.targetResolution.height);
  }

  return { captureWidth, captureHeight };
}

export async function acquireRecordingSourceStream(params: {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
  captureWidth?: number;
  captureHeight?: number;
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
  captureWidth?: number;
  captureHeight?: number;
  controlledCursorCaptureEnabled?: boolean;
}): MediaTrackConstraints {
  const mandatory: Record<string, unknown> = {
    chromeMediaSource: 'tab',
    chromeMediaSourceId: params.streamId,
  };
  if (params.captureWidth && params.captureHeight) {
    mandatory['maxWidth'] = params.captureWidth;
    mandatory['maxHeight'] = params.captureHeight;
  }

  return {
    mandatory,
    ...(params.controlledCursorCaptureEnabled === true ? { cursor: 'never' as const } : {}),
  } as MediaTrackConstraints;
}

async function acquireTabStream({
  streamId,
  settings,
  captureMode,
  captureWidth,
  captureHeight,
}: {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
  captureWidth?: number;
  captureHeight?: number;
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
    ...(captureHeight === undefined ? {} : { captureHeight }),
    ...(captureWidth === undefined ? {} : { captureWidth }),
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
    captureWidth,
    captureHeight,
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
    case CaptureMode.VIEWPORT_EMULATION:
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
