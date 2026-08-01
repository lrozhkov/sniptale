import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const {
  beginVideoRecordingStopMock,
  finishVideoRecordingStopMock,
  getVideoRecordingRuntimeStateMock,
  logger,
  resetCompletedVideoRecordingSessionMock,
  resetVideoRecordingRuntimeStateMock,
  restoreVideoRecordingOffscreenStartPendingMock,
  runStopSideEffectsMock,
  sendRuntimeMessageMock,
  setVideoRecordingRuntimeStateMock,
  shouldSkipStopMock,
  getVideoRecordingCountdownSessionIdMock,
  hasActiveVideoRecordingSessionMock,
  isVideoRecordingPreparationInProgressMock,
  isVideoRecordingStopInProgressMock,
  getVideoRecordingIdMock,
  releaseVideoCaptureSurfaceMock,
  getVideoSurfaceSessionMock,
  clearActiveVideoRecordingLeaseMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  readStoredVideoPostRecordResultMock,
} = vi.hoisted(() => ({
  beginVideoRecordingStopMock: vi.fn(),
  finishVideoRecordingStopMock: vi.fn(),
  getVideoRecordingRuntimeStateMock: vi.fn(),
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
  resetCompletedVideoRecordingSessionMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  restoreVideoRecordingOffscreenStartPendingMock: vi.fn(),
  runStopSideEffectsMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
  shouldSkipStopMock: vi.fn(),
  getVideoRecordingCountdownSessionIdMock: vi.fn(),
  hasActiveVideoRecordingSessionMock: vi.fn(),
  isVideoRecordingPreparationInProgressMock: vi.fn(),
  isVideoRecordingStopInProgressMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  releaseVideoCaptureSurfaceMock: vi.fn(),
  getVideoSurfaceSessionMock: vi.fn(),
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  readStoredVideoPostRecordResultMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => logger,
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../session-state', () => ({
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  beginVideoRecordingStop: beginVideoRecordingStopMock,
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  getVideoRecordingCountdownSessionId: getVideoRecordingCountdownSessionIdMock,
  hasActiveVideoRecordingSession: hasActiveVideoRecordingSessionMock,
  isVideoRecordingPreparationInProgress: isVideoRecordingPreparationInProgressMock,
  isVideoRecordingStopInProgress: isVideoRecordingStopInProgressMock,
  isCurrentVideoRecordingId: (recordingId: string | null | undefined) =>
    recordingId != null && getVideoRecordingIdMock() === recordingId,
  resetCompletedVideoRecordingSession: resetCompletedVideoRecordingSessionMock,
  restoreVideoRecordingOffscreenStartPending: restoreVideoRecordingOffscreenStartPendingMock,
  getVideoRecordingId: getVideoRecordingIdMock,
}));
vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  getVideoSurfaceSession: getVideoSurfaceSessionMock,
  releaseVideoCaptureSurface: releaseVideoCaptureSurfaceMock,
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  ensureActiveVideoRecordingLeaseHydrated: ensureActiveVideoRecordingLeaseHydratedMock,
}));
vi.mock('../../../../../storage/video/post-record-result', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../storage/video/post-record-result')>()),
  readStoredVideoPostRecordResult: readStoredVideoPostRecordResultMock,
}));

vi.mock('./effects', () => ({
  quiesceViewportEmulationForPrivacyErasure: vi.fn(),
  runStopSideEffects: runStopSideEffectsMock,
  waitForStopSideEffects: vi.fn(),
}));

vi.mock('./guard', () => ({
  shouldSkipStop: shouldSkipStopMock,
}));

import { cancelRecordingStart, OVERLAY_RESTORE_RETRY_DELAYS_MS, stopRecording } from './flow';

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    status: VideoRecordingStatus.RECORDING,
    countdownEndsAt: null,
    error: null,
  });
  sendRuntimeMessageMock.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  shouldSkipStopMock.mockReturnValue(false);
  getVideoRecordingCountdownSessionIdMock.mockReturnValue(null);
  hasActiveVideoRecordingSessionMock.mockReturnValue(true);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  isVideoRecordingStopInProgressMock.mockReturnValue(false);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  getVideoSurfaceSessionMock.mockReturnValue({
    generation: 2,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  });
  clearActiveVideoRecordingLeaseMock.mockResolvedValue(undefined);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  readStoredVideoPostRecordResultMock.mockResolvedValue(null);
  releaseVideoCaptureSurfaceMock.mockResolvedValue(undefined);
});

