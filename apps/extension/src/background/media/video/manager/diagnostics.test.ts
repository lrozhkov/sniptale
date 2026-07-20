import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startDiagnostics, supportsAnnotations, videoManagerSession } = vi.hoisted(() => ({
  startDiagnostics: vi.fn(),
  supportsAnnotations: vi.fn(),
  videoManagerSession: { currentRecordingId: 'recording-1' },
}));

vi.mock('../../../diagnostics/public/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../diagnostics/public/session')>()),
  startDiagnostics,
}));

vi.mock('../capture-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-source')>()),
  supportsAnnotations,
}));

vi.mock('./session', () => ({
  videoManagerSession,
}));
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { attemptDiagnosticsStart } from './diagnostics';

const settings: VideoRecordingSettings = {
  autoFadeDelay: 0,
  countdownSeconds: 3,
  diagnosticsEnabled: true,
  microphoneEnabled: false,
  microphoneDeviceId: null,
  openEditorAfterRecording: false,
  quality: VideoQuality.MEDIUM,
  systemAudioEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  supportsAnnotations.mockReturnValue(true);
  startDiagnostics.mockResolvedValue(undefined);
  videoManagerSession.currentRecordingId = 'recording-1';
});

describe('video manager diagnostics startup', () => {
  it('skips diagnostics when the mode is not eligible', verifyIneligibleModeSkip);
  it(
    'starts diagnostics when viewport emulation is active and supported',
    verifyViewportEmulationDiagnostics
  );
  it(
    'skips diagnostics when annotations are unsupported or viewport is missing',
    verifyUnsupportedDiagnosticsSkip
  );
  it('swallows diagnostics startup failures', verifyDiagnosticsStartupFailure);
});

async function verifyIneligibleModeSkip(): Promise<void> {
  await attemptDiagnosticsStart({
    captureMode: CaptureMode.TAB,
    settings,
    viewport: { width: 1280, height: 720 },
    tabId: 5,
  });

  expect(startDiagnostics).not.toHaveBeenCalled();
}

async function verifyViewportEmulationDiagnostics(): Promise<void> {
  await attemptDiagnosticsStart({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    settings,
    viewport: { width: 1440, height: 900 },
    tabId: 8,
  });

  expect(startDiagnostics).toHaveBeenCalledWith('recording-1', 8, {
    width: 1440,
    height: 900,
  });
}

async function verifyUnsupportedDiagnosticsSkip(): Promise<void> {
  supportsAnnotations.mockReturnValue(false);

  await attemptDiagnosticsStart({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    settings,
    viewport: { width: 1440, height: 900 },
    tabId: 8,
  });
  await attemptDiagnosticsStart({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    settings,
    tabId: 8,
  });
  await attemptDiagnosticsStart({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    settings,
    viewport: { width: 1440, height: 900 },
  });

  expect(startDiagnostics).not.toHaveBeenCalled();
}

async function verifyDiagnosticsStartupFailure(): Promise<void> {
  startDiagnostics.mockRejectedValueOnce(new Error('cdp failed'));

  await expect(
    attemptDiagnosticsStart({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      settings,
      viewport: { width: 1280, height: 720 },
      tabId: 12,
    })
  ).resolves.toBeUndefined();
}
