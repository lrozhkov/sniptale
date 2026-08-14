import { beforeEach, expect, it, vi } from 'vitest';

const {
  announceCaptureSourceMock,
  browserTabsGetMock,
  prepareContentSurfaceOrAbortMock,
  enableViewportCursorProjectionOrAbortMock,
  ensureOffscreenDocumentReadyMock,
  ensureOffscreenDocumentReadyOrAbortMock,
  getVideoCaptureModeCapabilityMock,
  prepareVideoCaptureSurfaceMock,
  readLiveViewportMock,
  resolveCaptureSourceForModeMock,
  setVideoRecordingTabIdMock,
} = vi.hoisted(() => ({
  announceCaptureSourceMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  prepareContentSurfaceOrAbortMock: vi.fn(),
  enableViewportCursorProjectionOrAbortMock: vi.fn(),
  ensureOffscreenDocumentReadyMock: vi.fn(),
  ensureOffscreenDocumentReadyOrAbortMock: vi.fn(),
  getVideoCaptureModeCapabilityMock: vi.fn(),
  prepareVideoCaptureSurfaceMock: vi.fn(),
  readLiveViewportMock: vi.fn(),
  resolveCaptureSourceForModeMock: vi.fn(),
  setVideoRecordingTabIdMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: { get: browserTabsGetMock } }));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../../../features/tab-capabilities/capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/tab-capabilities/capabilities')>()),
  getVideoCaptureModeCapability: getVideoCaptureModeCapabilityMock,
}));
vi.mock('../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-surface')>()),
  acquireVideoCaptureSurface: prepareVideoCaptureSurfaceMock,
}));
vi.mock('../capture-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-viewport')>()),
  readTabCaptureViewport: readLiveViewportMock,
}));
vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  announceCaptureSource: announceCaptureSourceMock,
  resolveCaptureSourceForMode: resolveCaptureSourceForModeMock,
}));
vi.mock('./transport.resolve', () => ({
  prepareContentSurfaceOrAbort: prepareContentSurfaceOrAbortMock,
  enableViewportCursorProjectionOrAbort: enableViewportCursorProjectionOrAbortMock,
  ensureOffscreenDocumentReadyOrAbort: ensureOffscreenDocumentReadyOrAbortMock,
}));
vi.mock('./preflight.offscreen', () => ({
  ensureOffscreenDocumentReady: ensureOffscreenDocumentReadyMock,
}));
vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  getVideoRecordingId: () => 'recording-1',
  setVideoRecordingTabId: setVideoRecordingTabIdMock,
}));

import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { initializeRecordingContext } from './recording-context.prepare';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

function createSettings() {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 1500,
    countdownSeconds: 3,
    interactionDiagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsGetMock.mockResolvedValue({ id: 42, url: 'https://example.test' });
  getVideoCaptureModeCapabilityMock.mockReturnValue({ reason: null, supported: true });
  prepareVideoCaptureSurfaceMock.mockResolvedValue(null);
  ensureOffscreenDocumentReadyOrAbortMock.mockResolvedValue(true);
  prepareContentSurfaceOrAbortMock.mockResolvedValue(undefined);
  enableViewportCursorProjectionOrAbortMock.mockResolvedValue(true);
  readLiveViewportMock.mockResolvedValue({
    devicePixelRatio: 2,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    viewportOffsetX: 0,
    viewportOffsetY: 0,
    visualViewportScale: 1,
    width: 1280,
  });
  resolveCaptureSourceForModeMock.mockResolvedValue({
    mode: CaptureMode.TAB,
    streamId: 'stream-1',
  });
});

it('assembles camera context without a preset or tab surface', async () => {
  resolveCaptureSourceForModeMock.mockResolvedValue({
    mode: CaptureMode.CAMERA,
    streamId: 'camera',
  });

  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.CAMERA,
      settings: createSettings(),
      tabId: null,
      viewportPresetId: null,
    })
  ).resolves.toEqual({
    captureMode: CaptureMode.CAMERA,
    captureSource: { mode: CaptureMode.CAMERA, streamId: 'camera' },
    generation: 1,
    settings: createSettings(),
    surface: null,
    tabId: null,
    viewportPresetId: null,
  });
  expect(prepareVideoCaptureSurfaceMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.CAMERA,
    presetId: null,
    recordingId: 'recording-1',
    tabId: null,
  });
});

