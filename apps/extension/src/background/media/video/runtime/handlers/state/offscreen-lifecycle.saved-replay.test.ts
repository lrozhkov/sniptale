import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearActiveVideoRecordingLeaseMock,
  finishVideoRecordingStopMock,
  finalizeRecordingDiagnosticsMock,
  getVideoRecordingIdMock,
  loadActiveProjectExportJobLedgerEntryMock,
  markOffscreenDocumentReadyMock,
  resetCompletedVideoRecordingSessionMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  sendRuntimeMessageMock,
  restoreCurrentRecordingFromLeaseMock,
} = vi.hoisted(() => ({
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  finishVideoRecordingStopMock: vi.fn(),
  finalizeRecordingDiagnosticsMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  loadActiveProjectExportJobLedgerEntryMock: vi.fn(),
  markOffscreenDocumentReadyMock: vi.fn(),
  resetCompletedVideoRecordingSessionMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
}));

vi.mock('@sniptale/foundation/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/best-effort')>()),
  runBestEffort: vi.fn(),
}));
vi.mock('../../../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../platform/navigation/extension-pages')
  >()),
  openVideoEditorPage: vi.fn(),
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({ error: vi.fn(), log: vi.fn(), warn: vi.fn() })),
}));
vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../../../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/export-ledger')
  >()),
  loadActiveProjectExportJobLedgerEntry: loadActiveProjectExportJobLedgerEntryMock,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  getVideoRecordingId: getVideoRecordingIdMock,
  resetCompletedVideoRecordingSession: resetCompletedVideoRecordingSessionMock,
  shouldOpenVideoEditorAfterRecording: vi.fn(() => false),
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
}));
vi.mock('../../manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager')>()),
  finalizeRecordingDiagnostics: finalizeRecordingDiagnosticsMock,
  notifyRecordingStartFailed: vi.fn(),
  resetRecordingTabId: resetRecordingTabIdMock,
}));
vi.mock('../../manager/controls.stop/effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager/controls.stop/effects')>()),
  waitForStopSideEffects: vi.fn(),
}));
vi.mock('../../../manager/start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../manager/start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: vi.fn(),
}));
vi.mock('../../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offscreen-manager')>()),
  markOffscreenDocumentReady: markOffscreenDocumentReadyMock,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createUnhandledRouteResult,
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

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingIdMock.mockReturnValue('rec-saved-replay');
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
  clearActiveVideoRecordingLeaseMock.mockResolvedValue(undefined);
  loadActiveProjectExportJobLedgerEntryMock.mockResolvedValue({
    abortController: new AbortController(),
    jobId: 'job-1',
    ownerDocumentId: 'editor-doc-1',
    ownerSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
    projectId: 'project-1',
    source: 'editor',
    startedAt: 1,
  });
  markOffscreenDocumentReadyMock.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

it('deduplicates replayed saved-recording notifications while cleanup is pending', async () => {
  const firstResponse = createSendResponse();
  const replayResponse = createSendResponse();
  const cleanup = createDeferred();
  clearActiveVideoRecordingLeaseMock.mockReturnValueOnce(cleanup.promise);

  handleVideoSavedToIdb({ recordingId: 'rec-saved-replay' }, firstResponse);
  await flushAsyncRoute();
  handleVideoSavedToIdb({ recordingId: 'rec-saved-replay' }, replayResponse);
  await flushAsyncRoute();

  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledOnce();
  expect(resetRecordingTabIdMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledOnce();
  expect(firstResponse).not.toHaveBeenCalled();
  expect(replayResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });

  cleanup.resolve();
  await flushAsyncRoute();

  expect(firstResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('releases saved-recording processing after a stale notification is ignored', async () => {
  const staleResponse = createSendResponse();
  const validResponse = createSendResponse();
  getVideoRecordingIdMock.mockReturnValueOnce('current-rec').mockReturnValueOnce('rec-after-stale');

  handleVideoSavedToIdb({ recordingId: 'old-rec' }, staleResponse);
  await flushAsyncRoute();
  handleVideoSavedToIdb({ recordingId: 'rec-after-stale' }, validResponse);
  await flushAsyncRoute();

  expect(restoreCurrentRecordingFromLeaseMock).toHaveBeenCalledWith('old-rec');
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledWith('rec-after-stale');
  expect(staleResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(validResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('covers adjacent lifecycle routes used by the saved-recording owner module', async () => {
  const readyResponse = createSendResponse();
  const exportResponse = createSendResponse();

  expect(
    handleOffscreenReady(
      { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
      readyResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(
    handleProjectExportLifecycleMessage(
      {
        type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
        jobId: 'job-1',
        status: { message: 'Rendering', phase: 'RENDERING', progress: 25 },
      },
      exportResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushAsyncRoute();

  expect(markOffscreenDocumentReadyMock).toHaveBeenCalledWith('startup-1');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
    jobId: 'job-1',
    status: { message: 'Rendering', phase: 'RENDERING', progress: 25 },
    targetDocumentId: 'editor-doc-1',
    targetSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
  });
  expect(createUnhandledRouteResult()).toEqual({ handled: false, keepChannelOpen: false });
});
