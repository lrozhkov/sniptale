// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { consumeDesktopStreamMock, detachCachedPreviewMock, loggerDebugMock, loggerWarnMock } =
  vi.hoisted(() => ({
    consumeDesktopStreamMock: vi.fn(),
    detachCachedPreviewMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

vi.mock('./desktop-media', () => ({
  consumeDesktopStream: consumeDesktopStreamMock,
  consumeDesktopStreams: vi.fn(),
  detachCachedPreview: detachCachedPreviewMock,
  disposeMultiSourceDesktopMedia: vi.fn(),
  requestDesktopMedia: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    warn: loggerWarnMock,
  }),
}));
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { acquireRecordingSourceStream } from './capture';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function installMediaDevicesMocks(overrides: Partial<MediaDevices> = {}) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(),
      ...overrides,
    },
  });
}

function createControlledTabSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    controlledCursorCaptureEnabled: true,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
  };
}

it('requests tab capture without the native cursor when controlled cursor capture is enabled', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [{ getSettings: () => ({ cursor: 'never' }), readyState: 'live' }],
    id: 'tab-stream',
  });
  installMediaDevicesMocks({ getUserMedia });

  await acquireRecordingSourceStream({
    captureMode: CaptureMode.TAB,
    settings: createControlledTabSettings(),
    streamId: 'tab-stream-controlled',
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      cursor: 'never',
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-controlled',
      },
    },
  });
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Controlled cursor capture will use embedded cursor telemetry',
    expect.objectContaining({
      captureMode: CaptureMode.TAB,
      cursorSetting: 'never',
    })
  );
  expect(loggerWarnMock).not.toHaveBeenCalled();
});

it('keeps tab recordings alive when cursor exclusion cannot be verified', async () => {
  const stop = vi.fn();
  installMediaDevicesMocks({
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
      getVideoTracks: () => [{ getSettings: () => ({ cursor: 'always' }), readyState: 'live' }],
      id: 'tab-stream',
    }),
  });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.TAB,
      settings: createControlledTabSettings(),
      streamId: 'tab-stream-controlled',
    })
  ).resolves.toEqual(
    expect.objectContaining({
      cursorCaptureMode: 'embedded-fallback',
    })
  );

  expect(stop).not.toHaveBeenCalled();
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Controlled cursor capture will use embedded cursor telemetry',
    expect.objectContaining({
      captureMode: CaptureMode.TAB,
      cursorSetting: 'always',
    })
  );
});

it('verifies screen cursor mode from the selected cached desktop stream', async () => {
  installMediaDevicesMocks();
  consumeDesktopStreamMock
    .mockReturnValueOnce({
      label: 'Window 1',
      stream: {
        active: true,
        getVideoTracks: () => [{ getSettings: () => ({ cursor: 'never' }), readyState: 'live' }],
      },
    })
    .mockReturnValueOnce({
      label: 'Window 2',
      stream: {
        active: true,
        getVideoTracks: () => [{ getSettings: () => ({ cursor: 'motion' }), readyState: 'live' }],
      },
    });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.SCREEN,
      settings: createControlledTabSettings(),
      streamId: 'screen-stream-1',
    })
  ).resolves.toEqual(expect.objectContaining({ cursorCaptureMode: 'separate' }));
  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.SCREEN,
      settings: createControlledTabSettings(),
      streamId: 'screen-stream-2',
    })
  ).resolves.toEqual(expect.objectContaining({ cursorCaptureMode: 'embedded-fallback' }));

  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Controlled cursor capture fell back to embedded screen cursor telemetry',
    expect.objectContaining({
      captureMode: CaptureMode.SCREEN,
      cursorSetting: 'motion',
    })
  );
});