it('rejects presets for camera recording', async () => {
  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.CAMERA,
      settings: createSettings(),
      tabId: null,
      viewportPresetId: 'preset-1',
    })
  ).rejects.toThrow('Viewport presets are unavailable for camera recording');
});

it('returns null when camera source selection is cancelled', async () => {
  resolveCaptureSourceForModeMock.mockResolvedValue(null);
  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.CAMERA,
      settings: createSettings(),
      tabId: null,
      viewportPresetId: null,
    })
  ).resolves.toBeNull();
});

it('applies the final surface before acquiring the tab stream', async () => {
  const surface = {
    presetId: 'preset-1',
    target: 'window' as const,
    width: 1280,
    height: 720,
    sessionId: 'recording-1',
    leaseId: 'lease-1',
    generation: 1,
  };
  prepareVideoCaptureSurfaceMock.mockResolvedValue(surface);

  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
      viewportPresetId: 'preset-1',
    })
  ).resolves.toEqual(expect.objectContaining({ surface, viewportPresetId: 'preset-1', tabId: 42 }));
  expect(prepareVideoCaptureSurfaceMock.mock.invocationCallOrder[0]).toBeLessThan(
    resolveCaptureSourceForModeMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
  expect(announceCaptureSourceMock).toHaveBeenCalledWith(
    { mode: CaptureMode.TAB, streamId: 'stream-1' },
    CaptureMode.TAB,
    'preset-1'
  );
});

it('fails before mutation when the capture mode is unsupported', async () => {
  getVideoCaptureModeCapabilityMock.mockReturnValue({ reason: null, supported: false });
  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
      viewportPresetId: null,
    })
  ).rejects.toThrow('background.runtime.recordingUnavailable');
  expect(prepareVideoCaptureSurfaceMock).not.toHaveBeenCalled();
});

it('rejects a TAB_CROP selection when its atomic viewport no longer matches the live tab', async () => {
  resolveCaptureSourceForModeMock.mockResolvedValueOnce({
    captureViewport: {
      devicePixelRatio: 2,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      visualViewportScale: 1,
      width: 1280,
    },
    cropRegion: { height: 300, width: 300, x: 10, y: 20 },
    mode: CaptureMode.TAB_CROP,
    streamId: 'stream-crop',
  });
  readLiveViewportMock.mockResolvedValueOnce({
    devicePixelRatio: 2,
    height: 768,
    scrollX: 0,
    scrollY: 0,
    visualViewportScale: 1,
    width: 1024,
  });

  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB_CROP,
      settings: createSettings(),
      tabId: 42,
      viewportPresetId: null,
    })
  ).rejects.toThrow('viewport changed after the recording area was selected');
  expect(announceCaptureSourceMock).not.toHaveBeenCalled();
});

it('uses the capability reason and rejects a missing tab id', async () => {
  getVideoCaptureModeCapabilityMock.mockReturnValue({ reason: 'Protected page', supported: false });
  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
      viewportPresetId: null,
    })
  ).rejects.toThrow('Protected page');

  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: null,
      viewportPresetId: null,
    })
  ).rejects.toThrow('No tab ID');
});

it('fails closed when offscreen, annotation, or source preparation is cancelled', async () => {
  ensureOffscreenDocumentReadyOrAbortMock.mockResolvedValueOnce(false);
  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
      viewportPresetId: null,
    })
  ).resolves.toBeNull();

  prepareContentSurfaceOrAbortMock.mockResolvedValueOnce(null);
  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
      viewportPresetId: null,
    })
  ).resolves.toBeNull();

  resolveCaptureSourceForModeMock.mockResolvedValueOnce(null);
  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
      viewportPresetId: null,
    })
  ).resolves.toBeNull();
});
