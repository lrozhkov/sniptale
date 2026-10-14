import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const completionMock = vi.hoisted(() => vi.fn());
vi.mock('../../recording-completion', async (original) => ({
  ...(await original<typeof import('../../recording-completion')>()),
  completeVideoRecording: completionMock,
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
}));

const clockMocks = vi.hoisted(() => ({
  getMode: vi.fn(),
  isStopping: vi.fn(),
  setClock: vi.fn(),
  enable: vi.fn(),
  sync: vi.fn(),
}));
vi.mock('../../manager/controlled-cursor/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager/controlled-cursor/messages')>()),
  enableControlledCursorCapture: clockMocks.enable,
  syncControlledCursorCapture: clockMocks.sync,
}));

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
  acknowledgePendingVideoPostRecordResultMock,
  clearCameraRecorderControlGrantMock,
  forgetCameraRecorderControlGrantMock,
  isAuthorizedCameraRecorderDocumentMock,
  restoreAuthorizedCameraRecorderDocumentMock,
  resolveTrustedCameraRecorderRuntimeSenderUrlMock,
  resolveTrustedPopupRuntimeSenderUrlMock,
  restoreCurrentRecordingFromLeaseMock,
  setControlledCursorDisplaySurfaceMock,
  setControlledCursorVerifiedModeMock,
  setVideoRecordingRuntimeStateMock,
  releaseVideoCaptureSurfaceMock,
  clearPendingVideoPostRecordResultMock,
  readPendingVideoPostRecordResultMock,
  isAcknowledgedVideoPostRecordResultForCameraMock,
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
  acknowledgePendingVideoPostRecordResultMock: vi.fn(),
  clearCameraRecorderControlGrantMock: vi.fn(),
  forgetCameraRecorderControlGrantMock: vi.fn(),
  isAuthorizedCameraRecorderDocumentMock: vi.fn(),
  restoreAuthorizedCameraRecorderDocumentMock: vi.fn(),
  resolveTrustedCameraRecorderRuntimeSenderUrlMock: vi.fn(),
  resolveTrustedPopupRuntimeSenderUrlMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
  setControlledCursorDisplaySurfaceMock: vi.fn(),
  setControlledCursorVerifiedModeMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
  releaseVideoCaptureSurfaceMock: vi.fn(),
  clearPendingVideoPostRecordResultMock: vi.fn(),
  readPendingVideoPostRecordResultMock: vi.fn(),
  isAcknowledgedVideoPostRecordResultForCameraMock: vi.fn(),
}));

vi.mock('../../../../../storage/video/post-record-result', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../storage/video/post-record-result')>()),
  clearPendingVideoPostRecordResult: clearPendingVideoPostRecordResultMock,
  isAcknowledgedVideoPostRecordResultForCamera: isAcknowledgedVideoPostRecordResultForCameraMock,
  readPendingVideoPostRecordResult: readPendingVideoPostRecordResultMock,
}));
vi.mock('../../../../../storage/video/post-record-acknowledgement', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../storage/video/post-record-acknowledgement')
  >()),
  acknowledgePendingVideoPostRecordResult: acknowledgePendingVideoPostRecordResultMock,
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
  getVideoRecordingCaptureMode: clockMocks.getMode,
  isVideoRecordingStopInProgress: clockMocks.isStopping,
  setRecordingFrameClock: clockMocks.setClock,
  getVideoRecordingId: getVideoRecordingIdMock,
  isCurrentVideoRecordingId: (recordingId: string | null | undefined) =>
    recordingId != null && getVideoRecordingIdMock() === recordingId,
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
  ensureVideoRecordingLeaseCache: ensureActiveVideoRecordingLeaseHydratedMock,
  getActiveVideoRecordingLeaseSnapshot: getActiveVideoRecordingLeaseSnapshotMock,
}));
vi.mock('../../sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sender-policy')>()),
  resolveTrustedCameraRecorderRuntimeSenderUrl: resolveTrustedCameraRecorderRuntimeSenderUrlMock,
  resolveTrustedPopupRuntimeSenderUrl: resolveTrustedPopupRuntimeSenderUrlMock,
}));
vi.mock('../../camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../camera-recorder-control')>()),
  clearCameraRecorderControlGrant: clearCameraRecorderControlGrantMock,
  forgetCameraRecorderControlGrant: forgetCameraRecorderControlGrantMock,
  isAuthorizedCameraRecorderDocument: isAuthorizedCameraRecorderDocumentMock,
  restoreAuthorizedCameraRecorderDocument: restoreAuthorizedCameraRecorderDocumentMock,
}));
vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  releaseVideoCaptureSurface: releaseVideoCaptureSurfaceMock,
}));

