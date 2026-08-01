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
  installPersistenceLockManagerForTests,
  type PersistenceLockManager,
} from '../../../composition/persistence/infrastructure/mutation-barrier';
import {
  CAMERA_RECORDER_GRANT_STORAGE_KEY,
  bindCameraRecorderDocumentGrant,
  createCameraRecorderLaunchGrant,
  readCameraRecorderGrant,
} from './camera-recorder-grant';
import { acknowledgePendingVideoPostRecordResult } from './post-record-acknowledgement';
import {
  commitPendingVideoPostRecordResult,
  isAcknowledgedVideoPostRecordResultForCamera,
  persistPendingVideoPostRecordResult,
  readPendingVideoPostRecordResult,
  readStoredVideoPostRecordResult,
  VIDEO_POST_RECORD_RESULT_STORAGE_KEY,
} from './post-record-result';

const RESULT_A = {
  primaryRecordingId: 'rec-a',
  projectId: null,
  recordingId: 'rec-a',
};

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

function removeStorageKeys(keys: string | string[]): void {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    delete storageState[key];
  }
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(storageState).forEach((key) => delete storageState[key]);
  isAvailableMock.mockReturnValue(true);
  getMock.mockImplementation(async () => ({ ...storageState }));
  setMock.mockImplementation(async (value: Record<string, unknown>) => {
    Object.assign(storageState, value);
  });
  removeMock.mockImplementation(async (keys: string | string[]) => {
    removeStorageKeys(keys);
  });
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  installPersistenceLockManagerForTests(createSerialLockManager());
});

afterEach(() => {
  installPersistenceLockManagerForTests(null);
});

it('acknowledges an exact ready result and revokes its grant in one storage mutation', async () => {
  await persistPendingVideoPostRecordResult(RESULT_A);
  await commitPendingVideoPostRecordResult('rec-a');
  await createCameraRecorderLaunchGrant('rec-a', 'launch-a');
  await bindCameraRecorderDocumentGrant({
    documentId: 'camera-doc-a',
    nextRegistrationToken: 'unused-after-bind',
    recordingId: 'rec-a',
    registrationToken: 'launch-a',
    senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    tabId: 7,
  });
  setMock.mockClear();

  await expect(acknowledgePendingVideoPostRecordResult('rec-a')).resolves.toBe('acknowledged');

  expect(setMock).toHaveBeenCalledOnce();
  expect(setMock).toHaveBeenCalledWith(
    {
      [VIDEO_POST_RECORD_RESULT_STORAGE_KEY]: expect.objectContaining({
        acknowledgedBy: {
          documentId: 'camera-doc-a',
          senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
          tabId: 7,
        },
        recordingId: 'rec-a',
        status: 'acknowledged',
      }),
      [CAMERA_RECORDER_GRANT_STORAGE_KEY]: null,
    },
    expect.any(Object)
  );
  await expect(readPendingVideoPostRecordResult()).resolves.toBeNull();
  await expect(readCameraRecorderGrant()).resolves.toBeNull();
  await expect(
    isAcknowledgedVideoPostRecordResultForCamera({
      documentId: 'camera-doc-a',
      recordingId: 'rec-a',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
      tabId: 7,
    })
  ).resolves.toBe(true);
  await expect(
    isAcknowledgedVideoPostRecordResultForCamera({
      documentId: 'camera-doc-a',
      recordingId: 'rec-a',
      senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
      tabId: 8,
    })
  ).resolves.toBe(false);
  await expect(acknowledgePendingVideoPostRecordResult('rec-a')).resolves.toBe('acknowledged');
  await expect(persistPendingVideoPostRecordResult(RESULT_A)).resolves.toBe('acknowledged');
  await expect(readPendingVideoPostRecordResult()).resolves.toBeNull();
});

it('does not revoke a live grant when there is no exact pending result', async () => {
  await persistPendingVideoPostRecordResult(RESULT_A);
  await commitPendingVideoPostRecordResult('rec-a');
  await createCameraRecorderLaunchGrant('rec-b', 'launch-b');
  setMock.mockClear();

  await expect(acknowledgePendingVideoPostRecordResult('rec-b')).resolves.toBe('stale');

  expect(setMock).not.toHaveBeenCalled();
  await expect(readPendingVideoPostRecordResult()).resolves.toEqual(RESULT_A);
  await expect(readCameraRecorderGrant()).resolves.toEqual(
    expect.objectContaining({ recordingId: 'rec-b' })
  );
});

it('leaves both records durable when the grouped acknowledgement fails and completes on retry', async () => {
  await persistPendingVideoPostRecordResult(RESULT_A);
  await commitPendingVideoPostRecordResult('rec-a');
  await createCameraRecorderLaunchGrant('rec-a', 'launch-a');
  setMock.mockRejectedValueOnce(new Error('write failed'));

  await expect(acknowledgePendingVideoPostRecordResult('rec-a')).rejects.toThrow('write failed');
  await expect(readPendingVideoPostRecordResult()).resolves.toEqual(RESULT_A);
  await expect(readCameraRecorderGrant()).resolves.toEqual(
    expect.objectContaining({ recordingId: 'rec-a' })
  );

  await expect(acknowledgePendingVideoPostRecordResult('rec-a')).resolves.toBe('acknowledged');
  await expect(readPendingVideoPostRecordResult()).resolves.toBeNull();
  await expect(readCameraRecorderGrant()).resolves.toBeNull();
});

it('serializes a newer result behind an admitted exact acknowledgement', async () => {
  await persistPendingVideoPostRecordResult(RESULT_A);
  await commitPendingVideoPostRecordResult('rec-a');
  await createCameraRecorderLaunchGrant('rec-a', 'launch-a');
  setMock.mockClear();
  const acknowledgementStarted = createDeferred();
  const releaseAcknowledgement = createDeferred();
  setMock.mockImplementationOnce(async (values: Record<string, unknown>) => {
    acknowledgementStarted.resolve();
    await releaseAcknowledgement.promise;
    Object.assign(storageState, values);
  });

  const acknowledgement = acknowledgePendingVideoPostRecordResult('rec-a');
  await acknowledgementStarted.promise;
  const newerResult = persistPendingVideoPostRecordResult({
    primaryRecordingId: 'rec-b',
    projectId: null,
    recordingId: 'rec-b',
  });
  releaseAcknowledgement.resolve();
  await acknowledgement;
  await newerResult;
  await commitPendingVideoPostRecordResult('rec-b');

  await expect(readPendingVideoPostRecordResult()).resolves.toEqual({
    primaryRecordingId: 'rec-b',
    projectId: null,
    recordingId: 'rec-b',
  });
});

it('keeps a staged result undisclosed and unacknowledgeable until cleanup commits it', async () => {
  await persistPendingVideoPostRecordResult(RESULT_A);
  await createCameraRecorderLaunchGrant('rec-a', 'launch-a');
  setMock.mockClear();

  await expect(readPendingVideoPostRecordResult()).resolves.toBeNull();
  await expect(acknowledgePendingVideoPostRecordResult('rec-a')).resolves.toBe('stale');
  expect(setMock).not.toHaveBeenCalled();
  await expect(readStoredVideoPostRecordResult()).resolves.toEqual(
    expect.objectContaining({ result: RESULT_A, status: 'staged' })
  );
  await expect(readCameraRecorderGrant()).resolves.toEqual(
    expect.objectContaining({ recordingId: 'rec-a' })
  );
});
