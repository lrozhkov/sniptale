import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearActiveLeaseMock,
  getVideoRecordingIdMock,
  getVideoRecordingTabIdMock,
  logger,
  markTabClosedMock,
  releaseSurfaceMock,
  stopRecordingMock,
  waitForRecoveryMock,
} = vi.hoisted(() => ({
  clearActiveLeaseMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  markTabClosedMock: vi.fn(),
  releaseSurfaceMock: vi.fn(),
  waitForRecoveryMock: vi.fn(),
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => logger,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  getVideoRecordingId: getVideoRecordingIdMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
}));

vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  markVideoCaptureSurfaceTabClosed: markTabClosedMock,
  releaseVideoCaptureSurface: releaseSurfaceMock,
  waitForVideoCaptureSurfaceRecovery: waitForRecoveryMock,
}));

vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveLeaseMock,
}));

vi.mock('../controls.stop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controls.stop')>()),
  stopRecording: stopRecordingMock,
}));

import { handleTabClose } from './tab-close';

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveLeaseMock.mockResolvedValue(undefined);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  getVideoRecordingTabIdMock.mockReturnValue(7);
  releaseSurfaceMock.mockResolvedValue(undefined);
  stopRecordingMock.mockResolvedValue({ result: 'accepted' });
  waitForRecoveryMock.mockResolvedValue(undefined);
});

it('stops the recording when the active recording tab closes', async () => {
  await handleTabClose(3);
  await handleTabClose(7);

  expect(stopRecordingMock).toHaveBeenCalledTimes(1);
  expect(stopRecordingMock).toHaveBeenCalledWith(false);
  expect(markTabClosedMock).toHaveBeenCalledWith('recording-1', 7);
  expect(releaseSurfaceMock).not.toHaveBeenCalled();
  expect(clearActiveLeaseMock).not.toHaveBeenCalled();
  expect(logger.log).toHaveBeenCalledWith('Recording tab closed, stopping recording');
});

it('ignores unrelated tab close events', async () => {
  getVideoRecordingTabIdMock.mockReturnValue(9);

  await handleTabClose(7);

  expect(stopRecordingMock).not.toHaveBeenCalled();
});

it('retains durable recovery authority when offscreen stop is not accepted', async () => {
  stopRecordingMock.mockResolvedValueOnce({ error: 'offscreen unavailable', result: 'failed' });

  await expect(handleTabClose(7)).rejects.toThrow('offscreen unavailable');

  expect(releaseSurfaceMock).not.toHaveBeenCalled();
  expect(clearActiveLeaseMock).not.toHaveBeenCalled();
});
