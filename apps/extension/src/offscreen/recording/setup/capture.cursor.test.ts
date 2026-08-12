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
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

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
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 0,
    countdownSeconds: 3,
    controlledCursorCaptureEnabled: true,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.HIGH },
    systemAudioEnabled: false,
  };
}

it('requests the measured physical viewport as the maximum TAB source size', async () => {
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
    viewport: { devicePixelRatio: 1.25, height: 947, width: 1919 },
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-controlled',
        maxHeight: 1184,
        maxWidth: 2399,
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

it.each([CaptureMode.TAB, CaptureMode.TAB_CROP])(
  'keeps the physical viewport source request for %s independent from output settings',
  async (captureMode) => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [{ getSettings: () => ({}), readyState: 'live' }],
      id: 'tab-stream',
    });
    installMediaDevicesMocks({ getUserMedia });

    await expect(
      acquireRecordingSourceStream({
        captureMode,
        settings: { ...createControlledTabSettings(), controlledCursorCaptureEnabled: false },
        streamId: 'tab-stream-source',
        viewport: { devicePixelRatio: 2, height: 720, width: 1280 },
      })
    ).resolves.toEqual(expect.objectContaining({ cursorCaptureMode: null }));

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: 'tab-stream-source',
          maxHeight: 1440,
          maxWidth: 2560,
        },
      },
    });
    expect(loggerDebugMock).not.toHaveBeenCalledWith(
      expect.stringContaining('Controlled cursor capture'),
      expect.anything()
    );
  }
);

it('uses the same isolated source binding for system audio and video', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [{ getSettings: () => ({}), readyState: 'live' }],
    id: 'tab-stream',
  });
  installMediaDevicesMocks({ getUserMedia });

  await acquireRecordingSourceStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...createControlledTabSettings(),
      controlledCursorCaptureEnabled: false,
      systemAudioEnabled: true,
    },
    streamId: 'tab-stream-with-audio',
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-with-audio',
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-with-audio',
      },
    },
  });
});

it('does not copy video size constraints onto TAB system audio', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [{ getSettings: () => ({}), readyState: 'live' }],
    id: 'tab-stream',
  });
  installMediaDevicesMocks({ getUserMedia });

  await acquireRecordingSourceStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...createControlledTabSettings(),
      controlledCursorCaptureEnabled: false,
      systemAudioEnabled: true,
    },
    streamId: 'tab-stream-physical-audio',
    viewport: { devicePixelRatio: 1.5, height: 900, width: 1440 },
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-physical-audio',
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-physical-audio',
        maxHeight: 1350,
        maxWidth: 2160,
      },
    },
  });
});

it.each([
  { devicePixelRatio: 0, height: 720, width: 1280 },
  { devicePixelRatio: Number.NaN, height: 720, width: 1280 },
  { devicePixelRatio: 2, height: 0, width: 1280 },
  { devicePixelRatio: 2, height: 720, width: Number.POSITIVE_INFINITY },
])(
  'rejects invalid TAB physical viewport geometry before capture: $width × $height',
  async (viewport) => {
    const getUserMedia = vi.fn();
    installMediaDevicesMocks({ getUserMedia });

    await expect(
      acquireRecordingSourceStream({
        captureMode: CaptureMode.TAB,
        settings: createControlledTabSettings(),
        streamId: 'tab-stream-invalid-viewport',
        viewport,
      })
    ).rejects.toThrow('Tab capture viewport geometry is invalid');

    expect(getUserMedia).not.toHaveBeenCalled();
  }
);

it.each([
  { devicePixelRatio: 1, height: 1080, width: 16_384 },
  { devicePixelRatio: 2, height: 8192, width: 1280 },
])('rejects TAB dimensions Chromium would silently replace: $width × $height', async (viewport) => {
  const getUserMedia = vi.fn();
  installMediaDevicesMocks({ getUserMedia });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.TAB,
      settings: createControlledTabSettings(),
      streamId: 'tab-stream-oversized-viewport',
      viewport,
    })
  ).rejects.toThrow('Tab capture physical geometry exceeds Chromium limits');

  expect(getUserMedia).not.toHaveBeenCalled();
});

it('keeps controlled tab telemetry alive when native cursor exclusion was not requested', async () => {
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
