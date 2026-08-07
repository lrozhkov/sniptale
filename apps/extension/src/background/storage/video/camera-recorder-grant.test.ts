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
  bindCameraRecorderDocumentGrant,
  CAMERA_RECORDER_DOCUMENT_TTL_MS,
  CAMERA_RECORDER_GRANT_STORAGE_KEY,
  CAMERA_RECORDER_LAUNCH_TTL_MS,
  clearCameraRecorderGrant,
  createCameraRecorderLaunchGrant,
  readCameraRecorderGrant,
  rebindCameraRecorderDocumentGrant,
} from './camera-recorder-grant';
import {
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
  type PersistenceLockManager,
} from '../../../composition/persistence/infrastructure/mutation-barrier';

function createSerialLockManager(): PersistenceLockManager {
  const queues = new Map<string, Promise<void>>();
  return {
    request<T>(
      name: string,
      _options: { mode: 'exclusive' | 'shared' },
      operation: () => T | Promise<T>
    ): Promise<T> {
      const execution = (queues.get(name) ?? Promise.resolve()).then(operation);
      queues.set(
        name,
        execution.then(
          () => undefined,
          () => undefined
        )
      );
      return execution;
    },
  };
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
  removeMock.mockImplementation(async (key: string) => {
    delete storageState[key];
  });
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  installPersistenceLockManagerForTests(createSerialLockManager());
});

afterEach(() => {
  installPersistenceLockManagerForTests(null);
});

it('persists a short launch grant and binds it to the exact trusted document', async () => {
  await createCameraRecorderLaunchGrant('rec-1', 'launch-1');
  expect(storageState[CAMERA_RECORDER_GRANT_STORAGE_KEY]).toEqual({
    createdAt: 1_000,
    documentId: '',
    expiresAt: 1_000 + CAMERA_RECORDER_LAUNCH_TTL_MS,
    previousRegistrationToken: null,
    registrationToken: 'launch-1',
    recordingId: 'rec-1',
    senderUrl: '',
    stage: 'launch',
    tabId: null,
    version: 1,
  });

  await expect(
    bindCameraRecorderDocumentGrant({
      documentId: 'camera-doc-1',
      nextRegistrationToken: 'reload-1',
      registrationToken: 'launch-1',
      recordingId: 'rec-1',
      senderUrl: 'chrome-extension://id/camera.html',
      tabId: 7,
    })
  ).resolves.toEqual({
    documentId: 'camera-doc-1',
    expiresAt: 1_000 + CAMERA_RECORDER_DOCUMENT_TTL_MS,
    previousRegistrationToken: 'launch-1',
    registrationToken: 'reload-1',
    recordingId: 'rec-1',
    senderUrl: 'chrome-extension://id/camera.html',
    stage: 'document',
    tabId: 7,
  });
});

it('rebinds only the same camera tab on reload without extending its lifetime', async () => {
  await createCameraRecorderLaunchGrant('rec-1', 'launch-1');
  await bindCameraRecorderDocumentGrant({
    documentId: 'camera-doc-1',
    nextRegistrationToken: 'reload-1',
    registrationToken: 'launch-1',
    recordingId: 'rec-1',
    senderUrl: 'chrome-extension://id/camera.html',
    tabId: 7,
  });
  vi.mocked(Date.now).mockReturnValue(2_000);

  const rebound = await rebindCameraRecorderDocumentGrant({
    documentId: 'camera-doc-2',
    senderUrl: 'chrome-extension://id/camera.html',
    tabId: 7,
  });

  expect(rebound).toEqual(
    expect.objectContaining({
      documentId: 'camera-doc-2',
      expiresAt: 1_000 + CAMERA_RECORDER_DOCUMENT_TTL_MS,
      registrationToken: 'reload-1',
    })
  );

  await expect(
    bindCameraRecorderDocumentGrant({
      documentId: 'replayed-document',
      nextRegistrationToken: 'attacker-next',
      registrationToken: 'launch-1',
      recordingId: 'rec-1',
      senderUrl: 'chrome-extension://id/camera.html',
      tabId: 7,
    })
  ).resolves.toBeNull();
  await expect(readCameraRecorderGrant()).resolves.toEqual(rebound);

  setMock.mockClear();
  await expect(
    rebindCameraRecorderDocumentGrant({
      documentId: 'camera-doc-2',
      senderUrl: 'chrome-extension://id/camera.html',
      tabId: 7,
    })
  ).resolves.toEqual(rebound);
  expect(setMock).not.toHaveBeenCalled();

  await expect(
    rebindCameraRecorderDocumentGrant({
      documentId: 'other-tab-document',
      senderUrl: 'chrome-extension://id/camera.html',
      tabId: 8,
    })
  ).resolves.toBeNull();
});

