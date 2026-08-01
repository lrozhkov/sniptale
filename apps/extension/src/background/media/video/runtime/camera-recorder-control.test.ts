import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  bind: vi.fn(),
  clear: vi.fn(),
  create: vi.fn(),
  rebind: vi.fn(),
  grant: null as null | {
    documentId: string;
    expiresAt: number;
    previousRegistrationToken: string | null;
    registrationToken: string;
    recordingId: string;
    senderUrl: string;
    stage: 'document' | 'launch';
    tabId: number | null;
  },
  read: vi.fn(),
}));

vi.mock('../../../storage/video/camera-recorder-grant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../storage/video/camera-recorder-grant')>()),
  bindCameraRecorderDocumentGrant: storage.bind,
  clearCameraRecorderGrant: storage.clear,
  createCameraRecorderLaunchGrant: storage.create,
  readCameraRecorderGrant: storage.read,
  rebindCameraRecorderDocumentGrant: storage.rebind,
}));

import {
  authorizeCameraRecorderDocument,
  clearCameraRecorderControlGrant,
  forgetCameraRecorderControlGrant,
  isAuthorizedCameraRecorderDocument,
  issueCameraRecorderLaunchToken,
  reconnectCameraRecorderDocument,
  restoreAuthorizedCameraRecorderDocument,
} from './camera-recorder-control';
import { reserveMediaErasureExclusion } from '../../lifecycle-gate';

const CAMERA_URL = 'chrome-extension://test/apps/extension/src/camera-recorder/index.html';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  vi.clearAllMocks();
  storage.grant = null;
  storage.create.mockImplementation(async (recordingId: string, registrationToken: string) => {
    storage.grant = {
      documentId: '',
      expiresAt: Date.now() + 60_000,
      previousRegistrationToken: null,
      registrationToken,
      recordingId,
      senderUrl: '',
      stage: 'launch',
      tabId: null,
    };
    return storage.grant;
  });
  storage.bind.mockImplementation(async (args) => {
    const current = storage.grant;
    if (
      current?.stage === 'document' &&
      current.documentId === args.documentId &&
      current.previousRegistrationToken === args.registrationToken &&
      current.recordingId === args.recordingId &&
      current.senderUrl === args.senderUrl &&
      current.tabId === args.tabId
    ) {
      return current;
    }
    if (
      !current ||
      current.expiresAt <= Date.now() ||
      current.registrationToken !== args.registrationToken ||
      current.recordingId !== args.recordingId
    ) {
      return null;
    }
    storage.grant = {
      ...current,
      documentId: args.documentId,
      expiresAt: current.stage === 'launch' ? Date.now() + 24 * 60 * 60 * 1000 : current.expiresAt,
      previousRegistrationToken: current.registrationToken,
      registrationToken: args.nextRegistrationToken,
      senderUrl: args.senderUrl,
      stage: 'document',
      tabId: args.tabId,
    };
    return storage.grant;
  });
  storage.rebind.mockImplementation(async (args) => {
    const current = storage.grant;
    if (
      !current ||
      current.stage !== 'document' ||
      current.senderUrl !== args.senderUrl ||
      current.tabId !== args.tabId
    ) {
      return null;
    }
    storage.grant = { ...current, documentId: args.documentId };
    return storage.grant;
  });
  storage.read.mockImplementation(async () => storage.grant);
  storage.clear.mockImplementation(async (recordingId?: string) => {
    if (recordingId && storage.grant?.recordingId !== recordingId) return false;
    storage.grant = null;
    return true;
  });
  await clearCameraRecorderControlGrant();
});

afterEach(() => {
  vi.useRealTimers();
});