it('ignores duplicate stop requests', async () => {
  isVideoRecordingStopInProgressMock.mockReturnValue(true);

  await expect(stopRecording()).resolves.toEqual({ result: 'already-stopping' });

  expect(beginVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(runStopSideEffectsMock).not.toHaveBeenCalled();
});

it('resets immediately when stop is requested before the recorder is active', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: true,
    tabId: 7,
  });

  await expect(stopRecording()).resolves.toEqual({ result: 'cancelled-before-active' });

  expect(runStopSideEffectsMock).toHaveBeenCalledWith({
    mode: CaptureMode.TAB,
    shouldResetImmediately: true,
    tabId: 7,
  });
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledOnce();
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('recording-1');
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
  });
});

it('keeps early-stop recording authority when surface restoration fails', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: true,
    tabId: 7,
  });
  releaseVideoCaptureSurfaceMock.mockRejectedValueOnce(new Error('restore-conflict'));

  await expect(stopRecording()).resolves.toEqual({
    error: 'restore-conflict',
    result: 'failed',
  });

  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
});

it('keeps the countdown surface until the exact bound STOP is acknowledged', async () => {
  let acknowledgeStop!: (value: { success: true; result: 'accepted' }) => void;
  sendRuntimeMessageMock.mockReturnValueOnce(
    new Promise((resolve) => {
      acknowledgeStop = resolve;
    })
  );
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    status: VideoRecordingStatus.COUNTDOWN,
    countdownEndsAt: 12_000,
    error: null,
  });
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 7,
  });

  const stop = stopRecording(true);
  await vi.waitFor(() => expect(sendRuntimeMessageMock).toHaveBeenCalledOnce());
  expect(releaseVideoCaptureSurfaceMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();

  acknowledgeStop({ success: true, result: 'accepted' });
  await expect(stop).resolves.toEqual({ result: 'accepted' });

  expect(sendRuntimeMessageMock.mock.invocationCallOrder[0]).toBeLessThan(
    releaseVideoCaptureSurfaceMock.mock.invocationCallOrder[0]!
  );
});

it('cancels a pending recording start without notifying offscreen', async () => {
  hasActiveVideoRecordingSessionMock.mockReturnValue(false);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(true);
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: true,
    tabId: 7,
  });

  await expect(cancelRecordingStart()).resolves.toEqual({ result: 'cancelled-before-active' });

  expect(runStopSideEffectsMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledOnce();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('does not cancel an already-active recording without a control lease', async () => {
  hasActiveVideoRecordingSessionMock.mockReturnValue(true);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  getVideoRecordingCountdownSessionIdMock.mockReturnValue(null);

  await expect(cancelRecordingStart()).resolves.toEqual({ result: 'no-active-recording' });

  expect(beginVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('switches to STOPPING and notifies offscreen when a live recording stops', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 7,
  });

  await expect(stopRecording()).resolves.toEqual({ result: 'accepted' });

  expect(OVERLAY_RESTORE_RETRY_DELAYS_MS).toEqual([0, 250, 1000]);
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    status: VideoRecordingStatus.STOPPING,
    countdownEndsAt: null,
    error: null,
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      capabilityToken: expect.any(String),
      discard: false,
    })
  );
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
});

it('passes discard intent through to the offscreen stop command', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });

  await expect(stopRecording(true)).resolves.toEqual({ result: 'accepted' });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      capabilityToken: expect.any(String),
      discard: true,
    })
  );
});

