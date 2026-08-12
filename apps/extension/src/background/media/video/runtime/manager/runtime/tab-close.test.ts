import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearActiveLeaseMock,
  getVideoRecordingIdMock,
  getVideoRecordingTabIdMock,
  hydrateSurfaceMock,
  logger,
  markTabClosedMock,
  releaseSurfaceMock,
  releaseVideoSurfaceMock,
  stopRecordingMock,
  waitForRecoveryMock,
  closeCameraPeerMock,
  surfaceState,
} = vi.hoisted(() => ({
  clearActiveLeaseMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  hydrateSurfaceMock: vi.fn(),
  markTabClosedMock: vi.fn(),
  releaseSurfaceMock: vi.fn(),
  releaseVideoSurfaceMock: vi.fn(),
  waitForRecoveryMock: vi.fn(),
  closeCameraPeerMock: vi.fn(),
  surfaceState: { current: null as null | { tabId: number } },
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
vi.mock('../../../content-surface/surface-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content-surface/surface-lease')>()),
  ensureVideoRecordingSurfaceLeaseHydrated: hydrateSurfaceMock,
  getVideoRecordingSurfaceLeaseSnapshot: () => surfaceState.current,
  releaseVideoRecordingSurface: releaseVideoSurfaceMock,
}));
vi.mock('../../../content-surface/camera-peer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content-surface/camera-peer')>()),
  closeVideoRecordingCameraPeerForLease: closeCameraPeerMock,
}));

import { handleTabClose } from './tab-close';

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveLeaseMock.mockResolvedValue(undefined);
  hydrateSurfaceMock.mockResolvedValue(null);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  getVideoRecordingTabIdMock.mockReturnValue(7);
  releaseSurfaceMock.mockResolvedValue(undefined);
  releaseVideoSurfaceMock.mockResolvedValue(true);
  closeCameraPeerMock.mockResolvedValue(undefined);
  surfaceState.current = null;
  stopRecordingMock.mockResolvedValue({ result: 'accepted' });
  waitForRecoveryMock.mockResolvedValue(undefined);
});

it('hydrates and retires a persisted camera surface when its tab closes after restart', async () => {
  surfaceState.current = { tabId: 7 };
  getVideoRecordingTabIdMock.mockReturnValue(null);
  getVideoRecordingIdMock.mockReturnValue(null);
  await handleTabClose(7);
  expect(hydrateSurfaceMock).toHaveBeenCalledOnce();
  expect(releaseVideoSurfaceMock).toHaveBeenCalledWith({ tabId: 7 });
});

it('retries a failed tab-close surface release without discarding durable authority', async () => {
  surfaceState.current = { tabId: 7 };
  getVideoRecordingTabIdMock.mockReturnValue(null);
  getVideoRecordingIdMock.mockReturnValue(null);
  releaseVideoSurfaceMock
    .mockRejectedValueOnce(new Error('offscreen unavailable'))
    .mockResolvedValueOnce(true);

  await handleTabClose(7);

  expect(releaseVideoSurfaceMock).toHaveBeenCalledTimes(2);
  expect(logger.warn).toHaveBeenCalledWith(
    'Embedded camera surface release failed for closed tab',
    expect.any(Error)
  );
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
