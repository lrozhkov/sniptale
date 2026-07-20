import { expect, it, vi } from 'vitest';

const {
  buildViewportEmulationResultMock,
  enableAnnotationsOrAbortMock,
  ensureOffscreenDocumentReadyOrAbortMock,
  getVideoRecordingIdMock,
} = vi.hoisted(() => ({
  buildViewportEmulationResultMock: vi.fn(),
  enableAnnotationsOrAbortMock: vi.fn(),
  ensureOffscreenDocumentReadyOrAbortMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
}));

vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  buildViewportEmulationResult: buildViewportEmulationResultMock,
  enableAnnotationsOrAbort: enableAnnotationsOrAbortMock,
  ensureOffscreenDocumentReadyOrAbort: ensureOffscreenDocumentReadyOrAbortMock,
}));

vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  getVideoRecordingId: getVideoRecordingIdMock,
}));
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import {
  normalizeViewportPreset,
  prepareRecordingViewportContext,
} from './recording-context.viewport';

const viewportPreset = { height: 720, id: 'wide', label: 'Wide', width: 1280 };

function createSettings() {
  return {
    autoFadeDelay: 1500,
    controlledCursorCaptureEnabled: false,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  };
}

it('normalizes viewport presets only for viewport emulation mode', () => {
  expect(normalizeViewportPreset(CaptureMode.TAB, viewportPreset)).toBeUndefined();
  expect(normalizeViewportPreset(CaptureMode.VIEWPORT_EMULATION, viewportPreset)).toEqual(
    viewportPreset
  );
});

it('aborts when annotation setup returns null viewport info', async () => {
  getVideoRecordingIdMock.mockReturnValue(null);
  ensureOffscreenDocumentReadyOrAbortMock.mockResolvedValue(true);
  enableAnnotationsOrAbortMock.mockResolvedValue(null);

  await expect(
    prepareRecordingViewportContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
    })
  ).resolves.toBeNull();

  expect(ensureOffscreenDocumentReadyOrAbortMock).toHaveBeenCalledWith(
    'Recording tab video',
    42,
    CaptureMode.TAB
  );
  expect(buildViewportEmulationResultMock).not.toHaveBeenCalled();
});

it('aborts after offscreen setup failure and skips viewport emulation assembly', async () => {
  getVideoRecordingIdMock.mockReturnValue(null);
  enableAnnotationsOrAbortMock.mockResolvedValue({ height: 720, width: 1280 });
  ensureOffscreenDocumentReadyOrAbortMock.mockResolvedValue(false);

  await expect(
    prepareRecordingViewportContext({
      captureMode: CaptureMode.TAB,
      settings: createSettings(),
      tabId: 42,
    })
  ).resolves.toBeNull();

  expect(buildViewportEmulationResultMock).not.toHaveBeenCalled();
});

it('aborts when viewport emulation result assembly returns null', async () => {
  getVideoRecordingIdMock.mockReturnValue(null);
  enableAnnotationsOrAbortMock.mockResolvedValue({ height: 720, width: 1280 });
  ensureOffscreenDocumentReadyOrAbortMock.mockResolvedValue(true);
  buildViewportEmulationResultMock.mockResolvedValue(null);

  await expect(
    prepareRecordingViewportContext({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      settings: createSettings(),
      tabId: 42,
      viewportPreset,
    })
  ).resolves.toBeNull();
});

it('assembles viewport context for the happy path', async () => {
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  enableAnnotationsOrAbortMock.mockResolvedValue({ height: 720, width: 1280 });
  ensureOffscreenDocumentReadyOrAbortMock.mockResolvedValue(true);
  buildViewportEmulationResultMock.mockResolvedValue({
    cssHeight: 720,
    cssWidth: 1280,
    scale: 1,
  });

  await expect(
    prepareRecordingViewportContext({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      settings: createSettings(),
      tabId: 42,
      viewportPreset,
    })
  ).resolves.toEqual({
    viewport: { height: 720, width: 1280 },
    viewportEmulationResult: {
      cssHeight: 720,
      cssWidth: 1280,
      scale: 1,
    },
  });

  expect(enableAnnotationsOrAbortMock).toHaveBeenCalledWith(
    42,
    CaptureMode.VIEWPORT_EMULATION,
    createSettings(),
    'recording-1'
  );
  expect(ensureOffscreenDocumentReadyOrAbortMock.mock.invocationCallOrder[0]).toBeLessThan(
    enableAnnotationsOrAbortMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
});
