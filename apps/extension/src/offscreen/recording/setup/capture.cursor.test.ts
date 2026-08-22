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
  VideoFrameRate,
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
    interactionDiagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.HIGH },
    systemAudioEnabled: false,
  };
}

function createNativeTabTrack(settings: Record<string, unknown> = {}) {
  return {
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    cropTo: vi.fn().mockResolvedValue(undefined),
    getSettings: () => ({ frameRate: 30, resizeMode: 'none', ...settings }),
    readyState: 'live',
  };
}

it('keeps TAB capture off Region Capture and requests the viewport-sized source', async () => {
  const track = createNativeTabTrack({ frameRate: 60 });
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [track],
    getVideoTracks: () => [track],
    id: 'region-tab-stream',
  });
  installMediaDevicesMocks({ getUserMedia });

  await acquireRecordingSourceStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...createControlledTabSettings(),
      controlledCursorCaptureEnabled: false,
      outputProfile: {
        ...createControlledTabSettings().outputProfile,
        frameRate: VideoFrameRate.FPS60,
      },
    },
    streamId: 'region-tab-stream',
    viewport: { devicePixelRatio: 1, height: 1309, width: 2560 },
  });

  expect(track.cropTo).not.toHaveBeenCalled();
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'region-tab-stream',
        maxFrameRate: 60,
        maxHeight: 1309,
        maxWidth: 2560,
        minFrameRate: 60,
      },
    },
  });
  expect(track.applyConstraints).not.toHaveBeenCalled();
});

it('requests TAB viewport dimensions from Chromium capture', async () => {
  const applyConstraints = vi.fn().mockResolvedValue(undefined);
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [
      {
        applyConstraints,
        getSettings: () => ({ cursor: 'never', frameRate: 30, resizeMode: 'none' }),
        readyState: 'live',
      },
    ],
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
        maxFrameRate: 30,
        maxHeight: 1184,
        maxWidth: 2399,
        minFrameRate: 30,
      },
    },
  });
  expect(applyConstraints).not.toHaveBeenCalled();
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
  'requests the %s source at viewport physical size',
  async (captureMode) => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [createNativeTabTrack()],
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
          maxFrameRate: 30,
          maxHeight: 1440,
          maxWidth: 2560,
          minFrameRate: 30,
        },
      },
    });
    expect(loggerDebugMock).not.toHaveBeenCalledWith(
      expect.stringContaining('Controlled cursor capture'),
      expect.anything()
    );
  }
);

it('negotiates the selected 60 FPS cap with the TAB source', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [createNativeTabTrack({ frameRate: VideoFrameRate.FPS60 })],
    id: 'tab-stream',
  });
  installMediaDevicesMocks({ getUserMedia });

  await acquireRecordingSourceStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...createControlledTabSettings(),
      controlledCursorCaptureEnabled: false,
      outputProfile: {
        ...createControlledTabSettings().outputProfile,
        frameRate: VideoFrameRate.FPS60,
      },
    },
    streamId: 'tab-stream-60fps',
    viewport: { devicePixelRatio: 2, height: 720, width: 1280 },
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: 'tab-stream-60fps',
        maxFrameRate: 60,
        maxHeight: 1440,
        maxWidth: 2560,
        minFrameRate: 60,
      },
    },
  });
});

it('requires the selected output frame rate from a camera-only source', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [],
    getVideoTracks: () => [],
    id: 'camera-stream',
  });
  installMediaDevicesMocks({ getUserMedia });

  await acquireRecordingSourceStream({
    captureMode: CaptureMode.CAMERA,
    settings: {
      ...createControlledTabSettings(),
      outputProfile: {
        ...createControlledTabSettings().outputProfile,
        frameRate: VideoFrameRate.FPS60,
      },
    },
    streamId: 'camera',
  });

  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: expect.objectContaining({ frameRate: { exact: 60 } }),
  });
});

it('normalizes an unsupported camera frame rate at the media boundary', async () => {
  const error = Object.assign(new DOMException('', 'OverconstrainedError'), {
    constraint: 'frameRate',
  });
  installMediaDevicesMocks({ getUserMedia: vi.fn().mockRejectedValue(error) });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.CAMERA,
      settings: {
        ...createControlledTabSettings(),
        outputProfile: {
          ...createControlledTabSettings().outputProfile,
          frameRate: VideoFrameRate.FPS60,
        },
      },
      streamId: 'camera',
    })
  ).rejects.toThrow('camera-frame-rate-unsupported');
});

it('does not renegotiate the TAB track after initial source acquisition', async () => {
  const track = createNativeTabTrack();
  vi.mocked(track.applyConstraints).mockRejectedValue(
    new DOMException('Unsupported', 'OverconstrainedError')
  );
  installMediaDevicesMocks({
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [track],
      getVideoTracks: () => [track],
      id: 'tab-stream',
    }),
  });

  await expect(
    acquireRecordingSourceStream({
      captureMode: CaptureMode.TAB,
      settings: { ...createControlledTabSettings(), controlledCursorCaptureEnabled: false },
      streamId: 'tab-stream-native-unsupported',
      viewport: { devicePixelRatio: 1, height: 1305, width: 2560 },
    })
  ).resolves.toEqual(expect.objectContaining({ stream: expect.anything() }));

  expect(track.applyConstraints).not.toHaveBeenCalled();
});

it('uses the same isolated source binding for system audio and video', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [createNativeTabTrack()],
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
        maxFrameRate: 30,
        minFrameRate: 30,
      },
    },
  });
});

it('does not copy video size constraints onto TAB system audio', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [createNativeTabTrack()],
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
        maxFrameRate: 30,
        maxHeight: 1350,
        maxWidth: 2160,
        minFrameRate: 30,
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
      getVideoTracks: () => [createNativeTabTrack({ cursor: 'always' })],
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
