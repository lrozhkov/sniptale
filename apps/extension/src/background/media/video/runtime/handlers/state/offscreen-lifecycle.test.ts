import { beforeEach, expect, it, vi } from 'vitest';

vi.mock(
  '../../../../../../composition/persistence/recordings/completion-outbox',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../../composition/persistence/recordings/completion-outbox')
    >()),
    removeVideoRecordingCompletionOutbox: vi.fn().mockResolvedValue(true),
  })
);

const {
  finishVideoRecordingStopMock,
  finalizeRecordingDiagnosticsMock,
  getRecordingTabIdMock,
  getVideoRecordingIdMock,
  clearRecordingStartActivationWatchdogMock,
  markOffscreenDocumentReadyMock,
  notifyRecordingStartFailedMock,
  openVideoEditorPageMock,
  openPopupMock,
  updateWindowMock,
  getTabMock,
  resetCompletedVideoRecordingSessionMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  sendRuntimeMessageMock,
  waitForStopSideEffectsMock,
  clearActiveVideoRecordingLeaseMock,
  restoreCurrentRecordingFromLeaseMock,
  releaseVideoCaptureSurfaceMock,
  clearCameraRecorderControlGrantMock,
  commitPendingVideoPostRecordResultMock,
  persistPendingVideoPostRecordResultMock,
  readStoredVideoPostRecordResultMock,
} = vi.hoisted(() => ({
  finishVideoRecordingStopMock: vi.fn(),
  finalizeRecordingDiagnosticsMock: vi.fn(),
  getRecordingTabIdMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  clearRecordingStartActivationWatchdogMock: vi.fn(),
  markOffscreenDocumentReadyMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  openVideoEditorPageMock: vi.fn(),
  openPopupMock: vi.fn(),
  updateWindowMock: vi.fn(),
  getTabMock: vi.fn(),
  resetCompletedVideoRecordingSessionMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  waitForStopSideEffectsMock: vi.fn(),
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
  releaseVideoCaptureSurfaceMock: vi.fn(),
  clearCameraRecorderControlGrantMock: vi.fn(),
  commitPendingVideoPostRecordResultMock: vi.fn(),
  persistPendingVideoPostRecordResultMock: vi.fn(),
  readStoredVideoPostRecordResultMock: vi.fn(),
}));

vi.mock('../../../../../storage/video/post-record-result', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../storage/video/post-record-result')>()),
  commitPendingVideoPostRecordResult: commitPendingVideoPostRecordResultMock,
  persistPendingVideoPostRecordResult: persistPendingVideoPostRecordResultMock,
  readStoredVideoPostRecordResult: readStoredVideoPostRecordResultMock,
}));
vi.mock('../../camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../camera-recorder-control')>()),
  clearCameraRecorderControlGrant: clearCameraRecorderControlGrantMock,
}));

vi.mock('@sniptale/foundation/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/best-effort')>()),
  runBestEffort: vi.fn((promise: Promise<unknown>) => promise),
}));
vi.mock('../../../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../platform/navigation/extension-pages')
  >()),
  openVideoEditorPage: openVideoEditorPageMock,
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({ error: vi.fn(), log: vi.fn(), warn: vi.fn() })),
}));
vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: { openPopup: openPopupMock },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: getTabMock },
}));
vi.mock('@sniptale/platform/browser/windows', () => ({
  browserWindows: { update: updateWindowMock },
}));
vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: vi.fn(),
}));
vi.mock('../../manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager')>()),
  finalizeRecordingDiagnostics: finalizeRecordingDiagnosticsMock,
  getRecordingTabId: getRecordingTabIdMock,
  notifyRecordingStartFailed: notifyRecordingStartFailedMock,
  resetRecordingTabId: resetRecordingTabIdMock,
}));
vi.mock('../../manager/controls.stop/effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager/controls.stop/effects')>()),
  waitForStopSideEffects: waitForStopSideEffectsMock,
}));
vi.mock('../../../session-state', async () => {
  const actual = await vi.importActual('../../../session-state');
  return {
    ...actual,
    finishVideoRecordingStop: finishVideoRecordingStopMock,
    getVideoRecordingId: getVideoRecordingIdMock,
    isCurrentVideoRecordingId: (recordingId: string | null | undefined) =>
      recordingId != null && getVideoRecordingIdMock() === recordingId,
    resetCompletedVideoRecordingSession: resetCompletedVideoRecordingSessionMock,
  };
});
vi.mock('../../../manager/start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../manager/start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: clearRecordingStartActivationWatchdogMock,
}));
vi.mock('../../../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../offscreen-document/service')>()),
  markOffscreenDocumentReady: markOffscreenDocumentReadyMock,
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
}));
vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  releaseVideoCaptureSurface: releaseVideoCaptureSurfaceMock,
}));
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  handleInternalVideoSignal,
  handleOffscreenError,
  handleOffscreenReady,
  handleProjectExportLifecycleMessage,
  handleVideoSavedToIdb,
} from './offscreen-lifecycle';

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

