import { beforeEach, expect, it, vi } from 'vitest';

const {
  announceCaptureSourceMock,
  browserTabsGetMock,
  ensureOffscreenDocumentReadyMock,
  getVideoCaptureModeCapabilityMock,
  prepareRecordingViewportContextMock,
  resolveCaptureSourceForModeMock,
  setVideoRecordingTabIdMock,
} = vi.hoisted(() => ({
  announceCaptureSourceMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  ensureOffscreenDocumentReadyMock: vi.fn(),
  getVideoCaptureModeCapabilityMock: vi.fn(),
  prepareRecordingViewportContextMock: vi.fn(),
  resolveCaptureSourceForModeMock: vi.fn(),
  setVideoRecordingTabIdMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../features/tab-capabilities/capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/tab-capabilities/capabilities')>()),
  getVideoCaptureModeCapability: getVideoCaptureModeCapabilityMock,
}));

vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  announceCaptureSource: announceCaptureSourceMock,
  resolveCaptureSourceForMode: resolveCaptureSourceForModeMock,
}));

vi.mock('./recording-context.viewport', () => ({
  prepareRecordingViewportContext: prepareRecordingViewportContextMock,
}));

vi.mock('./preflight.offscreen', () => ({
  ensureOffscreenDocumentReady: ensureOffscreenDocumentReadyMock,
}));

vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  setVideoRecordingTabId: setVideoRecordingTabIdMock,
}));
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { initializeRecordingContext } from './recording-context.prepare';

const viewportPreset = { height: 720, id: 'wide', label: 'Wide', width: 1280 };

function createSettings() {
  return {
    autoFadeDelay: 1500,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsGetMock.mockResolvedValue({ id: 42, url: 'https://example.test' });
  getVideoCaptureModeCapabilityMock.mockReturnValue({ reason: null, supported: true });
  resolveCaptureSourceForModeMock.mockResolvedValue({
    mode: CaptureMode.TAB,
    streamId: 'stream-1',
  });
  announceCaptureSourceMock.mockResolvedValue(undefined);
  ensureOffscreenDocumentReadyMock.mockResolvedValue(undefined);
  prepareRecordingViewportContextMock.mockResolvedValue({
    viewport: { height: 720, width: 1280 },
    viewportEmulationResult: undefined,
  });
});

it('assembles camera recording context without tab lookup or viewport setup', async () => {
  resolveCaptureSourceForModeMock.mockResolvedValue({
    mode: CaptureMode.CAMERA,
    streamId: 'camera',
  });

  await expect(
    initializeRecordingContext({
      captureMode: CaptureMode.CAMERA,
      settings: createSettings(),
      tabId: null,
    })
  ).resolves.toEqual({
    captureMode: CaptureMode.CAMERA,
    captureSource: { mode: CaptureMode.CAMERA, streamId: 'camera' },
    settings: createSettings(),
    tabId: null,
  });

  expect(browserTabsGetMock).not.toHaveBeenCalled();
  expect(getVideoCaptureModeCapabilityMock).not.toHaveBeenCalled();
  expect(ensureOffscreenDocumentReadyMock).toHaveBeenCalledWith('Recording camera video');
  expect(prepareRecordingViewportContextMock).not.toHaveBeenCalled();
  expect(setVideoRecordingTabIdMock).toHaveBeenCalledWith(null);
  expect(resolveCaptureSourceForModeMock).toHaveBeenCalledWith(
    null,
    null,
    CaptureMode.CAMERA,
    createSettings(),
    undefined
  );
});

it('throws the localized fallback when the capture mode is unsupported', () => {
  getVideoCaptureModeCapabilityMock.mockReturnValue({ reason: null, supported: false });

  return expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
    })
  ).rejects.toThrow('background.runtime.recordingUnavailable');
});

it('aborts before viewport setup when capture source resolution returns null', () => {
  resolveCaptureSourceForModeMock.mockResolvedValue(null);

  return expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
    })
  )
    .resolves.toBeNull()
    .then(() => {
      expect(setVideoRecordingTabIdMock).toHaveBeenCalledWith(42);
      expect(announceCaptureSourceMock).not.toHaveBeenCalled();
      expect(prepareRecordingViewportContextMock).not.toHaveBeenCalled();
    });
});

it('aborts when viewport context preparation returns null', () => {
  prepareRecordingViewportContextMock.mockResolvedValue(null);

  return expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
    })
  )
    .resolves.toBeNull()
    .then(() => {
      expect(setVideoRecordingTabIdMock).toHaveBeenCalledWith(42);
      expect(announceCaptureSourceMock).toHaveBeenCalledTimes(1);
    });
});

it('assembles the recording context for the happy path', () => {
  prepareRecordingViewportContextMock.mockResolvedValue({
    viewport: { height: 720, width: 1280 },
    viewportEmulationResult: {
      cssHeight: 720,
      cssWidth: 1280,
      scale: 1,
    },
  });

  return expect(
    initializeRecordingContext({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      settings: createSettings(),
      tabId: 42,
      viewportPreset,
    })
  ).resolves.toEqual({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    captureSource: { mode: CaptureMode.TAB, streamId: 'stream-1' },
    settings: createSettings(),
    tabId: 42,
    viewport: { height: 720, width: 1280 },
    viewportEmulationResult: {
      cssHeight: 720,
      cssWidth: 1280,
      scale: 1,
    },
    viewportPreset,
  });
});

it('assembles standard tab recording context without viewport emulation metadata', () => {
  return expect(
    initializeRecordingContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
    })
  ).resolves.toEqual({
    captureMode: CaptureMode.TAB,
    captureSource: { mode: CaptureMode.TAB, streamId: 'stream-1' },
    settings: createSettings(),
    tabId: 42,
    viewport: { height: 720, width: 1280 },
  });
});

it('forwards settings into capture-source resolution', async () => {
  const settings = {
    ...createSettings(),
    controlledCursorCaptureEnabled: true,
  };

  await initializeRecordingContext({
    captureMode: CaptureMode.SCREEN,
    settings,
    tabId: 42,
  });

  expect(resolveCaptureSourceForModeMock).toHaveBeenCalledWith(
    42,
    { id: 42, url: 'https://example.test' },
    CaptureMode.SCREEN,
    settings,
    undefined
  );
});
