import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearActiveVideoRecordingLeaseMock,
  finishVideoRecordingStopMock,
  finalizeRecordingDiagnosticsMock,
  getVideoRecordingIdMock,
  loadActiveProjectExportJobLedgerEntryMock,
  markOffscreenDocumentReadyMock,
  openVideoEditorPageMock,
  resetCompletedVideoRecordingSessionMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  sendRuntimeMessageMock,
  restoreCurrentRecordingFromLeaseMock,
  releaseVideoCaptureSurfaceMock,
  commitPendingVideoPostRecordResultMock,
  persistPendingVideoPostRecordResultMock,
  readStoredVideoPostRecordResultMock,
  removeVideoRecordingCompletionOutboxMock,
} = vi.hoisted(() => ({
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  finishVideoRecordingStopMock: vi.fn(),
  finalizeRecordingDiagnosticsMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  loadActiveProjectExportJobLedgerEntryMock: vi.fn(),
  markOffscreenDocumentReadyMock: vi.fn(),
  openVideoEditorPageMock: vi.fn(),
  resetCompletedVideoRecordingSessionMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
  releaseVideoCaptureSurfaceMock: vi.fn(),
  commitPendingVideoPostRecordResultMock: vi.fn(),
  persistPendingVideoPostRecordResultMock: vi.fn(),
  readStoredVideoPostRecordResultMock: vi.fn(),
  removeVideoRecordingCompletionOutboxMock: vi.fn(),
}));

vi.mock(
  '../../../../../../composition/persistence/recordings/completion-outbox',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../../composition/persistence/recordings/completion-outbox')
    >()),
    removeVideoRecordingCompletionOutbox: removeVideoRecordingCompletionOutboxMock,
  })
);

vi.mock('../../../../../storage/video/post-record-result', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../storage/video/post-record-result')>()),
  clearPendingVideoPostRecordResult: vi.fn(),
  commitPendingVideoPostRecordResult: commitPendingVideoPostRecordResultMock,
  persistPendingVideoPostRecordResult: persistPendingVideoPostRecordResultMock,
  readStoredVideoPostRecordResult: readStoredVideoPostRecordResultMock,
}));