it('rejects mismatched capabilities and forged retention windows without write-on-read repair', async () => {
  await createCameraRecorderLaunchGrant('rec-1', 'launch-1');
  await expect(
    bindCameraRecorderDocumentGrant({
      documentId: 'camera-doc-1',
      nextRegistrationToken: 'reload-1',
      registrationToken: 'wrong-token',
      recordingId: 'rec-1',
      senderUrl: 'chrome-extension://id/camera.html',
      tabId: 7,
    })
  ).resolves.toBeNull();

  storageState[CAMERA_RECORDER_GRANT_STORAGE_KEY] = {
    createdAt: 1_000,
    documentId: 'camera-doc-1',
    expiresAt: 1_000 + CAMERA_RECORDER_DOCUMENT_TTL_MS + 1,
    previousRegistrationToken: 'launch-1',
    registrationToken: 'launch-1',
    recordingId: 'rec-1',
    senderUrl: 'chrome-extension://id/camera.html',
    stage: 'document',
    tabId: 7,
    version: 1,
  };
  setMock.mockClear();
  removeMock.mockClear();

  await expect(readCameraRecorderGrant()).resolves.toBeNull();
  expect(setMock).not.toHaveBeenCalled();
  expect(removeMock).not.toHaveBeenCalled();
});

it('clears only the matching recording grant and fails closed without session storage', async () => {
  await createCameraRecorderLaunchGrant('rec-1', 'launch-1');
  await expect(clearCameraRecorderGrant('rec-2')).resolves.toBe(false);
  await expect(readCameraRecorderGrant()).resolves.not.toBeNull();
  await expect(clearCameraRecorderGrant('rec-1')).resolves.toBe(true);
  await expect(readCameraRecorderGrant()).resolves.toBeNull();

  isAvailableMock.mockReturnValue(false);
  await expect(createCameraRecorderLaunchGrant('rec-2', 'launch-2')).rejects.toThrow(
    'Session storage is unavailable'
  );
  await expect(clearCameraRecorderGrant('rec-2')).rejects.toThrow('Session storage is unavailable');
});

it('holds the persistence permit across grant binding so erasure cannot be followed by a stale write', async () => {
  await createCameraRecorderLaunchGrant('rec-1', 'launch-1');
  const readStarted = createDeferred();
  const releaseRead = createDeferred();
  getMock.mockImplementationOnce(async () => {
    const snapshot = { ...storageState };
    readStarted.resolve();
    await releaseRead.promise;
    return snapshot;
  });

  const binding = bindCameraRecorderDocumentGrant({
    documentId: 'camera-doc-1',
    nextRegistrationToken: 'reload-1',
    registrationToken: 'launch-1',
    recordingId: 'rec-1',
    senderUrl: 'chrome-extension://id/camera.html',
    tabId: 7,
  });
  await readStarted.promise;

  let erasureStarted = false;
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    erasureStarted = true;
    delete storageState[CAMERA_RECORDER_GRANT_STORAGE_KEY];
  });
  await Promise.resolve();
  expect(erasureStarted).toBe(false);

  releaseRead.resolve();
  await binding;
  await erasure;

  expect(storageState[CAMERA_RECORDER_GRANT_STORAGE_KEY]).toBeUndefined();
});