import {
  handleOffscreenRecordingPaused,
  handleOffscreenRecordingResumed,
  handleOffscreenRecordingStarted,
  handleOffscreenRecordingStopped,
  handleRecordingDurationUpdated,
  handleAcknowledgePostRecordResult,
  handleRecordingState,
  handleRecordingTabId,
} from './recording-state';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  completionMock.mockReset().mockResolvedValue(undefined);
  clockMocks.getMode.mockReturnValue(null);
  clockMocks.isStopping.mockReturnValue(false);
  clockMocks.setClock.mockReturnValue(true);
  clockMocks.enable.mockResolvedValue(undefined);
  clockMocks.sync.mockResolvedValue(undefined);
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    duration: 0,
    status: VideoRecordingStatus.IDLE,
  });
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  getVideoRecordingTabIdMock.mockReturnValue(17);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue(null);
  acknowledgePendingVideoPostRecordResultMock.mockResolvedValue('stale');
  clearCameraRecorderControlGrantMock.mockResolvedValue(true);
  isAuthorizedCameraRecorderDocumentMock.mockReturnValue(false);
  restoreAuthorizedCameraRecorderDocumentMock.mockResolvedValue(false);
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue(null);
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(null);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
  releaseVideoCaptureSurfaceMock.mockResolvedValue(undefined);
  clearPendingVideoPostRecordResultMock.mockResolvedValue(false);
  readPendingVideoPostRecordResultMock.mockResolvedValue(null);
  isAcknowledgedVideoPostRecordResultForCameraMock.mockResolvedValue(false);
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
  expectAsyncRoute(handleRecordingTabId(sendResponse, 17));
  await flushAsyncRoute();
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
  const sender = {
    documentId: 'document-1',
    tab: { id: 7 },
    url: 'camera-url',
  } as chrome.runtime.MessageSender;
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue({
    controlToken: 'control-token-1',
    expiresAt: Date.now() + 1000,
    ownerSenderUrl: 'popup-url',
    recordingId: 'rec-1',
  });
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue('camera-url');
  isAuthorizedCameraRecorderDocumentMock.mockReturnValue(true);
  restoreAuthorizedCameraRecorderDocumentMock.mockResolvedValue(true);
  expectAsyncRoute(handleRecordingState(sendResponse, sender));
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenLastCalledWith(
    expect.objectContaining({
      controlToken: 'control-token-1',
      recordingId: 'rec-1',
    })
  );
  expect(isAuthorizedCameraRecorderDocumentMock).toHaveBeenCalledWith({
    documentId: 'document-1',
    recordingId: 'rec-1',
    senderUrl: 'camera-url',
    tabId: 7,
  });
});

it('returns a pending post-record result only to its trusted extension UI', async () => {
  const sendResponse = createSendResponse();
  const result = {
    primaryRecordingId: 'rec-1-window-1',
    projectId: 'project-1',
    recordingId: 'rec-1',
  };
  readPendingVideoPostRecordResultMock.mockResolvedValue(result);
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue('popup-url');

  expectAsyncRoute(handleRecordingState(sendResponse, { url: 'popup-url' }));
  await flushAsyncRoute();

  expect(sendResponse).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordResult: result })
  );
});

