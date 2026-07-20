import { beforeEach, expect, it, vi } from 'vitest';

const {
  finalizeRecordingDiagnosticsMock,
  finishVideoRecordingStopMock,
  clearRecordingStartActivationWatchdogMock,
  getVideoRecordingIdMock,
  getVideoRecordingRuntimeStateMock,
  getVideoRecordingTabIdMock,
  markVideoRecordingPreparationSettledMock,
  markOffscreenDocumentReadyMock,
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
  markOffscreenDocumentReadyMock: vi.fn(),
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

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: translateMock,
}));
vi.mock('../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('@sniptale/platform/browser/downloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/downloads')>()),
  browserDownloads: { download: vi.fn() },
}));
vi.mock('../../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../composition/persistence/settings')>()),

  loadSettings: vi.fn(),
}));
vi.mock('../../../../capture/download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../capture/download/download-router')>()),
  buildDownloadFilename: vi.fn(),
  resolvePresetPath: vi.fn(),
}));
vi.mock('../session-state/service/runtime-state-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state/service/runtime-state-service')>()),
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));
vi.mock('../manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../manager')>()),
  finalizeRecordingDiagnostics: finalizeRecordingDiagnosticsMock,
  notifyRecordingStartFailed: notifyRecordingStartFailedMock,
  resetRecordingTabId: resetRecordingTabIdMock,
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  getVideoRecordingId: getVideoRecordingIdMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  markVideoRecordingPreparationSettled: markVideoRecordingPreparationSettledMock,
  shouldOpenVideoEditorAfterRecording: shouldOpenVideoEditorAfterRecordingMock,
}));
vi.mock('../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offscreen-manager')>()),
  ensureOffscreenDocument: vi.fn(),
  hasOffscreenDocument: vi.fn(),
  markOffscreenDocumentReady: markOffscreenDocumentReadyMock,
  waitForOffscreenReady: vi.fn(),
}));
vi.mock('../../manager/start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager/start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: clearRecordingStartActivationWatchdogMock,
}));
vi.mock('../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording-control-lease')>()),
  ensureActiveVideoRecordingLeaseHydrated: ensureActiveVideoRecordingLeaseHydratedMock,
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
}));

import {
  createUnhandledRouteResult,
  handleOffscreenError,
  handleOffscreenReady,
  handleRecordingDurationUpdated,
  handleRecordingState,
  handleRecordingTabId,
  handleVideoSavedToIdb,
} from './state';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

async function expectAcceptedLifecycleResponse(
  sendResponse: ReturnType<typeof createSendResponse>
): Promise<void> {
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'accepted' })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  markOffscreenDocumentReadyMock.mockReturnValue(true);
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    status: VideoRecordingStatus.IDLE,
    duration: 0,
  });
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  getVideoRecordingTabIdMock.mockReturnValue(17);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

it('handles recording state and tab routes through the state owner', async () => {
  const sendResponse = createSendResponse();

  expect(handleRecordingState(sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(sendResponse).toHaveBeenCalledWith({
    recordingHealth: 'healthy',
    success: true,
    state: { status: VideoRecordingStatus.IDLE, duration: 0 },
  });

  expect(handleRecordingTabId(sendResponse, 17)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(
    handleRecordingDurationUpdated({ duration: 12, recordingId: 'rec-1' }, sendResponse)
  ).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({ duration: 12 });
  await expectAcceptedLifecycleResponse(sendResponse);
});

it('handles offscreen lifecycle routes through the state owner', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleOffscreenReady(
      { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(markOffscreenDocumentReadyMock).toHaveBeenCalledWith('startup-1');
  expect(handleVideoSavedToIdb({ recordingId: 'rec-1' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  await vi.waitFor(() => expect(finalizeRecordingDiagnosticsMock).toHaveBeenCalledWith('rec-1'));
  expect(finalizeRecordingDiagnosticsMock).toHaveBeenCalledWith('rec-1');
  await expectAcceptedLifecycleResponse(sendResponse);
  vi.clearAllMocks();

  expect(
    handleOffscreenError({ error: 'boom', phase: 'start', recordingId: 'rec-1' }, sendResponse)
  ).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(clearRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('rec-1');
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('boom');
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  await expectAcceptedLifecycleResponse(sendResponse);

  expect(handleOffscreenError({ error: 'export-boom', phase: 'export' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  await expectAcceptedLifecycleResponse(sendResponse);

  expect(createUnhandledRouteResult()).toEqual({
    handled: false,
    keepChannelOpen: false,
  });
});
