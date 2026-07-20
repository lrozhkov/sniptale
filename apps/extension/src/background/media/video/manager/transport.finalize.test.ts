import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CaptureMode,
  type CaptureSource,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

const {
  attemptDiagnosticsStartMock,
  loggerDebugMock,
  loggerErrorMock,
  notifyRecordingStartFailedMock,
  sendOffscreenStartRecordingMock,
  supportsSystemAudioMock,
  getVideoRecordingIdMock,
  getVideoRecordingTabIdMock,
} = vi.hoisted(() => ({
  attemptDiagnosticsStartMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  sendOffscreenStartRecordingMock: vi.fn(),
  supportsSystemAudioMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(() => 'recording-42'),
  getVideoRecordingTabIdMock: vi.fn(() => 12),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../runtime/manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager')>()),
  notifyRecordingStartFailed: notifyRecordingStartFailedMock,
}));

vi.mock('./diagnostics', () => ({
  attemptDiagnosticsStart: attemptDiagnosticsStartMock,
}));

vi.mock('./start-helpers', () => ({
  sendOffscreenStartRecording: sendOffscreenStartRecordingMock,
}));

vi.mock('../capture-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../capture-source')>();

  return {
    ...actual,
    supportsSystemAudio: supportsSystemAudioMock,
  };
});

vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  getVideoRecordingId: getVideoRecordingIdMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
}));

import { finalizeRecordingStart } from './transport.finalize';

function createSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: true,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  attemptDiagnosticsStartMock.mockResolvedValue(undefined);
  sendOffscreenStartRecordingMock.mockResolvedValue(undefined);
  supportsSystemAudioMock.mockReturnValue(true);
  getVideoRecordingIdMock.mockReturnValue('recording-42');
  getVideoRecordingTabIdMock.mockReturnValue(12);
});

function runTransportFinalizeUnsupportedAudioSuite() {
  it('finalizes recording start with system audio disabled for unsupported modes', async () => {
    const settings = createSettings();
    supportsSystemAudioMock.mockReturnValue(false);

    await finalizeRecordingStart({
      captureMode: CaptureMode.SCREEN,
      captureSource: { mode: CaptureMode.SCREEN, streamId: 'screen-1' } as never,
      settings,
      tabId: 12,
      viewport: {
        devicePixelRatio: 1,
        height: 720,
        scrollX: 0,
        scrollY: 0,
        width: 1280,
      },
    });

    expect(attemptDiagnosticsStartMock).toHaveBeenCalledWith({
      captureMode: CaptureMode.SCREEN,
      settings,
      tabId: 12,
      viewport: expect.any(Object),
    });
    expect(sendOffscreenStartRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentRecordingId: 'recording-42',
        recordingTabId: 12,
        settings: expect.objectContaining({
          systemAudioEnabled: false,
        }),
      })
    );
  });
}

function runTransportFinalizeSupportedAudioSuite() {
  it('keeps system audio enabled for supported capture modes', async () => {
    const settings = createSettings();

    await finalizeRecordingStart({
      captureMode: CaptureMode.TAB,
      captureSource: { mode: CaptureMode.TAB, streamId: 'tab-1' } as never,
      settings,
      tabId: 12,
      viewport: {
        devicePixelRatio: 1,
        height: 720,
        scrollX: 0,
        scrollY: 0,
        width: 1280,
      },
    });

    expect(sendOffscreenStartRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        settings,
      })
    );
  });

  it('disables system audio for multi-source screen capture', async () => {
    const settings = { ...createSettings(), sourceCount: 2 };

    await finalizeRecordingStart({
      captureMode: CaptureMode.SCREEN,
      captureSource: { mode: CaptureMode.SCREEN, streamId: 'desktop-multi' } as never,
      settings,
      tabId: 12,
      viewport: undefined,
    });

    expect(sendOffscreenStartRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          sourceCount: 2,
          systemAudioEnabled: false,
        }),
      })
    );
  });
}

function runTransportFinalizeCameraSuite() {
  it('sends camera starts without a recording tab id', async () => {
    const settings = createSettings();
    const captureSource: CaptureSource = { mode: CaptureMode.CAMERA, streamId: 'camera' };

    await finalizeRecordingStart({
      captureMode: CaptureMode.CAMERA,
      captureSource,
      settings,
      tabId: null,
      shouldAbortBeforeOffscreenStart: () => false,
    });

    expect(attemptDiagnosticsStartMock).toHaveBeenCalledWith({
      captureMode: CaptureMode.CAMERA,
      settings,
    });
    expect(sendOffscreenStartRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingTabId: null,
      })
    );
  });

  it('marks offscreen dispatch before invoking the start transport', async () => {
    const onBeforeOffscreenStartDispatch = vi.fn();

    await finalizeRecordingStart({
      captureMode: CaptureMode.CAMERA,
      captureSource: { mode: CaptureMode.CAMERA, streamId: 'camera' },
      onBeforeOffscreenStartDispatch,
      settings: createSettings(),
      tabId: null,
    });

    expect(onBeforeOffscreenStartDispatch).toHaveBeenCalledOnce();
    expect(onBeforeOffscreenStartDispatch.mock.invocationCallOrder[0]).toBeLessThan(
      sendOffscreenStartRecordingMock.mock.invocationCallOrder[0] ?? 0
    );
  });
}

function runTransportFinalizeViewportSuite() {
  it('preserves viewport-emulation payloads and surfaces offscreen start failures', async () => {
    sendOffscreenStartRecordingMock.mockRejectedValueOnce(new Error('offscreen failed'));

    await expect(
      finalizeRecordingStart({
        captureMode: CaptureMode.VIEWPORT_EMULATION,
        captureSource: { mode: CaptureMode.VIEWPORT_EMULATION, streamId: 'stream-2' } as never,
        settings: createSettings(),
        tabId: 12,
        viewport: undefined,
        viewportEmulationResult: {
          cssHeight: 720,
          cssWidth: 1280,
          scale: 1,
        },
        viewportPreset: {
          id: 'wide',
          label: 'Wide',
          width: 1280,
          height: 720,
        },
      })
    ).rejects.toThrow('offscreen failed');

    expect(sendOffscreenStartRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        viewportEmulationResult: {
          cssHeight: 720,
          cssWidth: 1280,
          scale: 1,
        },
        viewportPreset: {
          id: 'wide',
          label: 'Wide',
          width: 1280,
          height: 720,
        },
      })
    );
    expect(notifyRecordingStartFailedMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
}

describe(
  'video-manager transport finalize unsupported audio handling',
  runTransportFinalizeUnsupportedAudioSuite
);
describe(
  'video-manager transport finalize supported audio handling',
  runTransportFinalizeSupportedAudioSuite
);
describe('video-manager transport finalize camera handling', runTransportFinalizeCameraSuite);
describe('video-manager transport finalize viewport handling', runTransportFinalizeViewportSuite);