it('does not let an older result cover a newer live recording lease', async () => {
  const sendResponse = createSendResponse();
  readPendingVideoPostRecordResultMock.mockResolvedValue({
    primaryRecordingId: 'rec-a',
    projectId: null,
    recordingId: 'rec-a',
  });
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue({
    controlToken: 'control-token-b',
    expiresAt: Date.now() + 1_000,
    ownerSenderUrl: 'popup-url',
    recordingId: 'rec-b',
  });
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue('popup-url');

  handleRecordingState(sendResponse, { url: 'popup-url' });
  await flushAsyncRoute();

  expect(sendResponse).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ postRecordResult: expect.anything() })
  );
});

it('restores a document-bound camera grant before disclosing a result after worker restart', async () => {
  const sendResponse = createSendResponse();
  const result = {
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  };
  readPendingVideoPostRecordResultMock.mockResolvedValue(result);
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue('camera-url');
  restoreAuthorizedCameraRecorderDocumentMock.mockResolvedValue(true);

  expectAsyncRoute(
    handleRecordingState(sendResponse, {
      documentId: 'camera-doc-1',
      tab: { id: 7 },
      url: 'camera-url',
    } as chrome.runtime.MessageSender)
  );
  await flushAsyncRoute();

  expect(restoreAuthorizedCameraRecorderDocumentMock).toHaveBeenCalledWith({
    documentId: 'camera-doc-1',
    recordingId: 'rec-1',
    senderUrl: 'camera-url',
    tabId: 7,
  });
  expect(sendResponse).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordResult: result })
  );
});

it('does not disclose a result when the camera sender tab differs from the grant', async () => {
  const sendResponse = createSendResponse();
  readPendingVideoPostRecordResultMock.mockResolvedValue({
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  });
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue('camera-url');
  restoreAuthorizedCameraRecorderDocumentMock.mockImplementation(
    async ({ tabId }: { tabId?: number }) => tabId === 7
  );

  handleRecordingState(sendResponse, {
    documentId: 'camera-doc-1',
    tab: { id: 8 },
    url: 'camera-url',
  } as chrome.runtime.MessageSender);
  await flushAsyncRoute();

  expect(restoreAuthorizedCameraRecorderDocumentMock).toHaveBeenCalledWith({
    documentId: 'camera-doc-1',
    recordingId: 'rec-1',
    senderUrl: 'camera-url',
    tabId: 8,
  });
  expect(sendResponse).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ postRecordResult: expect.anything() })
  );
});

it('hydrates active camera control independently from an older pending result after restart', async () => {
  const sendResponse = createSendResponse();
  const sender = {
    documentId: 'camera-doc-b',
    tab: { id: 9 },
    url: 'camera-url',
  } as chrome.runtime.MessageSender;
  const resultA = {
    primaryRecordingId: 'rec-a',
    projectId: null,
    recordingId: 'rec-a',
  };
  readPendingVideoPostRecordResultMock.mockResolvedValue(resultA);
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue({
    controlToken: 'control-token-b',
    expiresAt: Date.now() + 1000,
    ownerSenderUrl: 'popup-url',
    recordingId: 'rec-b',
  });
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue('camera-url');
  restoreAuthorizedCameraRecorderDocumentMock.mockImplementation(
    async ({ recordingId }: { recordingId?: string }) => recordingId === 'rec-b'
  );
  isAuthorizedCameraRecorderDocumentMock.mockImplementation(
    ({ recordingId }: { recordingId?: string }) => recordingId === 'rec-b'
  );

  expectAsyncRoute(handleRecordingState(sendResponse, sender));
  await flushAsyncRoute();

  expect(restoreAuthorizedCameraRecorderDocumentMock).toHaveBeenCalledWith({
    documentId: 'camera-doc-b',
    recordingId: 'rec-b',
    senderUrl: 'camera-url',
    tabId: 9,
  });
  expect(restoreAuthorizedCameraRecorderDocumentMock).toHaveBeenCalledOnce();
  const response = sendResponse.mock.lastCall?.[0];
  expect(response).toEqual(
    expect.objectContaining({
      controlToken: 'control-token-b',
      recordingId: 'rec-b',
      success: true,
    })
  );
  expect(response).not.toHaveProperty('postRecordResult');
});