it('fails closed when neither the live session nor durable lease has a source binding', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });
  getVideoSurfaceSessionMock.mockReturnValue(null);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);

  await expect(stopRecording()).resolves.toEqual({
    error: 'Recording source binding is unavailable',
    result: 'failed',
  });

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(releaseVideoCaptureSurfaceMock).not.toHaveBeenCalled();
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
});

it('hydrates the exact source binding from the durable lease', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });
  getVideoSurfaceSessionMock.mockReturnValue(null);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue({
    recordingId: 'recording-1',
    surfaceBinding: { generation: 4, streamInstanceId: 'durable-stream' },
  });

  await expect(stopRecording()).resolves.toEqual({ result: 'accepted' });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      generation: 4,
      recordingId: 'recording-1',
      streamInstanceId: 'durable-stream',
    })
  );
});

it('does not let delayed source-binding hydration for A start stopping current recording B', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });
  getVideoSurfaceSessionMock.mockReturnValue(null);
  let resolveLease!: (value: {
    recordingId: string;
    surfaceBinding: { generation: number; streamInstanceId: string };
  }) => void;
  ensureActiveVideoRecordingLeaseHydratedMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLease = resolve;
    })
  );

  const stopA = stopRecording();
  await vi.waitFor(() =>
    expect(ensureActiveVideoRecordingLeaseHydratedMock).toHaveBeenCalledOnce()
  );
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  resolveLease({
    recordingId: 'recording-1',
    surfaceBinding: { generation: 4, streamInstanceId: 'durable-stream' },
  });

  await expect(stopA).resolves.toEqual({ result: 'accepted' });
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
});

it('retains recording state when surface restoration fails after a bound stop', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });
  releaseVideoCaptureSurfaceMock.mockRejectedValueOnce(new Error('restore-conflict'));

  await expect(stopRecording()).resolves.toEqual({
    error: 'restore-conflict',
    result: 'failed',
  });

  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenLastCalledWith({
    status: VideoRecordingStatus.RECORDING,
    countdownEndsAt: null,
    error: 'restore-conflict',
  });
});

it('clears authority after an acknowledged terminal recorder failure', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    result: 'terminal-failure',
    error: 'encoder failed',
  });

  await expect(stopRecording()).resolves.toEqual({
    error: 'encoder failed',
    result: 'failed',
  });

  expect(releaseVideoCaptureSurfaceMock).toHaveBeenCalledWith('recording-1');
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledWith('recording-1');
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('recording-1');
});

it('fails closed before hydration when the recording identity is unavailable', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });
  getVideoRecordingIdMock.mockReturnValue(null);

  await expect(stopRecording()).resolves.toEqual({
    error: 'Recording source binding is unavailable',
    result: 'failed',
  });

  expect(ensureActiveVideoRecordingLeaseHydratedMock).not.toHaveBeenCalled();
});

it('restores the previous runtime state when offscreen stop delivery fails', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 11,
  });
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('transport failed'));

  await expect(stopRecording()).resolves.toEqual({
    result: 'failed',
    error: 'transport failed',
  });

  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenNthCalledWith(1, {
    status: VideoRecordingStatus.STOPPING,
    countdownEndsAt: null,
    error: null,
  });
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenNthCalledWith(2, {
    status: VideoRecordingStatus.RECORDING,
    countdownEndsAt: null,
    error: 'transport failed',
  });
  expect(logger.error).toHaveBeenCalledWith(
    'Failed to deliver offscreen stop command',
    expect.any(Error)
  );
});

it('does not let a delayed STOP delivery failure for A roll back current recording B', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 11,
  });
  let rejectStop!: (error: Error) => void;
  sendRuntimeMessageMock.mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectStop = reject;
    })
  );

  const stopA = stopRecording();
  await vi.waitFor(() => expect(sendRuntimeMessageMock).toHaveBeenCalledOnce());
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  rejectStop(new Error('transport failed'));

  await expect(stopA).resolves.toEqual({ result: 'accepted' });
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
});

