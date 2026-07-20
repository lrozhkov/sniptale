import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const {
  finalizeRecordingDiagnosticsMock,
  finishVideoRecordingStopMock,
  clearRecordingStartActivationWatchdogMock,
  getVideoRecordingIdMock,
  getVideoRecordingRuntimeStateMock,
  getVideoRecordingTabIdMock,
  markVideoRecordingPreparationSettledMock,
  notifyRecordingStartFailedMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  sendRuntimeMessageMock,
  setVideoRecordingRuntimeStateMock,
  shouldOpenVideoEditorAfterRecordingMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  restoreCurrentRecordingFromLeaseMock,
  translateMock,
} = vi.hoisted(() => ({
  finalizeRecordingDiagnosticsMock: vi.fn(),
  finishVideoRecordingStopMock: vi.fn(),
  clearRecordingStartActivationWatchdogMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  getVideoRecordingRuntimeStateMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  markVideoRecordingPreparationSettledMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
  shouldOpenVideoEditorAfterRecordingMock: vi.fn(() => false),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
  translateMock: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('@sniptale/platform/browser/downloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/downloads')>()),
  browserDownloads: { download: vi.fn() },
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  getErrorMessage: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../composition/persistence/settings')>()),
  loadSettings: vi.fn(),
}));

vi.mock('../../../../../capture/download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../capture/download/download-router')>()),
  buildDownloadFilename: vi.fn(),
  resolvePresetPath: vi.fn(),
}));

vi.mock('../../session-state/service/runtime-state-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state/service/runtime-state-service')>()),
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));

vi.mock('../../manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager')>()),
  finalizeRecordingDiagnostics: finalizeRecordingDiagnosticsMock,
  notifyRecordingStartFailed: notifyRecordingStartFailedMock,
  resetRecordingTabId: resetRecordingTabIdMock,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  getVideoRecordingId: getVideoRecordingIdMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  markVideoRecordingPreparationSettled: markVideoRecordingPreparationSettledMock,
  shouldOpenVideoEditorAfterRecording: shouldOpenVideoEditorAfterRecordingMock,
}));

vi.mock('../../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offscreen-manager')>()),
  ensureOffscreenDocument: vi.fn(),
  hasOffscreenDocument: vi.fn(),
  markOffscreenDocumentReady: vi.fn(),
  waitForOffscreenReady: vi.fn(),
}));
vi.mock('../../../manager/start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../manager/start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: clearRecordingStartActivationWatchdogMock,
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  ensureActiveVideoRecordingLeaseHydrated: ensureActiveVideoRecordingLeaseHydratedMock,
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
}));

import {
  handleInternalVideoSignal,
  handleOffscreenRecordingPaused,
  handleOffscreenRecordingResumed,
  handleOffscreenRecordingStarted,
  handleOffscreenRecordingStopped,
  handleProjectExportLifecycleMessage,
  handleRecordingDurationUpdated,
  handleRecordingState,
  handleRecordingTabId,
  handleVideoSavedToIdb,
} from './index';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

function expectAcceptedLifecycleResponse(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'accepted' });
}

function resetStateFlowMocks() {
  vi.clearAllMocks();
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    status: VideoRecordingStatus.IDLE,
    duration: 0,
  });
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  getVideoRecordingTabIdMock.mockReturnValue(17);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
}

function verifyRecordingTabIdLifecycle(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(handleRecordingTabId(sendResponse, 17)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    isCurrentTab: true,
    tabId: 17,
  });

  handleRecordingTabId(sendResponse, 22);
  expect(sendResponse).toHaveBeenLastCalledWith({
    success: true,
    isCurrentTab: false,
    tabId: 17,
  });
}

async function verifyRecordingStartStopLifecycle(
  sendResponse: ReturnType<typeof createSendResponse>
) {
  expect(
    handleRecordingDurationUpdated({ duration: 12, recordingId: 'rec-1' }, sendResponse)
  ).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({ duration: 12 });
  expectAcceptedLifecycleResponse(sendResponse);

  setVideoRecordingRuntimeStateMock.mockClear();
  handleRecordingDurationUpdated({}, sendResponse);
  await flushAsyncRoute();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);

  expect(handleOffscreenRecordingStarted({ recordingId: 'rec-1' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(clearRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('rec-1');
  expect(markVideoRecordingPreparationSettledMock).toHaveBeenCalledTimes(1);
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    status: VideoRecordingStatus.RECORDING,
    countdownEndsAt: null,
    error: null,
  });
  expectAcceptedLifecycleResponse(sendResponse);

  expect(handleOffscreenRecordingStopped({ recordingId: 'rec-1' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(finishVideoRecordingStopMock).toHaveBeenCalledTimes(1);
  expect(resetRecordingTabIdMock).toHaveBeenCalledTimes(1);
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledTimes(1);
  expectAcceptedLifecycleResponse(sendResponse);
}

async function verifyRecordingPauseResumeLifecycle(
  sendResponse: ReturnType<typeof createSendResponse>
) {
  expect(handleOffscreenRecordingPaused({ recordingId: 'rec-1' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    status: VideoRecordingStatus.PAUSED,
  });
  expectAcceptedLifecycleResponse(sendResponse);

  expect(handleOffscreenRecordingResumed({ recordingId: 'rec-1' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    status: VideoRecordingStatus.RECORDING,
  });
  expectAcceptedLifecycleResponse(sendResponse);
}

async function verifyRecordingStateLifecycle(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(handleRecordingState(sendResponse)).toEqual({ handled: true, keepChannelOpen: true });
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenCalledWith({
    recordingHealth: 'healthy',
    success: true,
    state: {
      status: VideoRecordingStatus.IDLE,
      duration: 0,
    },
  });
  verifyRecordingTabIdLifecycle(sendResponse);
  await verifyRecordingStartStopLifecycle(sendResponse);
  await verifyRecordingPauseResumeLifecycle(sendResponse);
}

async function verifyRuntimeSignalAcks(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(handleVideoSavedToIdb({ recordingId: 'rec-1' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  await vi.waitFor(() => expect(finalizeRecordingDiagnosticsMock).toHaveBeenCalledWith('rec-1'));
  expectAcceptedLifecycleResponse(sendResponse);

  expect(handleInternalVideoSignal(sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });

  expect(
    handleProjectExportLifecycleMessage(
      {
        type: 'PROJECT_EXPORT_CANCELLED',
        jobId: 'job-1',
        targetDocumentId: 'editor-doc-1',
        targetSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
      },
      sendResponse
    )
  ).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

async function verifiesSyncStateMutations() {
  const sendResponse = createSendResponse();

  await verifyRecordingStateLifecycle(sendResponse);
  await verifyRuntimeSignalAcks(sendResponse);
}

describe('video-runtime-router-handlers state flows', () => {
  beforeEach(resetStateFlowMocks);

  it('routes sync state mutations and passthrough lifecycle handlers', verifiesSyncStateMutations);
});