it('acknowledges only matching results from trusted post-record UI senders', async () => {
  const sendResponse = createSendResponse();
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue('popup-url');
  acknowledgePendingVideoPostRecordResultMock.mockResolvedValue('acknowledged');

  expectAsyncRoute(
    handleAcknowledgePostRecordResult({ recordingId: 'rec-1' }, sendResponse, { url: 'popup-url' })
  );
  await flushAsyncRoute();

  expect(acknowledgePendingVideoPostRecordResultMock).toHaveBeenCalledWith('rec-1');
  expect(forgetCameraRecorderControlGrantMock).toHaveBeenCalledWith('rec-1');
  expect(sendResponse).toHaveBeenLastCalledWith({
    success: true,
    result: 'acknowledged',
  });

  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(null);
  expectAsyncRoute(
    handleAcknowledgePostRecordResult({ recordingId: 'rec-2' }, sendResponse, {
      url: 'https://example.test',
    })
  );
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenLastCalledWith({
    success: false,
    error: 'Unauthorized post-record result sender',
  });
  expect(acknowledgePendingVideoPostRecordResultMock).not.toHaveBeenCalledWith('rec-2');
});

it('accepts an exact acknowledged camera retry after the first ACK response is lost', async () => {
  const sendResponse = createSendResponse();
  const sender = {
    documentId: 'camera-doc-1',
    tab: { id: 7 },
    url: 'camera-url',
  } as chrome.runtime.MessageSender;
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue('camera-url');
  restoreAuthorizedCameraRecorderDocumentMock.mockResolvedValue(false);
  isAcknowledgedVideoPostRecordResultForCameraMock.mockResolvedValue(true);
  acknowledgePendingVideoPostRecordResultMock.mockResolvedValue('acknowledged');

  handleAcknowledgePostRecordResult({ recordingId: 'rec-1' }, sendResponse, sender);
  await flushAsyncRoute();

  expect(isAcknowledgedVideoPostRecordResultForCameraMock).toHaveBeenCalledWith({
    documentId: 'camera-doc-1',
    recordingId: 'rec-1',
    senderUrl: 'camera-url',
    tabId: 7,
  });
  expect(restoreAuthorizedCameraRecorderDocumentMock).toHaveBeenCalledWith({
    documentId: 'camera-doc-1',
    recordingId: 'rec-1',
    senderUrl: 'camera-url',
    tabId: 7,
  });
  expect(acknowledgePendingVideoPostRecordResultMock).toHaveBeenCalledWith('rec-1');
  expect(sendResponse).toHaveBeenLastCalledWith({
    success: true,
    result: 'acknowledged',
  });
});

it('does not revoke the hydrated camera grant for a stale acknowledgement', async () => {
  const sendResponse = createSendResponse();
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue('popup-url');
  acknowledgePendingVideoPostRecordResultMock.mockResolvedValue('stale');

  handleAcknowledgePostRecordResult({ recordingId: 'rec-1' }, sendResponse, { url: 'popup-url' });
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenLastCalledWith({
    success: true,
    result: 'stale',
  });
  expect(forgetCameraRecorderControlGrantMock).not.toHaveBeenCalled();
});

it('surfaces grouped acknowledgement failure and succeeds on retry', async () => {
  const sendResponse = createSendResponse();
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue('popup-url');
  acknowledgePendingVideoPostRecordResultMock
    .mockRejectedValueOnce(new Error('grouped remove failed'))
    .mockResolvedValueOnce('acknowledged');

  handleAcknowledgePostRecordResult({ recordingId: 'rec-1' }, sendResponse, { url: 'popup-url' });
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: false, error: 'Internal error' });

  handleAcknowledgePostRecordResult({ recordingId: 'rec-1' }, sendResponse, { url: 'popup-url' });
  await flushAsyncRoute();
  expect(forgetCameraRecorderControlGrantMock).toHaveBeenCalledOnce();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'acknowledged' });
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
  expect(completionMock).toHaveBeenCalledWith('rec-1');
  expectAcceptedLifecycleResponse(sendResponse);
});

it('reports completion failure without acknowledging successful stop', async () => {
  const sendResponse = createSendResponse();
  completionMock.mockRejectedValueOnce(new Error('cleanup refused'));
  handleOffscreenRecordingStopped({ recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: false, error: 'Internal error' });
});