it('does not let delayed surface cleanup failure for A mutate current recording B', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 11,
  });
  let rejectRelease!: (error: Error) => void;
  releaseVideoCaptureSurfaceMock.mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectRelease = reject;
    })
  );

  const stopA = stopRecording();
  await vi.waitFor(() =>
    expect(releaseVideoCaptureSurfaceMock).toHaveBeenCalledWith('recording-1')
  );
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  rejectRelease(new Error('surface cleanup failed'));

  await expect(stopA).resolves.toEqual({
    error: 'surface cleanup failed',
    result: 'failed',
  });
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
});

it('cleans only A authority when its delayed terminal STOP completes after B starts', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 11,
  });
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    result: 'terminal-failure',
    error: 'encoder failed',
  });
  let resolveRelease!: () => void;
  releaseVideoCaptureSurfaceMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveRelease = resolve;
    })
  );

  const stopA = stopRecording();
  await vi.waitFor(() =>
    expect(releaseVideoCaptureSurfaceMock).toHaveBeenCalledWith('recording-1')
  );
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  resolveRelease();

  await expect(stopA).resolves.toEqual({ error: 'encoder failed', result: 'failed' });
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('recording-1');
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
});

it('keeps committed post-record completion idle when only the stop response is lost', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 11,
  });
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('response channel closed'));
  readStoredVideoPostRecordResultMock.mockResolvedValueOnce({
    createdAt: 1,
    expiresAt: Date.now() + 1_000,
    result: {
      primaryRecordingId: 'recording-1',
      projectId: null,
      recordingId: 'recording-1',
    },
    status: 'ready',
  });

  await expect(stopRecording()).resolves.toEqual({ result: 'accepted' });

  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledWith('recording-1');
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    status: VideoRecordingStatus.STOPPING,
    countdownEndsAt: null,
    error: null,
  });
});

it('does not let stale committed STOP recovery for A reset current recording B', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 11,
  });
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('response channel closed'));
  let resolveStoredResult!: (value: unknown) => void;
  readStoredVideoPostRecordResultMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveStoredResult = resolve;
    })
  );

  const stopA = stopRecording();
  await vi.waitFor(() => expect(readStoredVideoPostRecordResultMock).toHaveBeenCalledOnce());
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  resolveStoredResult({
    createdAt: 1,
    expiresAt: Date.now() + 1_000,
    result: {
      primaryRecordingId: 'recording-1',
      projectId: null,
      recordingId: 'recording-1',
    },
    status: 'ready',
  });

  await expect(stopA).resolves.toEqual({ result: 'accepted' });

  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
});

it('retains the lease and session when saved-result publication is not acknowledged', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 11,
  });
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: false,
    error: 'session storage failed',
  });

  await expect(stopRecording()).resolves.toEqual({
    error: 'session storage failed',
    result: 'failed',
  });

  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(releaseVideoCaptureSurfaceMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenLastCalledWith({
    status: VideoRecordingStatus.RECORDING,
    countdownEndsAt: null,
    error: 'session storage failed',
  });
});

it('restores accepted-start lifecycle state when its offscreen stop is rejected', async () => {
  getVideoRecordingRuntimeStateMock
    .mockReturnValueOnce({
      status: VideoRecordingStatus.PREPARING,
      countdownEndsAt: null,
      error: null,
    })
    .mockReturnValueOnce({
      status: VideoRecordingStatus.STOPPING,
      countdownEndsAt: null,
      error: null,
    });
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 11,
  });
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'stop rejected' });

  await expect(stopRecording(true)).resolves.toEqual({
    result: 'failed',
    error: 'stop rejected',
  });

  expect(restoreVideoRecordingOffscreenStartPendingMock).toHaveBeenCalledOnce();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenLastCalledWith({
    status: VideoRecordingStatus.PREPARING,
    countdownEndsAt: null,
    error: 'stop rejected',
  });
});

it('reports primitive offscreen stop delivery failures', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 12,
  });
  sendRuntimeMessageMock.mockRejectedValueOnce('transport failed');

  await expect(stopRecording()).resolves.toEqual({
    result: 'failed',
    error: 'transport failed',
  });

  expect(setVideoRecordingRuntimeStateMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ error: 'transport failed' })
  );
});
