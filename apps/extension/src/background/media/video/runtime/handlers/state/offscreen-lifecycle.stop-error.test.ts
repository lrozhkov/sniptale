import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearActiveVideoRecordingLeaseMock,
  finishVideoRecordingStopMock,
  getVideoRecordingIdMock,
  resetCompletedVideoRecordingSessionMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  restoreCurrentRecordingFromLeaseMock,
  releaseVideoCaptureSurfaceMock,
} = vi.hoisted(() => ({
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  finishVideoRecordingStopMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  resetCompletedVideoRecordingSessionMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  restoreCurrentRecordingFromLeaseMock: vi.fn(),
  releaseVideoCaptureSurfaceMock: vi.fn(),
}));

vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
}));
vi.mock('../../manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager')>()),
  resetRecordingTabId: resetRecordingTabIdMock,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  getVideoRecordingId: getVideoRecordingIdMock,
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

import { handleOffscreenError } from './offscreen-lifecycle';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
  releaseVideoCaptureSurfaceMock.mockResolvedValue(undefined);
});

it('clears completed session state for current stop-phase offscreen errors', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleOffscreenError(
      { error: 'stop failed', phase: 'stop', recordingId: 'rec-1' },
      sendResponse
    )
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
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'accepted' });
});
