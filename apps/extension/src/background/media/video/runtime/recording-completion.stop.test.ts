vi.mock('./camera-recorder-control', async (original) => ({
  ...(await original<typeof import('./camera-recorder-control')>()),
  clearCameraRecorderControlGrant: vi.fn().mockResolvedValue(undefined),
}));
import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  getLeaseSnapshotMock,
  updateTerminalMock,
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
  getLeaseSnapshotMock: vi.fn(),
  updateTerminalMock: vi.fn(),
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

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('./session-state', () => ({
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));

vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
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
vi.mock('../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-surface')>()),
  getVideoSurfaceSession: getVideoSurfaceSessionMock,
  releaseVideoCaptureSurface: releaseVideoCaptureSurfaceMock,
}));
vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  getActiveVideoRecordingLeaseSnapshot: getLeaseSnapshotMock,
  updateVideoRecordingTerminal: updateTerminalMock,
  ensureVideoRecordingLeaseCache: ensureActiveVideoRecordingLeaseHydratedMock,
}));
vi.mock('../../../storage/video/post-record-result', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../storage/video/post-record-result')>()),
  readStoredVideoPostRecordResult: readStoredVideoPostRecordResultMock,
}));

vi.mock('./manager/controls.stop/effects', () => ({
  quiesceViewportEmulationForPrivacyErasure: vi.fn(),
  runStopSideEffects: runStopSideEffectsMock,
  waitForStopSideEffects: vi.fn(),
}));

vi.mock('./manager/controls.stop/guard', () => ({
  shouldSkipStop: shouldSkipStopMock,
}));

import {
  cancelRecordingStart,
  OVERLAY_RESTORE_RETRY_DELAYS_MS,
  stopRecording,
} from './recording-completion';

beforeEach(() => {
  vi.clearAllMocks();
  getLeaseSnapshotMock.mockReturnValue(null);
  updateTerminalMock.mockImplementation(async (_binding, terminal) => {
    const lease = {
      recordingId: 'recording-1',
      surfaceBinding: { generation: 2, streamInstanceId: 'stream-instance-1' },
      phase: 'terminal',
      terminal,
    };
    ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(lease);
    getLeaseSnapshotMock.mockReturnValue(lease);
    return lease;
  });
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

  expect(runStopSideEffectsMock).toHaveBeenCalledWith(
    {
      mode: CaptureMode.TAB,
      shouldResetImmediately: true,
      tabId: 7,
    },
    'detailed',
    expect.objectContaining({ discard: false, recordingPointTransform: expect.any(Promise) })
  );
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledOnce();
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith(
    'recording-1',
    expect.objectContaining({ authority: expect.any(String) })
  );
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
    completion: null,
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
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
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

it('retains STOPPING when confirmed completion cleanup fails', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });
  releaseVideoCaptureSurfaceMock.mockRejectedValueOnce(new Error('restore-conflict'));
  await expect(stopRecording()).resolves.toEqual({ error: 'restore-conflict', result: 'failed' });
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenLastCalledWith({
    completion: { discard: false, outcome: 'stopped', pending: false },
    status: VideoRecordingStatus.STOPPING,
    error: 'restore-conflict',
  });
});

it('retains authority after an acknowledged terminal recorder failure', async () => {
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
  await expect(stopRecording()).resolves.toEqual({ error: 'encoder failed', result: 'failed' });
  expect(updateTerminalMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ recordingId: 'recording-1' }),
    { discard: false, outcome: 'failed', cleanupStep: 'surface' }
  );
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
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

it('retains unknown terminal state when offscreen stop delivery fails', async () => {
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
    completion: null,
    status: VideoRecordingStatus.STOPPING,
    countdownEndsAt: null,
    error: null,
  });
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenNthCalledWith(2, {
    completion: { discard: false, outcome: 'unknown', pending: false },
    status: VideoRecordingStatus.STOPPING,
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
  setVideoRecordingRuntimeStateMock.mockClear();
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  rejectRelease(new Error('surface cleanup failed'));

  await expect(stopA).resolves.toEqual({
    error: 'surface cleanup failed',
    result: 'failed',
  });
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
});

it('does not project delayed terminal failure for A onto current B', async () => {
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
  let resolveFailure!: () => void;
  updateTerminalMock.mockImplementationOnce(async () => ({
    phase: 'terminal',
    terminal: { discard: false, outcome: 'unknown' },
  }));
  updateTerminalMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveFailure = resolve;
      })
  );
  const stopA = stopRecording();
  await vi.waitFor(() => expect(updateTerminalMock).toHaveBeenCalledTimes(2));
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  resolveFailure();
  await expect(stopA).resolves.toEqual({ result: 'accepted' });
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
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

  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith(
    'recording-1',
    expect.objectContaining({ authority: expect.any(String) })
  );
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    completion: null,
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
    completion: { discard: false, outcome: 'unknown', pending: false },
    status: VideoRecordingStatus.STOPPING,
    countdownEndsAt: null,
    error: 'session storage failed',
  });
});

it('retains accepted-start terminal intent when its offscreen stop is rejected', async () => {
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

  expect(restoreVideoRecordingOffscreenStartPendingMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenLastCalledWith({
    completion: { discard: true, outcome: 'unknown', pending: false },
    status: VideoRecordingStatus.STOPPING,
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

it('dispatches STOP without waiting for a hanging content telemetry collection', async () => {
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    tabId: 7,
    shouldResetImmediately: false,
  });
  runStopSideEffectsMock.mockReturnValueOnce(new Promise<void>(() => undefined));
  await expect(stopRecording()).resolves.toEqual({ result: 'accepted' });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      recordingId: 'recording-1',
    })
  );
});
