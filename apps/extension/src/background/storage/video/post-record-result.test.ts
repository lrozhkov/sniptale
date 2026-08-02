import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getMock, isAvailableMock, removeMock, setMock, storageState } = vi.hoisted(() => ({
  getMock: vi.fn(),
  isAvailableMock: vi.fn(),
  removeMock: vi.fn(),
  setMock: vi.fn(),
  storageState: {} as Record<string, unknown>,
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: getMock,
      isAvailable: isAvailableMock,
      remove: removeMock,
      set: setMock,
    },
  },
}));

import {
  clearPendingVideoPostRecordResult,
  commitPendingVideoPostRecordResult,
  persistPendingVideoPostRecordResult,
  readPendingVideoPostRecordResult,
  readStoredVideoPostRecordResult,
  VIDEO_POST_RECORD_RESULT_STORAGE_KEY,
  VIDEO_POST_RECORD_RESULT_TTL_MS,
} from './post-record-result';
import {
  installPersistenceLockManagerForTests,
  type PersistenceLockManager,
} from '../../../composition/persistence/infrastructure/mutation-barrier';

function createSerialLockManager(): PersistenceLockManager {
  let queue: Promise<void> = Promise.resolve();
  return {
    request<T>(
      _name: string,
      _options: { mode: 'exclusive' | 'shared' },
      operation: () => T | Promise<T>
    ): Promise<T> {
      const execution = queue.then(operation);
      queue = execution.then(
        () => undefined,
        () => undefined
      );
      return execution;
    },
  };
}

const RESULT = {
  primaryRecordingId: 'rec-1-window-1',
  projectId: 'project-1',
  recordingId: 'rec-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(storageState).forEach((key) => delete storageState[key]);
  isAvailableMock.mockReturnValue(true);
  getMock.mockImplementation(async () => ({ ...storageState }));
  setMock.mockImplementation(async (value: Record<string, unknown>) => {
    Object.assign(storageState, value);
  });
  removeMock.mockImplementation(async (key: string) => {
    delete storageState[key];
  });
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  installPersistenceLockManagerForTests(createSerialLockManager());
});

afterEach(() => {
  installPersistenceLockManagerForTests(null);
});

it('keeps a staged result hidden until terminal cleanup commits it', async () => {
  await expect(persistPendingVideoPostRecordResult(RESULT)).resolves.toBe('staged');

  await expect(readPendingVideoPostRecordResult()).resolves.toBeNull();
  expect(setMock).toHaveBeenCalledWith(
    {
      [VIDEO_POST_RECORD_RESULT_STORAGE_KEY]: {
        ...RESULT,
        acknowledgedBy: null,
        createdAt: 1_000,
        expiresAt: null,
        status: 'staged',
        version: 1,
      },
    },
    expect.any(Object)
  );
  await expect(commitPendingVideoPostRecordResult('rec-1')).resolves.toBe('ready');
  await expect(readPendingVideoPostRecordResult()).resolves.toEqual(RESULT);
  await expect(readStoredVideoPostRecordResult()).resolves.toEqual({
    acknowledgedBy: null,
    createdAt: 1_000,
    expiresAt: null,
    result: RESULT,
    status: 'ready',
  });
});

it('keeps an unacknowledged ready result pending beyond the tombstone retention window', async () => {
  await persistPendingVideoPostRecordResult(RESULT);
  await commitPendingVideoPostRecordResult('rec-1');
  vi.spyOn(Date, 'now').mockReturnValue(1_000 + VIDEO_POST_RECORD_RESULT_TTL_MS + 1);

  await expect(readPendingVideoPostRecordResult()).resolves.toEqual(RESULT);
  expect(removeMock).not.toHaveBeenCalled();
});

it('treats malformed pending lifetimes as absent without repairing them on read', async () => {
  storageState[VIDEO_POST_RECORD_RESULT_STORAGE_KEY] = {
    ...RESULT,
    acknowledgedBy: null,
    createdAt: 1_000,
    expiresAt: 1_000,
    status: 'ready',
    version: 1,
  };

  await expect(readPendingVideoPostRecordResult()).resolves.toBeNull();
  expect(removeMock).not.toHaveBeenCalled();
  expect(setMock).not.toHaveBeenCalled();
});

