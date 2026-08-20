import { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  CaptureMode,
  resolveVideoOutputProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { consumeDesktopStream, detachCachedPreview } from './desktop-media';
import {
  buildWebcamQualityConstraints,
  resolveWebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/webcam-quality';

const logger = createLogger({ namespace: 'OffscreenRecordingSetup' });
// Chromium ignores explicit content-capture dimensions above half of media::limits::kMaxDimension.
const MAX_CHROMIUM_CONTENT_CAPTURE_DIMENSION = 16_383;

export async function acquireRecordingSourceStream(params: {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
  viewport?: { width: number; height: number; devicePixelRatio?: number };
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

type TabCaptureViewport = {
  devicePixelRatio?: number;
  height: number;
  width: number;
};

function resolvePhysicalTabCaptureSize(
  viewport: TabCaptureViewport | undefined
): { height: number; width: number } | null {
  if (!viewport) return null;
  const { devicePixelRatio, height, width } = viewport;
  if (
    typeof devicePixelRatio !== 'number' ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(width) ||
    width <= 0
  ) {
    throw new Error('Tab capture viewport geometry is invalid');
  }
  const physicalHeight = Math.round(height * devicePixelRatio);
  const physicalWidth = Math.round(width * devicePixelRatio);
  if (!Number.isSafeInteger(physicalHeight) || !Number.isSafeInteger(physicalWidth)) {
    throw new Error('Tab capture physical geometry is invalid');
  }
  if (
    physicalHeight > MAX_CHROMIUM_CONTENT_CAPTURE_DIMENSION ||
    physicalWidth > MAX_CHROMIUM_CONTENT_CAPTURE_DIMENSION
  ) {
    throw new Error('Tab capture physical geometry exceeds Chromium limits');
  }
  return {
    height: Math.max(1, physicalHeight),
    width: Math.max(1, physicalWidth),
  };
}

function createTabSourceConstraints(
  streamId: string,
  options: {
    frameRate?: number;
    physicalSize?: { height: number; width: number } | null;
  } = {}
): MediaTrackConstraints {
  return {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId,
      // Chromium seeds its WebContents capture scaler from the requested maximum frame size.
      // Keep that request on the tab's existing physical pixel grid; output scaling happens later.
      ...(options.frameRate ? { maxFrameRate: options.frameRate } : {}),
      ...(options.physicalSize
        ? { maxHeight: options.physicalSize.height, maxWidth: options.physicalSize.width }
        : {}),
    },
  } as MediaTrackConstraints;
}

async function acquireTabStream({
  streamId,
  settings,
  captureMode,
  viewport,
}: {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
  viewport?: TabCaptureViewport;
}) {
  const audioConstraints: MediaTrackConstraints | false = settings.systemAudioEnabled
    ? createTabSourceConstraints(streamId)
    : false;
  const requestedPhysicalSize = resolvePhysicalTabCaptureSize(viewport);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: createTabSourceConstraints(streamId, {
      frameRate: resolveVideoOutputProfile(settings).frameRate,
      physicalSize: requestedPhysicalSize,
    }),
  });
  const cursorCaptureMode = resolveCursorCaptureMode(stream, settings, captureMode);
  logger.debug('Acquired tab capture stream', {
    hasAudio: Boolean(audioConstraints),
    requestedPhysicalSize,
    trackSettings: getTrackSettings(stream),
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

function readNumberSetting(settings: unknown, key: string): number | null {
  if (!isRecord(settings)) return null;
  const value = settings[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getTrackSettings(stream: MediaStream): {
  aspectRatio: number | null;
  cursor: string | null;
  displaySurface: string | null;
  frameRate: number | null;
  height: number | null;
  resizeMode: string | null;
  width: number | null;
} {
  const videoTrack = stream.getVideoTracks()[0];
  const settings: unknown = videoTrack?.getSettings();
  return {
    aspectRatio: readNumberSetting(settings, 'aspectRatio'),
    cursor: readStringSetting(settings, 'cursor'),
    displaySurface: readStringSetting(settings, 'displaySurface'),
    frameRate: readNumberSetting(settings, 'frameRate'),
    height: readNumberSetting(settings, 'height'),
    resizeMode: readStringSetting(settings, 'resizeMode'),
    width: readNumberSetting(settings, 'width'),
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