function expectSupersededLifecycleResponse(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'superseded' });
}

beforeEach(() => {
  vi.clearAllMocks();
  markOffscreenDocumentReadyMock.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  getRecordingTabIdMock.mockReturnValue(17);
  getTabMock.mockResolvedValue({ active: true, id: 17, windowId: 4 });
  openPopupMock.mockResolvedValue(undefined);
  updateWindowMock.mockResolvedValue(undefined);
  openVideoEditorPageMock.mockResolvedValue(undefined);
  waitForStopSideEffectsMock.mockResolvedValue(undefined);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
  releaseVideoCaptureSurfaceMock.mockResolvedValue(undefined);
  clearCameraRecorderControlGrantMock.mockResolvedValue(true);
  commitPendingVideoPostRecordResultMock.mockResolvedValue('ready');
  persistPendingVideoPostRecordResultMock.mockResolvedValue('staged');
  readStoredVideoPostRecordResultMock.mockResolvedValue(null);
  clearActiveVideoRecordingLeaseMock.mockResolvedValue(undefined);
});

it('handles offscreen lifecycle acknowledgements and failures through the lifecycle owner', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleOffscreenReady(
      { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(markOffscreenDocumentReadyMock).toHaveBeenCalledWith('startup-1');
  expect(handleInternalVideoSignal(sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(
    handleProjectExportLifecycleMessage(
      {
        type: VideoMessageType.PROJECT_EXPORT_CANCELLED,
        jobId: 'job-1',
        targetDocumentId: 'editor-doc-1',
        targetSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(
    handleOffscreenError({ error: 'boom', phase: 'start', recordingId: 'rec-1' }, sendResponse)
  ).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(clearRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('rec-1');
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('boom', { recordingId: 'rec-1' });
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(markOffscreenDocumentReadyMock).toHaveBeenCalledTimes(1);
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);

  expect(handleOffscreenError({ error: 'export-boom', phase: 'export' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);
});

it('treats saved recording notifications as stop completion before diagnostics clear ids', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse)
  ).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();

  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledWith('rec-1');
  expect(resetRecordingTabIdMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(finalizeRecordingDiagnosticsMock).toHaveBeenCalledWith('rec-1');
  expect(persistPendingVideoPostRecordResultMock).toHaveBeenCalledWith({
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  });
  expect(persistPendingVideoPostRecordResultMock.mock.invocationCallOrder[0]).toBeLessThan(
    releaseVideoCaptureSurfaceMock.mock.invocationCallOrder[0] ?? 0
  );
  expect(clearActiveVideoRecordingLeaseMock.mock.invocationCallOrder[0]).toBeLessThan(
    commitPendingVideoPostRecordResultMock.mock.invocationCallOrder[0] ?? 0
  );
  expect(commitPendingVideoPostRecordResultMock.mock.invocationCallOrder[0]).toBeLessThan(
    finishVideoRecordingStopMock.mock.invocationCallOrder[0] ?? 0
  );
  expectAcceptedLifecycleResponse(sendResponse);
});

it('keeps saved completion retryable when the post-record result cannot be persisted', async () => {
  const sendResponse = createSendResponse();
  persistPendingVideoPostRecordResultMock.mockRejectedValueOnce(
    new Error('session storage failed')
  );

  handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(releaseVideoCaptureSurfaceMock).not.toHaveBeenCalled();
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Internal error' });
});

it('waits for start-failure lease cleanup before acknowledging the lifecycle route', async () => {
  const sendResponse = createSendResponse();
  const cleanup = createDeferred();
  clearActiveVideoRecordingLeaseMock.mockReturnValueOnce(cleanup.promise);

  handleOffscreenError({ error: 'boom', phase: 'start', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(sendResponse).not.toHaveBeenCalled();

  cleanup.resolve();
  await flushAsyncRoute();

  expectAcceptedLifecycleResponse(sendResponse);
});

it('uses the localized fallback when an offscreen start error has no detail', async () => {
  const sendResponse = createSendResponse();

  handleOffscreenError({ phase: 'start', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(expect.any(String), {
    recordingId: 'rec-1',
  });
  expect(notifyRecordingStartFailedMock).not.toHaveBeenCalledWith(undefined);
  expectAcceptedLifecycleResponse(sendResponse);
});

it('surfaces a runtime recording failure through the visible failure path', async () => {
  const sendResponse = createSendResponse();

  handleOffscreenError(
    { error: 'runtime failed', phase: 'runtime', recordingId: 'rec-1' },
    sendResponse
  );
  await flushAsyncRoute();

  expect(clearRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('rec-1');
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('runtime failed', {
    recordingId: 'rec-1',
  });
  expect(releaseVideoCaptureSurfaceMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expectAcceptedLifecycleResponse(sendResponse);
});

it('does not let delayed camera-grant cleanup for A fail current recording B', async () => {
  const sendResponse = createSendResponse();
  const cleanup = createDeferred();
  clearCameraRecorderControlGrantMock.mockReturnValueOnce(cleanup.promise);

  handleOffscreenError(
    { error: 'runtime failed', phase: 'runtime', recordingId: 'rec-1' },
    sendResponse
  );
  await flushAsyncRoute();
  getVideoRecordingIdMock.mockReturnValue('rec-2');
  cleanup.resolve();
  await flushAsyncRoute();

  expect(notifyRecordingStartFailedMock).not.toHaveBeenCalled();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expectAcceptedLifecycleResponse(sendResponse);
});

it('retains terminal cleanup authority until the matching camera grant is revoked', async () => {
  const sendResponse = createSendResponse();
  clearCameraRecorderControlGrantMock.mockRejectedValueOnce(new Error('grant remove failed'));

  handleOffscreenError(
    { error: 'runtime failed', phase: 'runtime', recordingId: 'rec-1' },
    sendResponse
  );
  await flushAsyncRoute();

  expect(sendResponse).toHaveBeenLastCalledWith({ success: false, error: 'Internal error' });
  expect(notifyRecordingStartFailedMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();

  clearCameraRecorderControlGrantMock.mockResolvedValueOnce(true);
  handleOffscreenError(
    { error: 'runtime failed', phase: 'runtime', recordingId: 'rec-1' },
    sendResponse
  );
  await flushAsyncRoute();
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('runtime failed', {
    recordingId: 'rec-1',
  });
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expectAcceptedLifecycleResponse(sendResponse);
});

it('releases the capture surface before resetting a stop-error session', async () => {
  const sendResponse = createSendResponse();

  handleOffscreenError({ error: 'stop failed', phase: 'stop', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(releaseVideoCaptureSurfaceMock).toHaveBeenCalledWith('rec-1');
  expect(releaseVideoCaptureSurfaceMock.mock.invocationCallOrder[0]).toBeLessThan(
    resetVideoRecordingRuntimeStateMock.mock.invocationCallOrder[0] ?? 0
  );
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledWith('rec-1');
  expect(resetRecordingTabIdMock).toHaveBeenCalledOnce();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expectAcceptedLifecycleResponse(sendResponse);
});

it('does not let delayed stop-error cleanup for A reset current recording B', async () => {
  const sendResponse = createSendResponse();
  const release = createDeferred();
  releaseVideoCaptureSurfaceMock.mockReturnValueOnce(release.promise);

  handleOffscreenError({ error: 'stop failed', phase: 'stop', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();
  getVideoRecordingIdMock.mockReturnValue('rec-2');
  release.resolve();
  await flushAsyncRoute();

  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expectAcceptedLifecycleResponse(sendResponse);
});

it('waits for saved-recording lease cleanup before acknowledging the lifecycle route', async () => {
  const sendResponse = createSendResponse();
  const cleanup = createDeferred();
  clearActiveVideoRecordingLeaseMock.mockReturnValueOnce(cleanup.promise);

  handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(sendResponse).not.toHaveBeenCalled();

  cleanup.resolve();
  await flushAsyncRoute();

  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expectAcceptedLifecycleResponse(sendResponse);
});

it('fails terminal lifecycle cleanup closed when capture-surface release reports an error', async () => {
  const sendResponse = createSendResponse();
  notifyRecordingStartFailedMock.mockRejectedValue(new Error('surface already gone'));

  handleOffscreenError(
    { error: 'start failed', phase: 'start', recordingId: 'rec-1' },
    sendResponse
  );
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: false, error: 'Internal error' });
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();

  vi.clearAllMocks();
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  releaseVideoCaptureSurfaceMock.mockRejectedValue(new Error('surface already gone'));
  handleOffscreenError(
    { error: 'runtime failed', phase: 'runtime', recordingId: 'rec-1' },
    sendResponse
  );
  await flushAsyncRoute();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: false, error: 'Internal error' });

  vi.clearAllMocks();
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  releaseVideoCaptureSurfaceMock.mockRejectedValue(new Error('surface already gone'));
  handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();
  expect(persistPendingVideoPostRecordResultMock).toHaveBeenCalledWith({
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  });
  expect(commitPendingVideoPostRecordResultMock).not.toHaveBeenCalled();
  expect(finalizeRecordingDiagnosticsMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: false, error: 'Internal error' });
});

it('restores the recording lease before accepting saved notifications after restart', async () => {
  const sendResponse = createSendResponse();
  getVideoRecordingIdMock.mockReturnValue(null);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(true);

  expect(
    handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse)
  ).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();

  expect(restoreCurrentRecordingFromLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(finalizeRecordingDiagnosticsMock).toHaveBeenCalledWith('rec-1');
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expectAcceptedLifecycleResponse(sendResponse);
});

it('stages a cold-worker completion without automatic editor navigation', async () => {
  const sendResponse = createSendResponse();
  let currentRecordingId: string | null = null;
  getVideoRecordingIdMock.mockImplementation(() => currentRecordingId);
  restoreCurrentRecordingFromLeaseMock.mockImplementationOnce(async () => {
    currentRecordingId = 'rec-cold-editor';
    return true;
  });

  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-cold-editor', recordingId: 'rec-cold-editor' },
    sendResponse
  );
  await flushAsyncRoute();

  expect(persistPendingVideoPostRecordResultMock).toHaveBeenCalledWith({
    primaryRecordingId: 'rec-cold-editor',
    projectId: null,
    recordingId: 'rec-cold-editor',
  });
  expect(commitPendingVideoPostRecordResultMock).toHaveBeenCalledWith('rec-cold-editor');
  expect(openVideoEditorPageMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);
});

it('ignores stale offscreen recording errors and saved notifications', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleOffscreenError({ error: 'old', phase: 'stop', recordingId: 'old-rec' }, sendResponse)
  ).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);

  handleVideoSavedToIdb({ primaryRecordingId: 'old-rec', recordingId: 'old-rec' }, sendResponse);
  await flushAsyncRoute();
  expect(finalizeRecordingDiagnosticsMock).not.toHaveBeenCalled();
  expect(openVideoEditorPageMock).not.toHaveBeenCalled();
  expectSupersededLifecycleResponse(sendResponse);
});

it('opens the video popup without navigating directly to the editor after save', async () => {
  const sendResponse = createSendResponse();

  getVideoRecordingIdMock.mockReturnValue('rec-2');
  expect(
    handleVideoSavedToIdb({ primaryRecordingId: 'rec-2', recordingId: 'rec-2' }, sendResponse)
  ).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(openVideoEditorPageMock).not.toHaveBeenCalled();
  expect(updateWindowMock).not.toHaveBeenCalled();
  expect(openPopupMock).toHaveBeenCalledWith({ windowId: 4 });
  expect(persistPendingVideoPostRecordResultMock).toHaveBeenCalledWith({
    primaryRecordingId: 'rec-2',
    projectId: null,
    recordingId: 'rec-2',
  });
  expect(commitPendingVideoPostRecordResultMock).toHaveBeenCalledWith('rec-2');
  expect(clearCameraRecorderControlGrantMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);

  getVideoRecordingIdMock.mockReturnValue('rec-3');
  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-3-window-1', projectId: 'project-1', recordingId: 'rec-3' },
    sendResponse
  );
  await flushAsyncRoute();
  expect(openVideoEditorPageMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);

  getVideoRecordingIdMock.mockReturnValue(null);
  handleVideoSavedToIdb({ primaryRecordingId: 'rec-4', recordingId: 'rec-4' }, sendResponse);
  await flushAsyncRoute();
  expect(openVideoEditorPageMock).not.toHaveBeenCalled();
  expectSupersededLifecycleResponse(sendResponse);
});

it('accepts a completed replay without requiring the original recording tab', async () => {
  const sendResponse = createSendResponse();
  getRecordingTabIdMock.mockReturnValue(null);
  readStoredVideoPostRecordResultMock.mockResolvedValue({
    acknowledgedBy: null,
    createdAt: 1,
    expiresAt: null,
    result: { primaryRecordingId: 'rec-1', projectId: null, recordingId: 'rec-1' },
    status: 'ready',
  });

  handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(openPopupMock).not.toHaveBeenCalled();
  expect(persistPendingVideoPostRecordResultMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);
});

it.each(['Cannot show popup for an inactive window.', 'Failed to open popup.'])(
  'focuses the recording window and retries the post-record popup after %s',
  async (errorMessage) => {
    const sendResponse = createSendResponse();
    openPopupMock.mockRejectedValueOnce(new Error(errorMessage)).mockResolvedValueOnce(undefined);

    handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse);
    await flushAsyncRoute();

    expect(updateWindowMock).toHaveBeenCalledWith(4, { focused: true });
    expect(openPopupMock).toHaveBeenNthCalledWith(1, { windowId: 4 });
    expect(openPopupMock).toHaveBeenNthCalledWith(2);
    expectAcceptedLifecycleResponse(sendResponse);
  }
);

it('keeps post-record completion accepted when the action popup activation retry is rejected', async () => {
  const sendResponse = createSendResponse();
  openPopupMock.mockRejectedValue(new Error('Failed to open popup.'));

  handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(openPopupMock).toHaveBeenNthCalledWith(1, { windowId: 4 });
  expect(openPopupMock).toHaveBeenNthCalledWith(2);
  expectAcceptedLifecycleResponse(sendResponse);
});

it('opens the post-record popup when persistence is already synchronized', async () => {
  const sendResponse = createSendResponse();
  persistPendingVideoPostRecordResultMock.mockResolvedValueOnce('acknowledged');

  handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(commitPendingVideoPostRecordResultMock).not.toHaveBeenCalled();
  expect(updateWindowMock).not.toHaveBeenCalled();
  expect(openPopupMock).toHaveBeenCalledWith({ windowId: 4 });
  expectAcceptedLifecycleResponse(sendResponse);
});
