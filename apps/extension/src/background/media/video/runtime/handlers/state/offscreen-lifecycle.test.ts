import { beforeEach, expect, it, vi } from 'vitest';

const {
  finishVideoRecordingStopMock,
  finalizeRecordingDiagnosticsMock,
  getVideoRecordingIdMock,
  clearRecordingStartActivationWatchdogMock,
  markOffscreenDocumentReadyMock,
  notifyRecordingStartFailedMock,
  openVideoEditorPageMock,
  resetCompletedVideoRecordingSessionMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  sendRuntimeMessageMock,
  shouldOpenVideoEditorAfterRecordingMock,
  waitForStopSideEffectsMock,
  clearActiveVideoRecordingLeaseMock,
  restoreCurrentRecordingFromLeaseMock,
} = vi.hoisted(() => ({
  finishVideoRecordingStopMock: vi.fn(),
  finalizeRecordingDiagnosticsMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  clearRecordingStartActivationWatchdogMock: vi.fn(),
  markOffscreenDocumentReadyMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  openVideoEditorPageMock: vi.fn(),
  resetCompletedVideoRecordingSessionMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  shouldOpenVideoEditorAfterRecordingMock: vi.fn(),
  waitForStopSideEffectsMock: vi.fn(),
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
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
    resetCompletedVideoRecordingSession: resetCompletedVideoRecordingSessionMock,
    shouldOpenVideoEditorAfterRecording: shouldOpenVideoEditorAfterRecordingMock,
  };
});
vi.mock('../../../manager/start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../manager/start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: clearRecordingStartActivationWatchdogMock,
}));
vi.mock('../../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offscreen-manager')>()),
  markOffscreenDocumentReady: markOffscreenDocumentReadyMock,
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
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

beforeEach(() => {
  vi.clearAllMocks();
  markOffscreenDocumentReadyMock.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  openVideoEditorPageMock.mockResolvedValue(undefined);
  shouldOpenVideoEditorAfterRecordingMock.mockReturnValue(false);
  waitForStopSideEffectsMock.mockResolvedValue(undefined);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
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
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('boom');
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

  expect(handleVideoSavedToIdb({ recordingId: 'rec-1' }, sendResponse)).toEqual({
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
  expectAcceptedLifecycleResponse(sendResponse);
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

it('waits for saved-recording lease cleanup before acknowledging the lifecycle route', async () => {
  const sendResponse = createSendResponse();
  const cleanup = createDeferred();
  clearActiveVideoRecordingLeaseMock.mockReturnValueOnce(cleanup.promise);

  handleVideoSavedToIdb({ recordingId: 'rec-1' }, sendResponse);
  await flushAsyncRoute();

  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(sendResponse).not.toHaveBeenCalled();

  cleanup.resolve();
  await flushAsyncRoute();

  expectAcceptedLifecycleResponse(sendResponse);
});

it('restores the recording lease before accepting saved notifications after restart', async () => {
  const sendResponse = createSendResponse();
  getVideoRecordingIdMock.mockReturnValue(null);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(true);

  expect(handleVideoSavedToIdb({ recordingId: 'rec-1' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();

  expect(restoreCurrentRecordingFromLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(finalizeRecordingDiagnosticsMock).toHaveBeenCalledWith('rec-1');
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
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

  handleVideoSavedToIdb({ recordingId: 'old-rec' }, sendResponse);
  await flushAsyncRoute();
  expect(finalizeRecordingDiagnosticsMock).not.toHaveBeenCalled();
  expect(openVideoEditorPageMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);
});

it('opens the video editor only after a saved recording arrives with the open-editor flag', async () => {
  const sendResponse = createSendResponse();
  shouldOpenVideoEditorAfterRecordingMock.mockReturnValue(true);

  getVideoRecordingIdMock.mockReturnValue('rec-2');
  expect(handleVideoSavedToIdb({ recordingId: 'rec-2' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(openVideoEditorPageMock).toHaveBeenCalledWith(null, 'rec-2');
  expectAcceptedLifecycleResponse(sendResponse);

  getVideoRecordingIdMock.mockReturnValue('rec-3');
  handleVideoSavedToIdb({ projectId: 'project-1', recordingId: 'rec-3' }, sendResponse);
  await flushAsyncRoute();
  expect(openVideoEditorPageMock).toHaveBeenCalledWith('project-1', null);
  expectAcceptedLifecycleResponse(sendResponse);

  getVideoRecordingIdMock.mockReturnValue(null);
  handleVideoSavedToIdb({ recordingId: 'rec-4' }, sendResponse);
  await flushAsyncRoute();
  expect(openVideoEditorPageMock).toHaveBeenCalledTimes(2);
  expectAcceptedLifecycleResponse(sendResponse);
});
