import { beforeEach, expect, it, vi } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const {
  finishVideoRecordingStopMock,
  clearRecordingStartActivationWatchdogMock,
  getVideoRecordingIdMock,
  getVideoRecordingRuntimeStateMock,
  getVideoRecordingTabIdMock,
  markVideoRecordingPreparationSettledMock,
  resetCompletedVideoRecordingSessionMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  clearActiveVideoRecordingLeaseMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  getActiveVideoRecordingLeaseSnapshotMock,
  isAuthorizedCameraRecorderDocumentMock,
  resolveTrustedCameraRecorderRuntimeSenderUrlMock,
  resolveTrustedPopupRuntimeSenderUrlMock,
  restoreCurrentRecordingFromLeaseMock,
  setControlledCursorDisplaySurfaceMock,
  setControlledCursorVerifiedModeMock,
  setVideoRecordingRuntimeStateMock,
} = vi.hoisted(() => ({
  finishVideoRecordingStopMock: vi.fn(),
  clearRecordingStartActivationWatchdogMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  getVideoRecordingRuntimeStateMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  markVideoRecordingPreparationSettledMock: vi.fn(),
  resetCompletedVideoRecordingSessionMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  getActiveVideoRecordingLeaseSnapshotMock: vi.fn(),
  isAuthorizedCameraRecorderDocumentMock: vi.fn(),
  resolveTrustedCameraRecorderRuntimeSenderUrlMock: vi.fn(),
  resolveTrustedPopupRuntimeSenderUrlMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
  setControlledCursorDisplaySurfaceMock: vi.fn(),
  setControlledCursorVerifiedModeMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
}));

vi.mock('../../session-state/service/runtime-state-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state/service/runtime-state-service')>()),
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  getVideoRecordingId: getVideoRecordingIdMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  markVideoRecordingPreparationSettled: markVideoRecordingPreparationSettledMock,
  resetCompletedVideoRecordingSession: resetCompletedVideoRecordingSessionMock,
  setControlledCursorDisplaySurface: setControlledCursorDisplaySurfaceMock,
  setControlledCursorVerifiedMode: setControlledCursorVerifiedModeMock,
}));

vi.mock('../../manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager')>()),
  resetRecordingTabId: resetRecordingTabIdMock,
}));
vi.mock('../../../manager/start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../manager/start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: clearRecordingStartActivationWatchdogMock,
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  ensureActiveVideoRecordingLeaseHydrated: ensureActiveVideoRecordingLeaseHydratedMock,
  getActiveVideoRecordingLeaseSnapshot: getActiveVideoRecordingLeaseSnapshotMock,
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
}));
vi.mock('../../sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sender-policy')>()),
  resolveTrustedCameraRecorderRuntimeSenderUrl: resolveTrustedCameraRecorderRuntimeSenderUrlMock,
  resolveTrustedPopupRuntimeSenderUrl: resolveTrustedPopupRuntimeSenderUrlMock,
}));
vi.mock('../../camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../camera-recorder-control')>()),
  isAuthorizedCameraRecorderDocument: isAuthorizedCameraRecorderDocumentMock,
}));

import {
  handleOffscreenRecordingPaused,
  handleOffscreenRecordingResumed,
  handleOffscreenRecordingStarted,
  handleOffscreenRecordingStopped,
  handleRecordingDurationUpdated,
  handleRecordingState,
  handleRecordingTabId,
} from './recording-state';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function expectAcceptedLifecycleResponse(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'accepted' });
}

function expectAsyncRoute(routeResult: unknown) {
  expect(routeResult).toEqual({ handled: true, keepChannelOpen: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    duration: 0,
    status: VideoRecordingStatus.IDLE,
  });
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  getVideoRecordingTabIdMock.mockReturnValue(17);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue(null);
  isAuthorizedCameraRecorderDocumentMock.mockReturnValue(false);
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue(null);
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(null);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
});

it('handles recording state and tab lookup through the recording owner', async () => {
  const sendResponse = createSendResponse();

  expectAsyncRoute(handleRecordingState(sendResponse));
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenCalledWith({
    recordingHealth: 'healthy',
    success: true,
    state: { duration: 0, status: VideoRecordingStatus.IDLE },
  });
  expect(handleRecordingTabId(sendResponse, 17)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(sendResponse).toHaveBeenLastCalledWith({
    success: true,
    isCurrentTab: true,
    tabId: 17,
  });
  expectAsyncRoute(
    handleRecordingDurationUpdated({ duration: 12, recordingId: 'rec-1' }, sendResponse)
  );
  await flushAsyncRoute();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({ duration: 12 });
  expectAcceptedLifecycleResponse(sendResponse);
});

it('marks recording-state reads as degraded when the runtime state already carries an error', async () => {
  const sendResponse = createSendResponse();
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    duration: 12,
    error: 'Microphone unavailable',
    status: VideoRecordingStatus.RECORDING,
  });

  expectAsyncRoute(handleRecordingState(sendResponse));
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenCalledWith({
    recordingHealth: 'degraded',
    success: true,
    state: {
      duration: 12,
      error: 'Microphone unavailable',
      status: VideoRecordingStatus.RECORDING,
    },
  });
});

