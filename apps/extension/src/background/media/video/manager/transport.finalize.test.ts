import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

const {
  attemptDiagnosticsStartMock,
  cancelVideoSourceReadyWaitMock,
  isStartCancelledMock,
  markOffscreenStartDispatchedMock,
  sendOffscreenStartRecordingMock,
  supportsSystemAudioMock,
  waitForVideoSourceReadyMock,
} = vi.hoisted(() => ({
  attemptDiagnosticsStartMock: vi.fn(),
  cancelVideoSourceReadyWaitMock: vi.fn(),
  isStartCancelledMock: vi.fn(),
  markOffscreenStartDispatchedMock: vi.fn(),
  sendOffscreenStartRecordingMock: vi.fn(),
  supportsSystemAudioMock: vi.fn(),
  waitForVideoSourceReadyMock: vi.fn(),
}));

vi.mock('./diagnostics', () => ({ attemptDiagnosticsStart: attemptDiagnosticsStartMock }));
vi.mock('./flow-cancellation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow-cancellation')>()),
  isVideoRecordingStartCancelled: isStartCancelledMock,
}));
vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  markVideoRecordingOffscreenStartDispatched: markOffscreenStartDispatchedMock,
}));
vi.mock('./start-helpers', () => ({
  sendOffscreenBeginRecording: vi.fn(),
  sendOffscreenStartRecording: sendOffscreenStartRecordingMock,
}));
vi.mock('../capture-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-source')>()),
  supportsSystemAudio: supportsSystemAudioMock,
}));
vi.mock('../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-surface')>()),
  cancelVideoSourceReadyWait: cancelVideoSourceReadyWaitMock,
  waitForVideoSourceReady: waitForVideoSourceReadyMock,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn() }),
}));

import { finalizeRecordingStart } from './transport.finalize';

const settings = {
  autoFadeDelay: 0,
  countdownSeconds: 3,
  diagnosticsEnabled: true,
  microphoneDeviceId: null,
  microphoneEnabled: true,
  openEditorAfterRecording: false,
  quality: VideoQuality.HIGH,
  systemAudioEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  supportsSystemAudioMock.mockReturnValue(true);
  isStartCancelledMock.mockReturnValue(false);
  waitForVideoSourceReadyMock.mockResolvedValue('stream-instance-1');
});

it('does not dispatch a source after cancellation wins during diagnostics', async () => {
  attemptDiagnosticsStartMock.mockImplementationOnce(async () => {
    isStartCancelledMock.mockReturnValue(true);
  });

  await expect(
    finalizeRecordingStart({
      captureMode: CaptureMode.TAB,
      captureSource: { mode: CaptureMode.TAB, streamId: 'tab-1' },
      generation: 1,
      recordingId: 'recording-42',
      streamInstanceId: 'stream-instance-1',
      settings,
      surface: null,
      tabId: 12,
    })
  ).rejects.toThrow('Recording start was cancelled before source dispatch');

  expect(markOffscreenStartDispatchedMock.mock.invocationCallOrder[0]).toBeLessThan(
    attemptDiagnosticsStartMock.mock.invocationCallOrder[0]!
  );
  expect(sendOffscreenStartRecordingMock).not.toHaveBeenCalled();
});

it('dispatches exact surface metadata and waits for source validation', async () => {
  const surface = {
    presetId: 'preset-1',
    target: 'viewport' as const,
    width: 1280,
    height: 720,
    sessionId: 'recording-42',
    leaseId: 'lease-1',
    generation: 2,
  };
  await expect(
    finalizeRecordingStart({
      captureMode: CaptureMode.TAB,
      captureSource: { mode: CaptureMode.TAB, streamId: 'tab-1' },
      generation: 2,
      recordingId: 'recording-42',
      streamInstanceId: 'stream-instance-1',
      settings,
      surface,
      tabId: 12,
    })
  ).resolves.toBe('stream-instance-1');
  expect(waitForVideoSourceReadyMock).toHaveBeenCalledWith({
    expectedStreamInstanceId: 'stream-instance-1',
    expectedViewport: null,
    recordingId: 'recording-42',
    tabId: 12,
  });
  expect(sendOffscreenStartRecordingMock).toHaveBeenCalledWith(
    expect.objectContaining({ generation: 2, recordingId: 'recording-42', surface })
  );
});

it('uses the natural source and disables unsupported system audio', async () => {
  supportsSystemAudioMock.mockReturnValue(false);
  await finalizeRecordingStart({
    captureMode: CaptureMode.SCREEN,
    captureSource: { mode: CaptureMode.SCREEN, streamId: 'screen-1' },
    generation: 1,
    recordingId: 'recording-42',
    streamInstanceId: 'stream-instance-1',
    settings,
    surface: null,
    tabId: 12,
  });
  expect(sendOffscreenStartRecordingMock).toHaveBeenCalledWith(
    expect.objectContaining({ settings: expect.objectContaining({ systemAudioEnabled: false }) })
  );
});

it('does not wait for a single-source handshake in multi-source screen mode', async () => {
  await expect(
    finalizeRecordingStart({
      captureMode: CaptureMode.SCREEN,
      captureSource: { mode: CaptureMode.SCREEN, streamId: 'screen-1' },
      generation: 1,
      recordingId: 'recording-42',
      streamInstanceId: 'stream-instance-1',
      settings: { ...settings, sourceCount: 2 },
      surface: null,
      tabId: 12,
    })
  ).resolves.toBe('stream-instance-1');
  expect(waitForVideoSourceReadyMock).not.toHaveBeenCalled();
});

it('settles source validation when offscreen start delivery rejects', async () => {
  let rejectReady!: (reason: unknown) => void;
  waitForVideoSourceReadyMock.mockReturnValueOnce(
    new Promise<string>((_resolve, reject) => {
      rejectReady = reject;
    })
  );
  cancelVideoSourceReadyWaitMock.mockImplementationOnce((_recordingId: string, reason: unknown) =>
    rejectReady(reason)
  );
  sendOffscreenStartRecordingMock.mockRejectedValueOnce(new Error('offscreen unavailable'));

  await expect(
    finalizeRecordingStart({
      captureMode: CaptureMode.TAB,
      captureSource: { mode: CaptureMode.TAB, streamId: 'tab-1' },
      generation: 1,
      recordingId: 'recording-42',
      streamInstanceId: 'stream-instance-1',
      settings,
      surface: null,
      tabId: 12,
    })
  ).rejects.toThrow('offscreen unavailable');
  expect(cancelVideoSourceReadyWaitMock).toHaveBeenCalledWith(
    'recording-42',
    expect.objectContaining({ message: 'offscreen unavailable' })
  );
});
