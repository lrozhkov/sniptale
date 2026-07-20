import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  browserStorageSessionGetMock,
  browserStorageSessionIsAvailableMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionIsAvailableMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        get: browserStorageSessionGetMock,
        isAvailable: browserStorageSessionIsAvailableMock,
        remove: browserStorageSessionRemoveMock,
        set: browserStorageSessionSetMock,
      },
    },
  })
);
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  createLeaseSnapshot,
  inspectPersistedLease,
  persistLease,
  readPersistedLease,
  removePersistedLease,
} from './recording-control-lease';

const storageKey = 'video-active-recording-lease';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'control-token-1') });
  vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));
  browserStorageSessionIsAvailableMock.mockReturnValue(true);
  browserStorageSessionGetMock.mockResolvedValue({});
  browserStorageSessionRemoveMock.mockResolvedValue(undefined);
  browserStorageSessionSetMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('persists and reads a valid recording lease record', async () => {
  const lease = createLeaseSnapshot({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl: 'chrome-extension://test/apps/extension/src/popup/index.html',
    openEditorAfterRecording: true,
    recordingId: 'recording-1',
    recordingTabId: 42,
  });

  await persistLease(lease);
  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [storageKey]: expect.objectContaining({
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
      version: 1,
    }),
  });

  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      ...lease,
      version: 1,
    },
  });

  await expect(readPersistedLease()).resolves.toEqual(lease);
});

it('persists and reads a camera recording lease without a tab id', async () => {
  const lease = createLeaseSnapshot({
    captureMode: CaptureMode.CAMERA,
    ownerSenderUrl: 'chrome-extension://test/apps/extension/src/popup/index.html',
    openEditorAfterRecording: false,
    recordingId: 'recording-camera-1',
    recordingTabId: null,
  });

  await persistLease(lease);
  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [storageKey]: expect.objectContaining({
      captureMode: CaptureMode.CAMERA,
      recordingId: 'recording-camera-1',
      recordingTabId: null,
      version: 1,
    }),
  });

  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      ...lease,
      version: 1,
    },
  });

  await expect(readPersistedLease()).resolves.toEqual(lease);
});

it('drops expired persisted lease records and removes only when storage is available', async () => {
  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      captureMode: CaptureMode.TAB,
      controlToken: 'control-token-1',
      expiresAt: Date.now() - 1,
      openEditorAfterRecording: true,
      ownerSenderUrl: 'chrome-extension://test/apps/extension/src/popup/index.html',
      recordingId: 'recording-1',
      recordingTabId: 42,
      version: 1,
    },
  });

  await expect(readPersistedLease()).resolves.toBeNull();
  await expect(inspectPersistedLease()).resolves.toEqual({ status: 'invalid' });

  await removePersistedLease();
  expect(browserStorageSessionRemoveMock).toHaveBeenCalledWith(storageKey);
});

it('distinguishes verified absence from unavailable lease storage', async () => {
  await expect(inspectPersistedLease()).resolves.toEqual({ status: 'absent' });

  browserStorageSessionIsAvailableMock.mockReturnValueOnce(false);
  await expect(inspectPersistedLease()).resolves.toEqual({ status: 'unavailable' });
});
