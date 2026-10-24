import { beforeEach, expect, it, vi } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const {
  clearRecordingStartActivationWatchdogMock,
  getVideoRecordingIdMock,
  getVideoRecordingRuntimeStateMock,
  markVideoRecordingPreparationSettledMock,
  setControlledCursorDisplaySurfaceMock,
  setVideoRecordingRuntimeStateMock,
} = vi.hoisted(() => ({
  clearRecordingStartActivationWatchdogMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  getVideoRecordingRuntimeStateMock: vi.fn(),
  markVideoRecordingPreparationSettledMock: vi.fn(),
  setControlledCursorDisplaySurfaceMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
}));

vi.mock('../../session-state/service/runtime-state-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state/service/runtime-state-service')>()),
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  getVideoRecordingId: getVideoRecordingIdMock,
  isCurrentVideoRecordingId: (recordingId: string | null | undefined) =>
    recordingId != null && getVideoRecordingIdMock() === recordingId,
  markVideoRecordingPreparationSettled: markVideoRecordingPreparationSettledMock,
  setControlledCursorDisplaySurface: setControlledCursorDisplaySurfaceMock,
}));

vi.mock('../../../manager/start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../manager/start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: clearRecordingStartActivationWatchdogMock,
}));

vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  ensureVideoRecordingLeaseCache: vi.fn().mockResolvedValue(null),
}));

import { handleOffscreenRecordingStarted } from './recording-state';

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
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    duration: 0,
    liveMedia: {
      microphoneDeviceId: null,
      microphoneEnabled: false,
      microphoneSelected: false,
      webcamDeviceId: 'cam-1',
      webcamEnabled: true,
      webcamSelected: true,
    },
    status: VideoRecordingStatus.PREPARING,
  });
});

it('stores actual webcam settings from current recording started events', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleOffscreenRecordingStarted(
      {
        recordingId: 'rec-1',
        webcamSettings: { frameRate: 30, height: 720, width: 1280 },
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushAsyncRoute();
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' })
  );

  expect(clearRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('rec-1');
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    countdownEndsAt: null,
    displaySurface: null,
    error: null,
    liveMedia: expect.objectContaining({
      webcamSettings: { frameRate: 30, height: 720, width: 1280 },
    }),
    status: VideoRecordingStatus.RECORDING,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

vi.mock('../../recording-completion', async (original) => ({
  ...(await original<typeof import('../../recording-completion')>()),
  restoreCurrentRecordingFromLease: vi.fn().mockResolvedValue(false),
}));