it('rejects a numeric lifetime on an unacknowledged result', async () => {
  storageState[VIDEO_POST_RECORD_RESULT_STORAGE_KEY] = {
    ...RESULT,
    acknowledgedBy: null,
    createdAt: 1_000,
    expiresAt: 1_000 + VIDEO_POST_RECORD_RESULT_TTL_MS + 1,
    status: 'ready',
    version: 1,
  };

  await expect(readPendingVideoPostRecordResult()).resolves.toBeNull();
  expect(removeMock).not.toHaveBeenCalled();
  expect(setMock).not.toHaveBeenCalled();
});

it('accepts camera receipts only on acknowledged tombstones', async () => {
  storageState[VIDEO_POST_RECORD_RESULT_STORAGE_KEY] = {
    ...RESULT,
    acknowledgedBy: {
      documentId: 'camera-doc-1',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
      tabId: 7,
    },
    createdAt: 1_000,
    expiresAt: 1_000 + VIDEO_POST_RECORD_RESULT_TTL_MS,
    status: 'ready',
    version: 1,
  };

  await expect(readStoredVideoPostRecordResult()).resolves.toBeNull();
  expect(removeMock).not.toHaveBeenCalled();
  expect(setMock).not.toHaveBeenCalled();
});

it('clears only the matching recording result', async () => {
  await persistPendingVideoPostRecordResult(RESULT);

  await expect(clearPendingVideoPostRecordResult('other-recording')).resolves.toBe(false);
  await expect(readStoredVideoPostRecordResult()).resolves.toEqual(
    expect.objectContaining({ result: RESULT, status: 'staged' })
  );
  await expect(clearPendingVideoPostRecordResult('rec-1')).resolves.toBe(true);
  await expect(readPendingVideoPostRecordResult()).resolves.toBeNull();
});

it('does not overwrite a different staged or ready user decision', async () => {
  const nextResult = {
    primaryRecordingId: 'rec-2',
    projectId: null,
    recordingId: 'rec-2',
  };
  await persistPendingVideoPostRecordResult(RESULT);

  await expect(persistPendingVideoPostRecordResult(nextResult)).rejects.toThrow(
    'previous post-record result is still pending'
  );
  await commitPendingVideoPostRecordResult('rec-1');
  await expect(persistPendingVideoPostRecordResult(nextResult)).rejects.toThrow(
    'previous post-record result is still pending'
  );

  await expect(readPendingVideoPostRecordResult()).resolves.toEqual(RESULT);
});

it('serializes a stale acknowledgement before a newer result write', async () => {
  await persistPendingVideoPostRecordResult(RESULT);
  let releaseRemove!: () => void;
  let markRemoveStarted!: () => void;
  const removeStarted = new Promise<void>((resolve) => {
    markRemoveStarted = resolve;
  });
  removeMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        markRemoveStarted();
        releaseRemove = () => {
          delete storageState[VIDEO_POST_RECORD_RESULT_STORAGE_KEY];
          resolve();
        };
      })
  );

  const clear = clearPendingVideoPostRecordResult('rec-1');
  await removeStarted;
  const newer = persistPendingVideoPostRecordResult({
    primaryRecordingId: 'rec-2',
    projectId: null,
    recordingId: 'rec-2',
  });
  releaseRemove();
  await clear;
  await newer;
  await commitPendingVideoPostRecordResult('rec-2');

  await expect(readPendingVideoPostRecordResult()).resolves.toEqual({
    primaryRecordingId: 'rec-2',
    projectId: null,
    recordingId: 'rec-2',
  });
});

it('fails reads and writes when session storage is unavailable', async () => {
  isAvailableMock.mockReturnValue(false);

  await expect(persistPendingVideoPostRecordResult(RESULT)).rejects.toThrow(
    'Session storage is unavailable'
  );
  await expect(readPendingVideoPostRecordResult()).rejects.toThrow(
    'Session storage is unavailable'
  );
  await expect(clearPendingVideoPostRecordResult('rec-1')).rejects.toThrow(
    'Session storage is unavailable'
  );
});
