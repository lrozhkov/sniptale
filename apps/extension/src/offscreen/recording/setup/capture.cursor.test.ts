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

it('requests the measured viewport as a non-blocking ideal over the tab source binding', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [{ getSettings: () => ({ width: 1024, height: 768 }) }],
  });
  installMediaDevicesMocks({ getUserMedia });

  await acquireRecordingSourceStream({
    captureMode: CaptureMode.TAB,
    settings: { ...createControlledTabSettings(), controlledCursorCaptureEnabled: false },
    streamId: 'tab-stream-viewport',
    viewport: { width: 1904, height: 985 },
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      aspectRatio: { ideal: 1904 / 985 },
      height: { ideal: 985 },
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-viewport',
      },
      width: { ideal: 1904 },
    },
  });
});

it.each([CaptureMode.TAB, CaptureMode.TAB_CROP])(
  'excludes the native cursor from viewport-projected %s without enabling action telemetry',
  async (captureMode) => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [{ getSettings: () => ({ cursor: 'never' }), readyState: 'live' }],
      id: 'tab-stream',
    });
    installMediaDevicesMocks({ getUserMedia });

    await expect(
      acquireRecordingSourceStream({
        captureMode,
        excludeNativeCursor: true,
        settings: { ...createControlledTabSettings(), controlledCursorCaptureEnabled: false },
        streamId: 'tab-stream-viewport-cursor',
      })
    ).resolves.toEqual(expect.objectContaining({ cursorCaptureMode: null }));

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        cursor: 'never',
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: 'tab-stream-viewport-cursor',
        },
      },
    });
    expect(loggerDebugMock).not.toHaveBeenCalledWith(
      expect.stringContaining('Controlled cursor capture'),
      expect.anything()
    );
  }
);

it('keeps viewport-projected tab capture when Chrome omits cursor track settings', async () => {
  const stop = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop }],
    getVideoTracks: () => [{ getSettings: () => ({}), readyState: 'live' }],
    id: 'tab-stream',
  });
  installMediaDevicesMocks({ getUserMedia });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.TAB,
      excludeNativeCursor: true,
      settings: { ...createControlledTabSettings(), controlledCursorCaptureEnabled: false },
      streamId: 'tab-stream-unreported-cursor',
    })
  ).resolves.toEqual(expect.objectContaining({ cursorCaptureMode: null }));

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      cursor: 'never',
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-unreported-cursor',
      },
    },
  });
  expect(stop).not.toHaveBeenCalled();
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Tab capture accepted cursor-free constraints without cursor track settings',
    { displaySurface: null }
  );
});

it.each(['always', 'motion'] as const)(
  'fails closed and releases the source when native cursor exclusion reports %s',
  async (cursor) => {
    const videoTrack = {
      getSettings: () => ({ cursor }),
      readyState: 'live',
      stop: vi.fn(),
    };
    const audioTrack = { stop: vi.fn() };
    installMediaDevicesMocks({
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [videoTrack, audioTrack],
        getVideoTracks: () => [videoTrack],
        id: 'tab-stream',
      }),
    });

    await expect(
      acquireRecordingSourceStream({
        captureMode: CaptureMode.TAB,
        excludeNativeCursor: true,
        settings: { ...createControlledTabSettings(), controlledCursorCaptureEnabled: false },
        streamId: 'tab-stream-cursor-leak',
      })
    ).rejects.toThrow('Native cursor exclusion could not be verified');

    expect(videoTrack.stop).toHaveBeenCalledOnce();
    expect(audioTrack.stop).toHaveBeenCalledOnce();
  }
);

it('fails closed and releases an unverified source without a video track', async () => {
  const audioTrack = { stop: vi.fn() };
  installMediaDevicesMocks({
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [audioTrack],
      getVideoTracks: () => [],
      id: 'tab-stream',
    }),
  });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.TAB,
      excludeNativeCursor: true,
      settings: { ...createControlledTabSettings(), controlledCursorCaptureEnabled: false },
      streamId: 'tab-stream-without-video',
    })
  ).rejects.toThrow('Native cursor exclusion could not be verified');

  expect(audioTrack.stop).toHaveBeenCalledOnce();
});

it('fails closed and releases every track when cursor settings cannot be read', async () => {
  const videoTrack = {
    getSettings: () => {
      throw new Error('track settings unavailable');
    },
    readyState: 'live',
    stop: vi.fn(),
  };
  const audioTrack = { stop: vi.fn() };
  installMediaDevicesMocks({
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [videoTrack, audioTrack],
      getVideoTracks: () => [videoTrack],
      id: 'tab-stream',
    }),
  });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.TAB,
      excludeNativeCursor: true,
      settings: { ...createControlledTabSettings(), controlledCursorCaptureEnabled: false },
      streamId: 'tab-stream-settings-error',
    })
  ).rejects.toThrow('Native cursor exclusion could not be verified');

  expect(videoTrack.stop).toHaveBeenCalledOnce();
  expect(audioTrack.stop).toHaveBeenCalledOnce();
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