it('waits for the completion owner before acknowledging stopped', async () => {
  const sendResponse = createSendResponse();
  const completion = createDeferred();
  completionMock.mockReturnValueOnce(completion.promise);
  handleOffscreenRecordingStopped({ recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();
  expect(sendResponse).not.toHaveBeenCalled();
  completion.resolve();
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
  const lease = { recordingId: 'rec-1', phase: 'active' };
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue(lease);
  ensureActiveVideoRecordingLeaseHydratedMock.mockImplementationOnce(async () => {
    getVideoRecordingIdMock.mockReturnValue('rec-1');
    return lease;
  });

  expectAsyncRoute(handleOffscreenRecordingPaused({ recordingId: 'rec-1' }, sendResponse));
  await flushAsyncRoute();

  expect(ensureActiveVideoRecordingLeaseHydratedMock).toHaveBeenCalled();
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

it('forwards recorder anchors through start/pause/resume without receipt timing', async () => {
  clockMocks.getMode.mockReturnValue(CaptureMode.TAB);
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue({
    recordingId: 'rec-1',
    surfaceBinding: { generation: 3, streamInstanceId: 'source' },
  });
  const initial = {
    recordingId: 'rec-1',
    generation: 3,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: 1000000,
    mediaTimeSeconds: 0,
  };
  const paused = {
    ...initial,
    revision: 2,
    phase: 'paused' as const,
    captureEpochMs: 1001000,
    mediaTimeSeconds: 1,
  };
  const resumed = { ...initial, revision: 3, captureEpochMs: 1005000, mediaTimeSeconds: 1.1 };
  handleOffscreenRecordingStarted(
    { recordingId: 'rec-1', frameClock: initial },
    createSendResponse()
  );
  await flushAsyncRoute();
  expect(clockMocks.enable).toHaveBeenCalledExactlyOnceWith(17, 'rec-1', 0, initial);
  handleOffscreenRecordingPaused(
    { recordingId: 'rec-1', frameClock: paused },
    createSendResponse()
  );
  await flushAsyncRoute();
  expect(clockMocks.sync).toHaveBeenCalledWith(17, 'pause', paused);
  handleOffscreenRecordingResumed(
    { recordingId: 'rec-1', frameClock: resumed },
    createSendResponse()
  );
  await flushAsyncRoute();
  expect(clockMocks.sync).toHaveBeenCalledWith(17, 'resume', resumed);
  expect(clockMocks.setClock.mock.calls.map(([anchor]) => anchor)).toEqual([
    initial,
    paused,
    resumed,
  ]);
});

it('refuses guessed TAB history when exact clock is absent while keeping primary recording status active', async () => {
  clockMocks.getMode.mockReturnValue(CaptureMode.TAB);
  handleOffscreenRecordingStarted({ recordingId: 'rec-1', frameClock: null }, createSendResponse());
  await flushAsyncRoute();
  expect(clockMocks.enable).toHaveBeenCalledExactlyOnceWith(17, 'rec-1', 0, null);
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith(
    expect.objectContaining({ status: VideoRecordingStatus.RECORDING })
  );
});

it('ignores late source generations and stale anchor revisions before reopening capture', async () => {
  clockMocks.getMode.mockReturnValue(CaptureMode.TAB);
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue({
    recordingId: 'rec-1',
    surfaceBinding: { generation: 3, streamInstanceId: 'source' },
  });
  const stale = {
    recordingId: 'rec-1',
    generation: 2,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: 1000000,
    mediaTimeSeconds: 0,
  };
  handleOffscreenRecordingResumed(
    { recordingId: 'rec-1', frameClock: stale },
    createSendResponse()
  );
  await flushAsyncRoute();
  expect(clockMocks.sync).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  clockMocks.setClock.mockReturnValue(false);
  handleOffscreenRecordingResumed(
    { recordingId: 'rec-1', frameClock: { ...stale, generation: 3 } },
    createSendResponse()
  );
  await flushAsyncRoute();
  expect(clockMocks.sync).not.toHaveBeenCalled();
});
