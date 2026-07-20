import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  beginVideoRecordingPreparationMock,
  clearActiveVideoRecordingLeaseMock,
  clearRecordingStartActivationWatchdogMock,
  finalizeRecordingStartMock,
  initializeRecordingContextMock,
  hasActiveVideoRecordingTabMock,
  issueActiveVideoRecordingLeaseMock,
  isStartCancelledMock,
  isVideoRecordingPreparationInProgressMock,
  notifyRecordingStartFailedMock,
  runCountdownMock,
  scheduleRecordingStartActivationWatchdogMock,
  sendRuntimeMessageMock,
  setOpenEditorAfterRecordingMock,
  setVideoRecordingIdMock,
} = vi.hoisted(() => ({
  beginVideoRecordingPreparationMock: vi.fn(),
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  clearRecordingStartActivationWatchdogMock: vi.fn(),
  finalizeRecordingStartMock: vi.fn(),
  initializeRecordingContextMock: vi.fn(),
  hasActiveVideoRecordingTabMock: vi.fn(),
  issueActiveVideoRecordingLeaseMock: vi.fn(),
  isStartCancelledMock: vi.fn(),
  isVideoRecordingPreparationInProgressMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  runCountdownMock: vi.fn(),
  scheduleRecordingStartActivationWatchdogMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setOpenEditorAfterRecordingMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../runtime/manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager')>()),
  notifyRecordingStartFailed: notifyRecordingStartFailedMock,
}));
vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  beginVideoRecordingPreparation: beginVideoRecordingPreparationMock,
  hasActiveVideoRecordingTab: hasActiveVideoRecordingTabMock,
  isVideoRecordingPreparationInProgress: isVideoRecordingPreparationInProgressMock,
  setOpenEditorAfterRecording: setOpenEditorAfterRecordingMock,
  setVideoRecordingId: setVideoRecordingIdMock,
}));
vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  issueActiveVideoRecordingLease: issueActiveVideoRecordingLeaseMock,
}));
vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  finalizeRecordingStart: finalizeRecordingStartMock,
  isStartCancelled: isStartCancelledMock,
  runCountdown: runCountdownMock,
}));
vi.mock('./recording-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./recording-context')>()),
  initializeRecordingContext: initializeRecordingContextMock,
}));
vi.mock('./start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: clearRecordingStartActivationWatchdogMock,
  scheduleRecordingStartActivationWatchdog: scheduleRecordingStartActivationWatchdogMock,
}));
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { RECORDING_START_DELIVERY_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { startRecording } from './start';
import { reserveMediaErasureExclusion } from '../../lifecycle-gate';

const settings = {
  microphoneEnabled: false,
  microphoneDeviceId: null,
  systemAudioEnabled: true,
  quality: VideoQuality.HIGH,
  countdownSeconds: 3,
  autoFadeDelay: 1500,
  openEditorAfterRecording: false,
  diagnosticsEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'recording-1') });
  clearActiveVideoRecordingLeaseMock.mockResolvedValue(undefined);
  hasActiveVideoRecordingTabMock.mockReturnValue(false);
  isStartCancelledMock.mockReturnValue(false);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  runCountdownMock.mockResolvedValue(true);
  finalizeRecordingStartMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  initializeRecordingContextMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    captureSource: { mode: CaptureMode.TAB, streamId: 'stream-1' },
    settings,
    tabId: 17,
    viewport: null,
  });
  issueActiveVideoRecordingLeaseMock.mockResolvedValue({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function waitForMockCall(mock: ReturnType<typeof vi.fn>): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    if (mock.mock.calls.length > 0) {
      return;
    }
    await Promise.resolve();
  }
}

it('fails closed before preparation when no recording owner sender is provided', async () => {
  await expect(startRecording(17, settings)).resolves.toEqual({
    error: 'Unauthorized recording control sender',
    result: 'failed',
  });

  expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
  expect(initializeRecordingContextMock).not.toHaveBeenCalled();
});

it('issues an owner-bound control lease before accepting a recording start', async () => {
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
    result: 'accepted',
  });

  expect(setVideoRecordingIdMock).toHaveBeenCalledWith('recording-1');
  expect(scheduleRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('recording-1');
  expect(issueActiveVideoRecordingLeaseMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    openEditorAfterRecording: false,
    ownerSenderUrl,
  });
  expect(finalizeRecordingStartMock).toHaveBeenCalledTimes(1);
  expect(finalizeRecordingStartMock.mock.invocationCallOrder[0]).toBeLessThan(
    scheduleRecordingStartActivationWatchdogMock.mock.invocationCallOrder[0] ?? 0
  );
});

it('fails visibly before preparation while local data erasure owns media lifecycle', async () => {
  let releaseErasure!: () => void;
  const erasureGate = new Promise<void>((resolve) => {
    releaseErasure = resolve;
  });
  const exclusion = reserveMediaErasureExclusion();
  const erasure = erasureGate.finally(() => exclusion.release());
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    error: 'Local data erasure is in progress',
    result: 'failed',
  });
  expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();

  releaseErasure();
  await erasure;
});

it('does not arm the activation watchdog until offscreen start delivery is accepted', async () => {
  let acceptOffscreenStart!: () => void;
  const offscreenStartDelivery = new Promise<void>((resolve) => {
    acceptOffscreenStart = resolve;
  });
  finalizeRecordingStartMock.mockReturnValueOnce(offscreenStartDelivery);
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  const start = startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl);
  await waitForMockCall(finalizeRecordingStartMock);

  expect(issueActiveVideoRecordingLeaseMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    openEditorAfterRecording: false,
    ownerSenderUrl,
  });
  expect(finalizeRecordingStartMock).toHaveBeenCalledTimes(1);
  expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
  acceptOffscreenStart();
  await start;
});

it('fails before offscreen start when recording control lease cannot be issued', async () => {
  issueActiveVideoRecordingLeaseMock.mockResolvedValueOnce(null);
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    error: 'Failed to issue recording control capability',
    result: 'failed',
  });

  expect(finalizeRecordingStartMock).not.toHaveBeenCalled();
  expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(
    'Failed to issue recording control capability'
  );
});

it('keeps the start failure visible when delivery cleanup effects reject', async () => {
  finalizeRecordingStartMock.mockRejectedValueOnce(new Error('offscreen failed'));
  clearActiveVideoRecordingLeaseMock.mockRejectedValueOnce(new Error('lease cleanup failed'));
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('offscreen cleanup failed'));
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({ error: 'offscreen failed', result: 'failed' });

  expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
  expect(clearRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('recording-1');
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('recording-1');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      capabilityToken: expect.any(String),
      discard: true,
    })
  );
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('offscreen failed');
});

it('rolls back and cleans up when offscreen start delivery never accepts', async () => {
  vi.useFakeTimers();
  finalizeRecordingStartMock.mockReturnValueOnce(new Promise<void>(() => undefined));
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  try {
    const resultPromise = startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl);
    await waitForMockCall(finalizeRecordingStartMock);

    expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RECORDING_START_DELIVERY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result).toEqual({ error: expect.any(String), result: 'failed' });
    expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
    expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('recording-1');
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
        capabilityToken: expect.any(String),
        discard: true,
      })
    );
    expect(result.result).toBe('failed');
    if (result.result !== 'failed') {
      throw new Error('Expected recording start to fail after delivery timeout');
    }
    expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(result.error);
  } finally {
    vi.useRealTimers();
  }
});

it('stringifies non-Error preparation failures before notifying the runtime', async () => {
  initializeRecordingContextMock.mockRejectedValue('capture blocked');
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl);

  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('capture blocked');
});
