import { beforeEach, expect, it, vi } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const {
  finishVideoRecordingStopMock,
  getVideoRecordingIdMock,
  resetVideoRecordingRuntimeStateMock,
  restoreCurrentRecordingFromLeaseMock,
  setVideoRecordingRuntimeStateMock,
} = vi.hoisted(() => ({
  finishVideoRecordingStopMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
}));

vi.mock('../../session-state/service/runtime-state-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state/service/runtime-state-service')>()),
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  getVideoRecordingId: getVideoRecordingIdMock,
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
}));

import {
  handleOffscreenRecordingPaused,
  handleOffscreenRecordingResumed,
  handleOffscreenRecordingStarted,
  handleOffscreenRecordingStopped,
  handleRecordingDurationUpdated,
} from './recording-state';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

function expectAsyncRoute(routeResult: unknown) {
  expect(routeResult).toEqual({ handled: true, keepChannelOpen: true });
}

function expectAcceptedLifecycleResponse(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'accepted' });
}

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
});

it('ignores stale and duplicate offscreen recording lifecycle events', async () => {
  const sendResponse = createSendResponse();

  expectAsyncRoute(handleOffscreenRecordingStarted({ recordingId: 'old-rec' }, sendResponse));
  await flushAsyncRoute();
  expectAcceptedLifecycleResponse(sendResponse);

  getVideoRecordingIdMock.mockReturnValue(null);
  expectAsyncRoute(handleOffscreenRecordingStopped({ recordingId: 'rec-1' }, sendResponse));
  await flushAsyncRoute();
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expectAcceptedLifecycleResponse(sendResponse);

  await expectStaleUpdateAccepted(
    handleRecordingDurationUpdated({ duration: 99, recordingId: 'rec-1' }, sendResponse),
    sendResponse
  );
  await expectStaleUpdateAccepted(
    handleOffscreenRecordingPaused({ recordingId: 'rec-1' }, sendResponse),
    sendResponse
  );
  await expectStaleUpdateAccepted(
    handleOffscreenRecordingResumed({ recordingId: 'rec-1' }, sendResponse),
    sendResponse
  );
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ status: VideoRecordingStatus.RECORDING })
  );
});

async function expectStaleUpdateAccepted(
  routeResult: unknown,
  sendResponse: ReturnType<typeof createSendResponse>
): Promise<void> {
  expectAsyncRoute(routeResult);
  await flushAsyncRoute();
  expectAcceptedLifecycleResponse(sendResponse);
}
