import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, removeMock, setMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  removeMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: getMock,
      isAvailable: () => true,
      remove: removeMock,
      set: setMock,
    },
  },
}));

import {
  completeVideoRecordingCameraPeerCleanup,
  listPendingVideoRecordingCameraPeerCleanup,
  resetVideoRecordingCameraPeerCleanupForTests,
  retainVideoRecordingCameraPeerCleanup,
} from './camera-peer-cleanup';

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({});
  removeMock.mockResolvedValue(undefined);
  setMock.mockResolvedValue(undefined);
  resetVideoRecordingCameraPeerCleanupForTests();
});

it('persists exact pending peer identities until cleanup is acknowledged', async () => {
  await retainVideoRecordingCameraPeerCleanup('surface-1:0:0');
  await expect(listPendingVideoRecordingCameraPeerCleanup()).resolves.toEqual(['surface-1:0:0']);
  expect(setMock).toHaveBeenCalledWith({
    'video-recording-camera-peer-cleanup': ['surface-1:0:0'],
  });

  await completeVideoRecordingCameraPeerCleanup('surface-1:0:0');
  await expect(listPendingVideoRecordingCameraPeerCleanup()).resolves.toEqual([]);
  expect(removeMock).toHaveBeenCalledWith('video-recording-camera-peer-cleanup');
});

it('does not publish a pending-ledger mutation when persistence fails', async () => {
  setMock.mockRejectedValueOnce(new Error('write failed'));
  await expect(retainVideoRecordingCameraPeerCleanup('surface-1:0:0')).rejects.toThrow(
    'write failed'
  );
  await expect(listPendingVideoRecordingCameraPeerCleanup()).resolves.toEqual([]);
});