vi.mock('@sniptale/foundation/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/best-effort')>()),
  runBestEffort: vi.fn(),
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
  isCurrentVideoRecordingId: (recordingId: string | null | undefined) =>
    recordingId != null && getVideoRecordingIdMock() === recordingId,
  resetCompletedVideoRecordingSession: resetCompletedVideoRecordingSessionMock,
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
vi.mock('../../../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../offscreen-document/service')>()),
  markOffscreenDocumentReady: markOffscreenDocumentReadyMock,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { reserveMediaErasureExclusion } from '../../../../../mutation-exclusion/media-activity';
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
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  releaseVideoCaptureSurfaceMock.mockResolvedValue(undefined);
  commitPendingVideoPostRecordResultMock.mockResolvedValue('ready');
  persistPendingVideoPostRecordResultMock.mockResolvedValue('staged');
  readStoredVideoPostRecordResultMock.mockResolvedValue(null);
  removeVideoRecordingCompletionOutboxMock.mockResolvedValue(true);
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

  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-saved-replay', recordingId: 'rec-saved-replay' },
    firstResponse
  );
  await flushAsyncRoute();
  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-saved-replay', recordingId: 'rec-saved-replay' },
    replayResponse
  );
  await flushAsyncRoute();

  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledOnce();
  expect(firstResponse).not.toHaveBeenCalled();
  expect(replayResponse).not.toHaveBeenCalled();

  cleanup.resolve();
  await flushAsyncRoute();

  expect(commitPendingVideoPostRecordResultMock).toHaveBeenCalledOnce();
  expect(removeVideoRecordingCompletionOutboxMock).toHaveBeenCalledWith({
    primaryRecordingId: 'rec-saved-replay',
    projectId: null,
    recordingId: 'rec-saved-replay',
  });
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledOnce();
  expect(firstResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(replayResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('replays a ready receipt when outbox consumption was interrupted before acknowledgement', async () => {
  const firstResponse = createSendResponse();
  const replayResponse = createSendResponse();
  removeVideoRecordingCompletionOutboxMock.mockRejectedValueOnce(
    new Error('background terminated')
  );

  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-saved-replay', recordingId: 'rec-saved-replay' },
    firstResponse
  );
  await vi.waitFor(() =>
    expect(firstResponse).toHaveBeenCalledWith({ success: false, error: 'Internal error' })
  );
  expect(commitPendingVideoPostRecordResultMock).toHaveBeenCalledOnce();
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();

  readStoredVideoPostRecordResultMock.mockResolvedValueOnce({
    acknowledgedBy: null,
    createdAt: 1,
    expiresAt: null,
    result: {
      primaryRecordingId: 'rec-saved-replay',
      projectId: null,
      recordingId: 'rec-saved-replay',
    },
    status: 'ready',
  });
  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-saved-replay', recordingId: 'rec-saved-replay' },
    replayResponse
  );
  await vi.waitFor(() =>
    expect(replayResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' })
  );

  expect(removeVideoRecordingCompletionOutboxMock).toHaveBeenCalledTimes(2);
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
});

it('never shares an accepted in-flight outcome with a conflicting result tuple', async () => {
  const firstResponse = createSendResponse();
  const conflictingResponse = createSendResponse();
  const cleanup = createDeferred();
  clearActiveVideoRecordingLeaseMock.mockReturnValueOnce(cleanup.promise);

  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-saved-replay', recordingId: 'rec-saved-replay' },
    firstResponse
  );
  await vi.waitFor(() => expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledOnce());
  handleVideoSavedToIdb(
    { primaryRecordingId: 'forged-primary', recordingId: 'rec-saved-replay' },
    conflictingResponse
  );
  await flushAsyncRoute();

  expect(conflictingResponse).toHaveBeenCalledWith({ success: true, result: 'superseded' });
  expect(persistPendingVideoPostRecordResultMock).toHaveBeenCalledOnce();

  cleanup.resolve();
  await flushAsyncRoute();
  expect(firstResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('releases saved-recording processing after a stale notification is ignored', async () => {
  const staleResponse = createSendResponse();
  const validResponse = createSendResponse();
  getVideoRecordingIdMock.mockReturnValueOnce('current-rec').mockReturnValue('rec-after-stale');

  handleVideoSavedToIdb({ primaryRecordingId: 'old-rec', recordingId: 'old-rec' }, staleResponse);
  await flushAsyncRoute();
  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-after-stale', recordingId: 'rec-after-stale' },
    validResponse
  );
  await flushAsyncRoute();

  expect(restoreCurrentRecordingFromLeaseMock).toHaveBeenCalledWith('old-rec');
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
  expect(resetCompletedVideoRecordingSessionMock).toHaveBeenCalledWith('rec-after-stale');
  expect(staleResponse).toHaveBeenCalledWith({ success: true, result: 'superseded' });
  expect(validResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('denies saved-recording completion when an expired lease cannot restore authority', async () => {
  const response = createSendResponse();
  getVideoRecordingIdMock.mockReturnValue(null);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);

  handleVideoSavedToIdb(
    { primaryRecordingId: 'expired-rec', recordingId: 'expired-rec' },
    response
  );
  await flushAsyncRoute();

  expect(restoreCurrentRecordingFromLeaseMock).toHaveBeenCalledWith('expired-rec');
  expect(persistPendingVideoPostRecordResultMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(response).toHaveBeenCalledWith({ success: true, result: 'superseded' });
});

it('uses an exact staged record as restart-safe cleanup retry authority', async () => {
  const response = createSendResponse();
  getVideoRecordingIdMock.mockReturnValue(null);
  readStoredVideoPostRecordResultMock.mockResolvedValue({
    createdAt: 1,
    expiresAt: Date.now() + 1_000,
    result: {
      primaryRecordingId: 'rec-saved-replay',
      projectId: null,
      recordingId: 'rec-saved-replay',
    },
    status: 'staged',
  });

  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-saved-replay', recordingId: 'rec-saved-replay' },
    response
  );
  await flushAsyncRoute();

  expect(restoreCurrentRecordingFromLeaseMock).not.toHaveBeenCalled();
  expect(releaseVideoCaptureSurfaceMock).toHaveBeenCalledWith('rec-saved-replay');
  expect(commitPendingVideoPostRecordResultMock).toHaveBeenCalledWith('rec-saved-replay');
  expect(response).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('commits staged recording A without reading or resetting newer recording B state', async () => {
  const response = createSendResponse();
  getVideoRecordingIdMock.mockReturnValue('rec-b');
  readStoredVideoPostRecordResultMock.mockResolvedValue({
    acknowledgedBy: null,
    createdAt: 1,
    expiresAt: Date.now() + 1_000,
    result: {
      primaryRecordingId: 'rec-a',
      projectId: null,
      recordingId: 'rec-a',
    },
    status: 'staged',
  });

  handleVideoSavedToIdb({ primaryRecordingId: 'rec-a', recordingId: 'rec-a' }, response);
  await flushAsyncRoute();

  expect(commitPendingVideoPostRecordResultMock).toHaveBeenCalledWith('rec-a');
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-a');
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(openVideoEditorPageMock).not.toHaveBeenCalled();
  expect(finalizeRecordingDiagnosticsMock).toHaveBeenCalledWith('rec-a');
  expect(response).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('does not reset recording B when it becomes current during delayed A cleanup', async () => {
  const response = createSendResponse();
  const releaseSurface = createDeferred();
  let currentRecordingId = 'rec-a';
  getVideoRecordingIdMock.mockImplementation(() => currentRecordingId);
  releaseVideoCaptureSurfaceMock.mockReturnValueOnce(releaseSurface.promise);

  handleVideoSavedToIdb({ primaryRecordingId: 'rec-a', recordingId: 'rec-a' }, response);
  await vi.waitFor(() => expect(releaseVideoCaptureSurfaceMock).toHaveBeenCalledWith('rec-a'));
  currentRecordingId = 'rec-b';
  releaseSurface.resolve();
  await vi.waitFor(() =>
    expect(response).toHaveBeenCalledWith({ success: true, result: 'accepted' })
  );

  expect(commitPendingVideoPostRecordResultMock).toHaveBeenCalledWith('rec-a');
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(openVideoEditorPageMock).not.toHaveBeenCalled();
  expect(finalizeRecordingDiagnosticsMock).toHaveBeenCalledWith('rec-a');
});

it.each(['ready', 'acknowledged'] as const)(
  'accepts an exact %s replay without republishing or rerunning cleanup',
  async (status) => {
    const response = createSendResponse();
    getVideoRecordingIdMock.mockReturnValue(null);
    readStoredVideoPostRecordResultMock.mockResolvedValue({
      createdAt: 1,
      expiresAt: Date.now() + 1_000,
      result: {
        primaryRecordingId: 'rec-saved-replay',
        projectId: null,
        recordingId: 'rec-saved-replay',
      },
      status,
    });

    handleVideoSavedToIdb(
      { primaryRecordingId: 'rec-saved-replay', recordingId: 'rec-saved-replay' },
      response
    );
    await flushAsyncRoute();

    expect(restoreCurrentRecordingFromLeaseMock).not.toHaveBeenCalled();
    expect(persistPendingVideoPostRecordResultMock).not.toHaveBeenCalled();
    expect(releaseVideoCaptureSurfaceMock).not.toHaveBeenCalled();
    expect(response).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  }
);

it('holds the media exclusion across delayed saved-result completion and rejects later work', async () => {
  const firstResponse = createSendResponse();
  const blockedResponse = createSendResponse();
  let resolveRead!: (value: null) => void;
  readStoredVideoPostRecordResultMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveRead = resolve;
    })
  );

  handleVideoSavedToIdb(
    { primaryRecordingId: 'rec-saved-replay', recordingId: 'rec-saved-replay' },
    firstResponse
  );
  await vi.waitFor(() => expect(readStoredVideoPostRecordResultMock).toHaveBeenCalledOnce());
  const exclusion = reserveMediaErasureExclusion();
  let erasureAdmitted = false;
  const waitForActive = exclusion.waitForActiveMutations().then(() => {
    erasureAdmitted = true;
  });
  await Promise.resolve();
  expect(erasureAdmitted).toBe(false);

  handleVideoSavedToIdb(
    { primaryRecordingId: 'blocked-rec', recordingId: 'blocked-rec' },
    blockedResponse
  );
  await flushAsyncRoute();
  expect(readStoredVideoPostRecordResultMock).toHaveBeenCalledOnce();
  expect(blockedResponse).toHaveBeenCalledWith({ success: true, result: 'discarded' });

  resolveRead(null);
  await flushAsyncRoute();
  await waitForActive;
  expect(erasureAdmitted).toBe(true);
  expect(firstResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  exclusion.release();
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