it('returns camera recorder control capability to an authorized camera document', async () => {
  const sendResponse = createSendResponse();
  const sender = { documentId: 'document-1', url: 'camera-url' } as chrome.runtime.MessageSender;
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue({
    controlToken: 'control-token-1',
    expiresAt: Date.now() + 1000,
    ownerSenderUrl: 'popup-url',
    recordingId: 'rec-1',
  });
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue('camera-url');
  isAuthorizedCameraRecorderDocumentMock.mockReturnValue(true);
  expectAsyncRoute(handleRecordingState(sendResponse, sender));
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenLastCalledWith(
    expect.objectContaining({
      controlToken: 'control-token-1',
      recordingId: 'rec-1',
    })
  );
});

it('handles recording start and stop lifecycle mutations through the recording owner', async () => {
  const sendResponse = createSendResponse();

  expectAsyncRoute(
    handleOffscreenRecordingStarted(
      { recordingId: 'rec-1', cursorCaptureMode: 'embedded-fallback', displaySurface: 'window' },
      sendResponse
    )
  );
  await flushAsyncRoute();
  expect(clearRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('rec-1');
  expect(markVideoRecordingPreparationSettledMock).toHaveBeenCalledTimes(1);
  expect(setControlledCursorVerifiedModeMock).toHaveBeenCalledWith('embedded-fallback');
  expect(setControlledCursorDisplaySurfaceMock).toHaveBeenCalledWith('window');
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    countdownEndsAt: null,
    error: null,
    status: VideoRecordingStatus.RECORDING,
  });
  expectAcceptedLifecycleResponse(sendResponse);
  expectAsyncRoute(handleOffscreenRecordingStopped({ recordingId: 'rec-1' }, sendResponse));
  await flushAsyncRoute();
  expect(finishVideoRecordingStopMock).toHaveBeenCalledTimes(1);
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledWith('rec-1');
  expect(resetRecordingTabIdMock).toHaveBeenCalledTimes(1);
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expectAcceptedLifecycleResponse(sendResponse);
});

it('waits for stopped-recording lease cleanup before acknowledging the lifecycle route', async () => {
  const sendResponse = createSendResponse();
  const cleanup = createDeferred();
  clearActiveVideoRecordingLeaseMock.mockReturnValueOnce(cleanup.promise);

  handleOffscreenRecordingStopped({ recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(finishVideoRecordingStopMock).toHaveBeenCalledTimes(1);
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(sendResponse).not.toHaveBeenCalled();

  cleanup.resolve();
  await flushAsyncRoute();

  expectAcceptedLifecycleResponse(sendResponse);
});

it('handles recording pause and resume lifecycle mutations through the recording owner', async () => {
  const sendResponse = createSendResponse();

  expectAsyncRoute(handleOffscreenRecordingPaused({ recordingId: 'rec-1' }, sendResponse));
  await flushAsyncRoute();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenLastCalledWith({
    status: VideoRecordingStatus.PAUSED,
  });
  expectAcceptedLifecycleResponse(sendResponse);
  expectAsyncRoute(handleOffscreenRecordingResumed({ recordingId: 'rec-1' }, sendResponse));
  await flushAsyncRoute();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenLastCalledWith({
    status: VideoRecordingStatus.RECORDING,
  });
  expectAcceptedLifecycleResponse(sendResponse);
});

it('restores the active recording lease before accepting post-restart lifecycle events', async () => {
  const sendResponse = createSendResponse();
  getVideoRecordingIdMock.mockReturnValue(null);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(true);

  expectAsyncRoute(handleOffscreenRecordingPaused({ recordingId: 'rec-1' }, sendResponse));
  await flushAsyncRoute();

  expect(restoreCurrentRecordingFromLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    status: VideoRecordingStatus.PAUSED,
  });
  expectAcceptedLifecycleResponse(sendResponse);
});

it('clears the stored display surface when recording starts without metadata', async () => {
  const sendResponse = createSendResponse();

  expectAsyncRoute(handleOffscreenRecordingStarted({ recordingId: 'rec-1' }, sendResponse));
  await flushAsyncRoute();

  expect(setControlledCursorVerifiedModeMock).not.toHaveBeenCalled();
  expect(setControlledCursorDisplaySurfaceMock).toHaveBeenCalledWith(null);
  expectAcceptedLifecycleResponse(sendResponse);
});