it('consumes the launch token and reconnects only the same camera tab', async () => {
  const launchToken = await issueCameraRecorderLaunchToken('recording-1');

  const initial = await authorizeCameraRecorderDocument({
    documentId: 'document-1',
    registrationToken: launchToken,
    recordingId: 'recording-1',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  expect(initial).toEqual({ recordingId: 'recording-1' });
  await expect(
    authorizeCameraRecorderDocument({
      documentId: 'document-1',
      registrationToken: launchToken,
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).resolves.toEqual(initial);
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(true);

  await expect(
    authorizeCameraRecorderDocument({
      documentId: 'document-2',
      registrationToken: launchToken,
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).resolves.toBeNull();
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(true);

  await expect(
    reconnectCameraRecorderDocument({
      documentId: 'document-2',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).resolves.toEqual({ recordingId: 'recording-1' });
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(false);
  await expect(
    reconnectCameraRecorderDocument({
      documentId: 'other-tab-document',
      senderUrl: CAMERA_URL,
      tabId: 8,
    })
  ).resolves.toBeNull();
});

it('restores only the exact persisted document binding after memory loss', async () => {
  const launchToken = await issueCameraRecorderLaunchToken('recording-1');
  await authorizeCameraRecorderDocument({
    documentId: 'document-1',
    registrationToken: launchToken,
    recordingId: 'recording-1',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  const persisted = storage.grant;
  await clearCameraRecorderControlGrant('recording-1');
  storage.grant = persisted;

  await expect(
    restoreAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).resolves.toBe(true);
  await expect(
    restoreAuthorizedCameraRecorderDocument({
      documentId: 'other-document',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).resolves.toBe(false);
  await expect(
    restoreAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 8,
    })
  ).resolves.toBe(false);
});

it('rejects expired launch grants and durable cleanup revokes the document', async () => {
  const launchToken = await issueCameraRecorderLaunchToken('recording-1');
  vi.setSystemTime(62_000);
  await expect(
    authorizeCameraRecorderDocument({
      documentId: 'document-1',
      registrationToken: launchToken,
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).resolves.toBeNull();

  const nextLaunchToken = await issueCameraRecorderLaunchToken('recording-2');
  await authorizeCameraRecorderDocument({
    documentId: 'document-1',
    registrationToken: nextLaunchToken,
    recordingId: 'recording-2',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  await clearCameraRecorderControlGrant('recording-2');
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-2',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(false);
});

it('does not publish a delayed durable read after the exact grant is revoked', async () => {
  const launchToken = await issueCameraRecorderLaunchToken('recording-1');
  await authorizeCameraRecorderDocument({
    documentId: 'document-1',
    registrationToken: launchToken,
    recordingId: 'recording-1',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  forgetCameraRecorderControlGrant('recording-1');
  const readStarted = createDeferred();
  const releaseRead = createDeferred();
  storage.read.mockImplementationOnce(async () => {
    const snapshot = storage.grant;
    readStarted.resolve();
    await releaseRead.promise;
    return snapshot;
  });

  const restore = restoreAuthorizedCameraRecorderDocument({
    documentId: 'document-1',
    recordingId: 'recording-1',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  await readStarted.promise;
  storage.grant = null;
  forgetCameraRecorderControlGrant('recording-1');
  releaseRead.resolve();

  await expect(restore).resolves.toBe(false);
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(false);
});

it('does not let a delayed old hydration overwrite a replacement document grant', async () => {
  const launchTokenA = await issueCameraRecorderLaunchToken('recording-a');
  await authorizeCameraRecorderDocument({
    documentId: 'document-a',
    registrationToken: launchTokenA,
    recordingId: 'recording-a',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  forgetCameraRecorderControlGrant('recording-a');
  const readStarted = createDeferred();
  const releaseRead = createDeferred();
  storage.read.mockImplementationOnce(async () => {
    const snapshot = storage.grant;
    readStarted.resolve();
    await releaseRead.promise;
    return snapshot;
  });

  const restoreA = restoreAuthorizedCameraRecorderDocument({
    documentId: 'document-a',
    recordingId: 'recording-a',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  await readStarted.promise;
  const launchTokenB = await issueCameraRecorderLaunchToken('recording-b');
  await authorizeCameraRecorderDocument({
    documentId: 'document-b',
    registrationToken: launchTokenB,
    recordingId: 'recording-b',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  releaseRead.resolve();

  await expect(restoreA).resolves.toBe(false);
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-a',
      recordingId: 'recording-a',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(false);
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-b',
      recordingId: 'recording-b',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(true);
});

it('invalidates an already hydrated grant when privacy erasure is reserved', async () => {
  const launchToken = await issueCameraRecorderLaunchToken('recording-1');
  await authorizeCameraRecorderDocument({
    documentId: 'document-1',
    registrationToken: launchToken,
    recordingId: 'recording-1',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  const exclusion = reserveMediaErasureExclusion();

  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(false);
  exclusion.release();
});

it('invalidates an admitted hydration as soon as privacy erasure is reserved', async () => {
  const launchToken = await issueCameraRecorderLaunchToken('recording-1');
  await authorizeCameraRecorderDocument({
    documentId: 'document-1',
    registrationToken: launchToken,
    recordingId: 'recording-1',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  forgetCameraRecorderControlGrant('recording-1');
  const readStarted = createDeferred();
  const releaseRead = createDeferred();
  storage.read.mockImplementationOnce(async () => {
    const snapshot = storage.grant;
    readStarted.resolve();
    await releaseRead.promise;
    return snapshot;
  });

  const restore = restoreAuthorizedCameraRecorderDocument({
    documentId: 'document-1',
    recordingId: 'recording-1',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  await readStarted.promise;
  const exclusion = reserveMediaErasureExclusion();
  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(false);
  releaseRead.resolve();
  await expect(restore).resolves.toBe(false);
  await exclusion.waitForActiveMutations();
  storage.grant = null;
  forgetCameraRecorderControlGrant();
  exclusion.release();

  expect(
    isAuthorizedCameraRecorderDocument({
      documentId: 'document-1',
      recordingId: 'recording-1',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).toBe(false);
});

it('cannot reconnect an open camera tab after privacy erasure removes its grant', async () => {
  const launchToken = await issueCameraRecorderLaunchToken('recording-1');
  await authorizeCameraRecorderDocument({
    documentId: 'document-1',
    registrationToken: launchToken,
    recordingId: 'recording-1',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  const rebindStarted = createDeferred();
  const releaseRebind = createDeferred();
  storage.rebind.mockImplementationOnce(async (args) => {
    const snapshot = storage.grant ? { ...storage.grant, documentId: args.documentId } : null;
    rebindStarted.resolve();
    await releaseRebind.promise;
    return snapshot;
  });

  const reconnect = reconnectCameraRecorderDocument({
    documentId: 'document-2',
    senderUrl: CAMERA_URL,
    tabId: 7,
  });
  await rebindStarted.promise;
  const exclusion = reserveMediaErasureExclusion();
  releaseRebind.resolve();

  await expect(reconnect).resolves.toBeNull();
  await exclusion.waitForActiveMutations();
  storage.grant = null;
  forgetCameraRecorderControlGrant();
  exclusion.release();

  await expect(
    reconnectCameraRecorderDocument({
      documentId: 'document-3',
      senderUrl: CAMERA_URL,
      tabId: 7,
    })
  ).resolves.toBeNull();
});
