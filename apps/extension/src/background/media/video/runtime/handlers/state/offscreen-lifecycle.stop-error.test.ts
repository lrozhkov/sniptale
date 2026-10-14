import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearActiveVideoRecordingLeaseMock,
  clearCameraRecorderControlGrantMock,
  finishVideoRecordingStopMock,
  getVideoRecordingIdMock,
  resetCompletedVideoRecordingSessionMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  restoreCurrentRecordingFromLeaseMock,
  releaseVideoCaptureSurfaceMock,
} = vi.hoisted(() => ({
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  clearCameraRecorderControlGrantMock: vi.fn(),
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
  isCurrentVideoRecordingId: (recordingId: string | null | undefined) =>
    recordingId != null && getVideoRecordingIdMock() === recordingId,
  resetCompletedVideoRecordingSession: resetCompletedVideoRecordingSessionMock,
}));
vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
}));
vi.mock('../../camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../camera-recorder-control')>()),
  clearCameraRecorderControlGrant: clearCameraRecorderControlGrantMock,
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
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  restoreCurrentRecordingFromLeaseMock.mockResolvedValue(false);
  releaseVideoCaptureSurfaceMock.mockResolvedValue(undefined);
  clearCameraRecorderControlGrantMock.mockResolvedValue(true);
});

it('retains authority when a stop error has no recoverable source binding', async () => {
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

  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
  expect(resetCompletedVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(resetRecordingTabIdMock).not.toHaveBeenCalled();
  expect(resetVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(clearCameraRecorderControlGrantMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: false, error: 'Internal error' });
});

vi.mock('../../recording-completion', async (original) => ({
  ...(await original<typeof import('../../recording-completion')>()),
  restoreCurrentRecordingFromLease: restoreCurrentRecordingFromLeaseMock,
}));
