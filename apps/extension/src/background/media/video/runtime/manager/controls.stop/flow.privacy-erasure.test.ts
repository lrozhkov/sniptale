import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const {
  beginVideoRecordingStopMock,
  finishVideoRecordingStopMock,
  getVideoRecordingRuntimeStateMock,
  isVideoRecordingStopInProgressMock,
  loggerErrorMock,
  runStopSideEffectsMock,
  sendRuntimeMessageMock,
  setVideoRecordingRuntimeStateMock,
} = vi.hoisted(() => ({
  beginVideoRecordingStopMock: vi.fn(),
  finishVideoRecordingStopMock: vi.fn(),
  getVideoRecordingRuntimeStateMock: vi.fn(),
  isVideoRecordingStopInProgressMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  runStopSideEffectsMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: loggerErrorMock, log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../session-state', () => ({
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  resetVideoRecordingRuntimeState: vi.fn(),
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  beginVideoRecordingStop: beginVideoRecordingStopMock,
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  getVideoRecordingCountdownSessionId: vi.fn(() => null),
  hasActiveVideoRecordingSession: vi.fn(() => true),
  isVideoRecordingPreparationInProgress: vi.fn(() => false),
  isVideoRecordingStopInProgress: isVideoRecordingStopInProgressMock,
  resetCompletedVideoRecordingSession: vi.fn(),
  restoreVideoRecordingOffscreenStartPending: vi.fn(),
}));
vi.mock('./effects', () => ({
  quiesceViewportEmulationForPrivacyErasure: vi.fn(),
  runStopSideEffects: runStopSideEffectsMock,
  waitForStopSideEffects: vi.fn(),
}));

import { stopRecordingForPrivacyErasure } from './flow';

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    status: VideoRecordingStatus.RECORDING,
    countdownEndsAt: null,
    error: null,
  });
  beginVideoRecordingStopMock.mockReturnValue({
    mode: CaptureMode.TAB,
    shouldResetImmediately: false,
    tabId: 9,
  });
  isVideoRecordingStopInProgressMock.mockReturnValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
});

it('requires an explicit deferred acknowledgement for privacy erasure', async () => {
  await expect(stopRecordingForPrivacyErasure()).resolves.toEqual({
    error: 'Offscreen recording stop acknowledgement missing',
    result: 'failed',
  });

  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to deliver offscreen stop command during local data erasure'
  );
  expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain('acknowledgement missing');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      discard: true,
    })
  );
});

it('accepts privacy erasure stop only after the offscreen recorder settles', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result: 'accepted' });

  await expect(stopRecordingForPrivacyErasure()).resolves.toEqual({ result: 'accepted' });

  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(runStopSideEffectsMock).toHaveBeenCalledWith(
    { mode: CaptureMode.TAB, shouldResetImmediately: false, tabId: 9 },
    'fixed'
  );
});

it('reissues the strict stop when a previous erasure left termination in progress', async () => {
  isVideoRecordingStopInProgressMock.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result: 'accepted' });

  await expect(stopRecordingForPrivacyErasure()).resolves.toEqual({ result: 'accepted' });

  expect(beginVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(runStopSideEffectsMock).not.toHaveBeenCalled();
});
