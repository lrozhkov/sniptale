import { beforeEach, expect, it, vi } from 'vitest';

vi.mock(
  '../../../../../composition/persistence/recordings/completion-outbox',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/recordings/completion-outbox')
    >()),
    removeVideoRecordingCompletionOutbox: vi.fn().mockResolvedValue(true),
  })
);

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
  ensureActiveVideoRecordingLeaseHydratedMock,
  clearCameraRecorderControlGrantMock,
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
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  clearCameraRecorderControlGrantMock: vi.fn(),
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
  isCurrentVideoRecordingId: (recordingId: string | null | undefined) =>
    recordingId != null && getVideoRecordingIdMock() === recordingId,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  markVideoRecordingPreparationSettled: markVideoRecordingPreparationSettledMock,
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
vi.mock('../../../../storage/video/post-record-result', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../storage/video/post-record-result')>()),
  clearPendingVideoPostRecordResult: vi.fn().mockResolvedValue(true),
  commitPendingVideoPostRecordResult: vi.fn().mockResolvedValue('ready'),
  persistPendingVideoPostRecordResult: vi.fn().mockResolvedValue('staged'),
  readPendingVideoPostRecordResult: vi.fn().mockResolvedValue(null),
  readStoredVideoPostRecordResult: vi.fn().mockResolvedValue(null),
}));
vi.mock('../camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../camera-recorder-control')>()),
  clearCameraRecorderControlGrant: clearCameraRecorderControlGrantMock,
}));

import { handleRecordingDurationUpdated, handleRecordingTabId } from './state/recording-state';
import { handleRecordingState } from './state/recording-state-response';
import {
  createUnhandledRouteResult,
  handleOffscreenError,
  handleOffscreenReady,
  handleVideoSavedToIdb,
} from './state/offscreen-lifecycle';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  captureSourceObtainedRouteDescriptor,
  offscreenLifecycleRouteDescriptor,
  projectExportLifecycleRouteDescriptor,
  videoRuntimeStateRouteDescriptor,
} from './state/route-descriptors';

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
  clearCameraRecorderControlGrantMock.mockResolvedValue(true);
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

it('declares every state and offscreen lifecycle route under its canonical authority', () => {
  expect(videoRuntimeStateRouteDescriptor).toMatchObject({
    authorityFamily: 'video-runtime-owner-policy',
    messageTypes: expect.arrayContaining([VideoMessageType.GET_RECORDING_STATE]),
    ownerModule: 'apps/extension/src/background/media/video/runtime/router.ts',
  });
  expect(offscreenLifecycleRouteDescriptor).toMatchObject({
    authorityFamily: 'offscreen-runtime-capability',
    messageTypes: expect.arrayContaining([
      VideoMessageType.OFFSCREEN_SOURCE_READY,
      VideoMessageType.VIDEO_SAVED_TO_IDB,
    ]),
  });
  expect(captureSourceObtainedRouteDescriptor.messageTypes).toEqual([
    VideoMessageType.CAPTURE_SOURCE_OBTAINED,
  ]);
  expect(projectExportLifecycleRouteDescriptor.messageTypes).toContain(
    VideoMessageType.PROJECT_EXPORT_COMPLETED
  );
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
    keepChannelOpen: true,
  });
  await flushAsyncRoute();
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
  expect(
    handleVideoSavedToIdb({ primaryRecordingId: 'rec-1', recordingId: 'rec-1' }, sendResponse)
  ).toEqual({
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
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('boom', {
    recordingId: 'rec-1',
  });
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
