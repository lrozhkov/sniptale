import { SecretProtectionAdmissionPermit } from '../../../composition/persistence/secret-protection/model';
import type { SecretProtectionService } from '../../../composition/persistence/secret-protection/model';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AISecretUnlockMessage } from '../../../contracts/messaging/ai-secret-unlock';
import { AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY } from '../../../composition/persistence/ai-settings/constants';

const {
  loadSyncConnectionMock,
  browserStorageSessionGetMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  browserTabsCreateMock,
  browserWindowsCreateMock,
  loadAISecretProtectionStatusMock,
  resolveLlmSessionSenderKeyMock,
  unlockAISecretProtectionMock,
} = vi.hoisted(() => ({
  loadSyncConnectionMock: vi.fn(),
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
  browserTabsCreateMock: vi.fn(),
  browserWindowsCreateMock: vi.fn(),
  loadAISecretProtectionStatusMock: vi.fn(),
  resolveLlmSessionSenderKeyMock: vi.fn(),
  unlockAISecretProtectionMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: loadSyncConnectionMock,
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
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
        remove: browserStorageSessionRemoveMock,
        set: browserStorageSessionSetMock,
      },
    },
  })
);

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: browserTabsCreateMock },
}));

vi.mock('@sniptale/platform/browser/windows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/windows')>()),
  browserWindows: { create: browserWindowsCreateMock },
}));

vi.mock('../../../composition/persistence/ai-settings/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings/core')>()),
  loadAISecretProtectionStatus: loadAISecretProtectionStatusMock,
  unlockAISecretProtection: unlockAISecretProtectionMock,
}));

vi.mock('../../../composition/persistence/ai-settings/graph-mutations', () => ({
  loadSerializedAISecretProtectionStatus: loadAISecretProtectionStatusMock,
  mutateStoredAISettings: (command: { passphrase: string }) =>
    unlockAISecretProtectionMock(command.passphrase),
  resetAISettingsMutationQueueForTests: vi.fn(),
}));

vi.mock('../llm/session-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../llm/session-tokens')>()),
  resolveLlmSessionSenderKey: resolveLlmSessionSenderKeyMock,
}));

import { createAISecretUnlockRouteContext } from './secret-unlock-route.test-support';
import {
  authorizeAISecretUnlockSender,
  resetAISecretUnlockRequestsForTests,
  routeAISecretUnlockMessage,
} from './secret-unlock-route';

afterEach(() => vi.unstubAllGlobals());

let isProtectionUnlocked = false;
let sessionState: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  isProtectionUnlocked = false;
  sessionState = {};
  resetAISecretUnlockRequestsForTests();
  browserStorageSessionGetMock.mockImplementation(async (key: string) => ({
    ...(key in sessionState ? { [key]: sessionState[key] } : {}),
  }));
  browserStorageSessionRemoveMock.mockImplementation(async (key: string) => {
    delete sessionState[key];
  });
  browserStorageSessionSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(sessionState, payload);
  });
  browserWindowsCreateMock.mockResolvedValue(undefined);
  loadAISecretProtectionStatusMock.mockImplementation(async () => ({
    isEnabled: true,
    isUnlocked: isProtectionUnlocked,
    mode: 'passphrase',
  }));
  resolveLlmSessionSenderKeyMock.mockReturnValue('sender-key-1');
  unlockAISecretProtectionMock.mockImplementation(async () => {
    isProtectionUnlocked = true;
  });
});

function ownerSender(): chrome.runtime.MessageSender {
  return {
    documentId: 'document-1',
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://app.example.test/page',
  };
}

function unlockPageSender(requestId: string): chrome.runtime.MessageSender {
  return {
    url: `chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1&requestId=${requestId}`,
  };
}

function routePreauthorizedAISecretUnlockMessage(
  message: AISecretUnlockMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: Parameters<typeof routeAISecretUnlockMessage>[2]
): boolean {
  return routeAISecretUnlockMessage(
    message,
    sender,
    sendResponse,
    createAISecretUnlockRouteContext(message)
  );
}

async function expectUnlockResponse(sendResponse: ReturnType<typeof vi.fn>, response: unknown) {
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(response);
  });
}

async function startUnlockRequest(): Promise<string> {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'start',
      purpose: 'content-ai-pick',
    },
    ownerSender(),
    sendResponse
  );

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String) as string,
        status: 'pending',
        success: true,
      })
    );
  });

  const response = sendResponse.mock.calls[0]?.[0] as { requestId?: string } | undefined;
  if (!response?.requestId) {
    throw new Error('Expected unlock request id');
  }
  return response.requestId;
}

function readUnlockStatus(requestId: string) {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'status',
      requestId,
    },
    ownerSender(),
    sendResponse
  );
  return sendResponse;
}

function submitUnlockRequest(requestId: string) {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'submit',
      passphrase: 'passphrase',
      requestId,
    },
    unlockPageSender(requestId),
    sendResponse
  );
  return sendResponse;
}

it('recovers pending unlock status after memory reset from session storage', async () => {
  const requestId = await startUnlockRequest();
  resetAISecretUnlockRequestsForTests();

  expect(
    authorizeAISecretUnlockSender(
      { type: MessageType.AI_SECRET_UNLOCK, operation: 'status', requestId },
      ownerSender()
    )
  ).toBeNull();

  await expectUnlockResponse(readUnlockStatus(requestId), {
    success: true,
    requestId,
    status: 'pending',
  });
});

it('submits a pending unlock request after memory reset from session storage', async () => {
  const requestId = await startUnlockRequest();
  resetAISecretUnlockRequestsForTests();
  const sendResponse = submitUnlockRequest(requestId);

  await expectUnlockResponse(sendResponse, {
    success: true,
    requestId,
    status: 'completed',
  });
  expect(unlockAISecretProtectionMock).toHaveBeenCalledWith('passphrase');
});

it('returns restart-required when completed unlock key state is lost after restart', async () => {
  const requestId = await startUnlockRequest();
  await expectUnlockResponse(submitUnlockRequest(requestId), {
    success: true,
    requestId,
    status: 'completed',
  });

  isProtectionUnlocked = false;
  resetAISecretUnlockRequestsForTests();

  await expectUnlockResponse(readUnlockStatus(requestId), {
    error: 'AI secret unlock session was lost after service worker restart',
    requestId,
    status: 'restart-required',
    success: false,
  });
});

it('expires pending unlock requests before submit', async () => {
  const requestId = await startUnlockRequest();
  const now = Date.now();
  const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60 * 1000 + 1);
  try {
    await expectUnlockResponse(submitUnlockRequest(requestId), {
      error: 'AI secret unlock request expired',
      requestId,
      status: 'expired',
      success: false,
    });
  } finally {
    dateNowSpy.mockRestore();
  }
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});

it('fails closed and clears corrupt session unlock state', async () => {
  const requestId = '00000000-0000-4000-8000-000000000099';
  sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY] = {
    [requestId]: { requestId, status: 'pending' },
  };

  await expectUnlockResponse(readUnlockStatus(requestId), {
    requestId,
    status: 'failed',
    success: false,
  });
  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toBeUndefined();
});

function explicitProtectionService(): SecretProtectionService {
  return {
    prepare: async () => undefined,
    enable: async () => undefined,
    disable: async () => undefined,
    unlock: async (_passphrase, admit) => {
      if (admit && !(await admit())) throw new Error('admission refused');
      isProtectionUnlocked = true;
    },
    lock: async () => {
      isProtectionUnlocked = false;
    },
    changePassphrase: async () => undefined,
    reset: async () => undefined,
    resetParticipant: async () => undefined,
    readPreparedStatus: async () => ({
      isEnabled: true,
      isUnlocked: isProtectionUnlocked,
      mode: 'passphrase',
      participants: { ai: true, webdav: true },
    }),
    readStatus: async () => ({
      isEnabled: true,
      isUnlocked: isProtectionUnlocked,
      mode: 'passphrase',
      participants: { ai: true, webdav: true },
    }),
    getEpoch: async () => 1,
    readKey: async () => null,
    withAdmission: async (_id, operation) =>
      SecretProtectionAdmissionPermit.run((permit) => operation(null, permit)),
    clearMemory: () => undefined,
    reserveErasure: () => ({ prepare: async () => undefined, release: () => undefined }),
  };
}

it('does not publish an unlock after cancellation during the derivation admission boundary', async () => {
  const requestId = await startUnlockRequest();
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const protection = explicitProtectionService();
  protection.unlock = async (_phrase, admit) => {
    entered();
    await pending;
    if (!admit || !(await admit())) throw new Error('admission refused');
    isProtectionUnlocked = true;
  };
  const submit = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'submit',
    requestId,
    passphrase: 'phrase',
  } as const;
  const submitResponse = vi.fn();
  routeAISecretUnlockMessage(
    submit,
    unlockPageSender(requestId),
    submitResponse,
    createAISecretUnlockRouteContext(submit),
    protection
  );
  await started;
  const cancel = { type: MessageType.AI_SECRET_UNLOCK, operation: 'cancel', requestId } as const;
  const cancelResponse = vi.fn();
  routeAISecretUnlockMessage(
    cancel,
    unlockPageSender(requestId),
    cancelResponse,
    createAISecretUnlockRouteContext(cancel),
    protection
  );
  await vi.waitFor(() => expect(cancelResponse).toHaveBeenCalled());
  release();
  await vi.waitFor(() => expect(submitResponse).toHaveBeenCalled());
  expect(isProtectionUnlocked).toBe(false);
  expect(submitResponse.mock.calls[0]?.[0]).toMatchObject({ success: false });
});

it('consumes exact sync continuation once after successful unlock', async () => {
  const originalChrome = globalThis.chrome;
  vi.stubGlobal('chrome', {
    runtime: { id: 'test' },
    permissions: { contains: vi.fn(async () => true) },
  });
  try {
    const intent = {
      authorization: { incarnation: '00000000-0000-4000-8000-000000000001', revision: 1 },
      credentialId: '00000000-0000-4000-8000-000000000002',
      workspaceFingerprint: null,
    };
    loadSyncConnectionMock.mockResolvedValue({
      phase: 'active',
      identity: intent.authorization,
      credentialId: intent.credentialId,
      binding: {
        rootUrl: 'https://dav.example.test/root/',
        spaceId: 'space',
        connectionGeneration: 1,
        profileCreatedAt: 1,
      },
    });
    const protection = explicitProtectionService();
    const sync = { continueSyncIntent: vi.fn(async () => undefined) };
    const start = {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'start',
      purpose: 'sync',
    } as const;
    const popup: chrome.runtime.MessageSender = {
      id: 'test',
      documentId: 'popup',
      frameId: 0,
      url: 'chrome-extension://test/apps/extension/src/popup/index.html',
    };
    const startResponse = vi.fn();
    routeAISecretUnlockMessage(
      start,
      popup,
      startResponse,
      createAISecretUnlockRouteContext(start),
      protection,
      sync
    );
    await vi.waitFor(() => expect(startResponse).toHaveBeenCalled());
    const result: unknown = startResponse.mock.calls[0]?.[0];
    if (
      typeof result !== 'object' ||
      result === null ||
      !('requestId' in result) ||
      typeof result.requestId !== 'string'
    )
      throw new Error('Expected sync unlock request');
    const submit = {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'submit',
      requestId: result.requestId,
      passphrase: 'phrase',
    } as const;
    const submitted = vi.fn();
    routeAISecretUnlockMessage(
      submit,
      unlockPageSender(result.requestId),
      submitted,
      createAISecretUnlockRouteContext(submit),
      protection,
      sync
    );
    await vi.waitFor(() => expect(submitted).toHaveBeenCalled());
    expect(sync.continueSyncIntent).toHaveBeenCalledExactlyOnceWith({
      ...intent,
      scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    });
    const replay = vi.fn();
    routeAISecretUnlockMessage(
      submit,
      unlockPageSender(result.requestId),
      replay,
      createAISecretUnlockRouteContext(submit),
      protection,
      sync
    );
    await vi.waitFor(() => expect(replay).toHaveBeenCalled());
    expect(sync.continueSyncIntent).toHaveBeenCalledOnce();
  } finally {
    vi.stubGlobal('chrome', originalChrome);
  }
});

it('does not prompt an AI caller for a locked WebDAV-only profile', async () => {
  const protection = explicitProtectionService();
  protection.readStatus = async () => ({
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
    participants: { ai: false, webdav: true },
  });
  const message = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'start',
    purpose: 'content-ai-pick',
  } as const;
  const response = vi.fn();
  routeAISecretUnlockMessage(
    message,
    ownerSender(),
    response,
    createAISecretUnlockRouteContext(message),
    protection
  );
  await expectUnlockResponse(response, { success: true, status: 'completed' });
  expect(browserWindowsCreateMock).not.toHaveBeenCalled();
  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toBeUndefined();
});

function syncUnlockFixture(nativePopup = false) {
  const permissions = vi.fn(async () => true);
  vi.stubGlobal('chrome', { runtime: { id: 'test' }, permissions: { contains: permissions } });
  const connection = {
    phase: 'active',
    identity: { incarnation: '00000000-0000-4000-8000-000000000001', revision: 1 },
    credentialId: '00000000-0000-4000-8000-000000000002',
    workspace: { fingerprint: 'a'.repeat(64) },
    binding: {
      rootUrl: 'https://dav.example.test/root/',
      spaceId: 'space',
      connectionGeneration: 1,
      profileCreatedAt: 1,
    },
  };
  loadSyncConnectionMock.mockResolvedValue(connection);
  const protection = explicitProtectionService();
  const sync = { continueSyncIntent: vi.fn(async () => undefined) };
  const popup: chrome.runtime.MessageSender = {
    id: 'test',
    ...(nativePopup ? {} : { documentId: 'popup' }),
    url: 'chrome-extension://test/apps/extension/src/popup/index.html',
  };
  const route = (message: AISecretUnlockMessage, sender = popup) => {
    const response = vi.fn();
    routeAISecretUnlockMessage(
      message,
      sender,
      response,
      createAISecretUnlockRouteContext(message),
      protection,
      sync
    );
    return response;
  };
  const start = () =>
    route({ type: MessageType.AI_SECRET_UNLOCK, operation: 'start', purpose: 'sync' });
  const startRequest = async () => {
    const response = start();
    await vi.waitFor(() => expect(response).toHaveBeenCalled());
    const result: unknown = response.mock.calls[0]?.[0];
    if (
      typeof result !== 'object' ||
      !result ||
      !('requestId' in result) ||
      typeof result.requestId !== 'string'
    )
      throw new Error('Expected sync request');
    return result.requestId;
  };
  const submit = (requestId: string) =>
    route(
      {
        type: MessageType.AI_SECRET_UNLOCK,
        operation: 'submit',
        requestId,
        passphrase: 'phrase',
      },
      { ...popup, ...unlockPageSender(requestId) }
    );
  return { connection, permissions, protection, sync, popup, route, start, startRequest, submit };
}

it('stores only the background-selected native sync intent and binds status to the original popup', async () => {
  const f = syncUnlockFixture();
  const requestId = await f.startRequest();
  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toMatchObject({
    [requestId]: {
      syncIntent: {
        authorization: f.connection.identity,
        credentialId: f.connection.credentialId,
        workspaceFingerprint: f.connection.workspace.fingerprint,
      },
    },
  });
  const status = { type: MessageType.AI_SECRET_UNLOCK, operation: 'status', requestId } as const;
  await expectUnlockResponse(f.route(status), { success: true, requestId, status: 'pending' });
  await expectUnlockResponse(f.route(status, { ...f.popup, documentId: 'reopened-popup' }), {
    success: false,
    requestId,
    status: 'failed',
    error: 'Unauthorized AI secret unlock status reader',
  });
  expect(f.sync.continueSyncIntent).not.toHaveBeenCalled();
});

it.each(['permission-denied', 'paused', 'missing-credential', 'recreated'] as const)(
  'refuses sync start for %s without changing native state or opening a prompt',
  async (scenario) => {
    const f = syncUnlockFixture();
    if (scenario === 'permission-denied') f.permissions.mockResolvedValue(false);
    if (scenario === 'paused')
      loadSyncConnectionMock.mockResolvedValue({ ...f.connection, phase: 'paused' });
    if (scenario === 'missing-credential')
      loadSyncConnectionMock.mockResolvedValue({ ...f.connection, credentialId: null });
    if (scenario === 'recreated')
      loadSyncConnectionMock.mockResolvedValueOnce(f.connection).mockResolvedValue({
        ...f.connection,
        identity: { ...f.connection.identity, incarnation: '00000000-0000-4000-8000-000000000003' },
      });
    await expectUnlockResponse(f.start(), {
      success: false,
      status: 'failed',
      error: 'Sync unlock selection refused',
    });
    expect(browserWindowsCreateMock).not.toHaveBeenCalled();
    expect(f.sync.continueSyncIntent).not.toHaveBeenCalled();
    expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toBeUndefined();
  }
);

it('refuses replacement during the origin permission wait', async () => {
  const f = syncUnlockFixture();
  let release!: (allowed: boolean) => void;
  f.permissions.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      })
  );
  const response = f.start();
  await vi.waitFor(() => expect(f.permissions).toHaveBeenCalledOnce());
  loadSyncConnectionMock.mockResolvedValue({
    ...f.connection,
    credentialId: '00000000-0000-4000-8000-000000000003',
  });
  release(true);
  await expectUnlockResponse(response, {
    success: false,
    status: 'failed',
    error: 'Sync unlock selection refused',
  });
  expect(browserWindowsCreateMock).not.toHaveBeenCalled();
  expect(f.sync.continueSyncIntent).not.toHaveBeenCalled();
});

it('refuses replacement during the protection status wait', async () => {
  const f = syncUnlockFixture();
  let release!: (status: Awaited<ReturnType<SecretProtectionService['readStatus']>>) => void;
  f.protection.readStatus = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<SecretProtectionService['readStatus']>>>((resolve) => {
        release = resolve;
      })
  );
  const response = f.start();
  await vi.waitFor(() => expect(f.protection.readStatus).toHaveBeenCalledOnce());
  loadSyncConnectionMock.mockResolvedValue({ ...f.connection, phase: 'paused' });
  release({
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
    participants: { ai: true, webdav: true },
  });
  await expectUnlockResponse(response, {
    success: false,
    status: 'failed',
    error: 'Sync unlock selection refused',
  });
  expect(browserWindowsCreateMock).not.toHaveBeenCalled();
});

it.each(['cancel', 'expiry', 'replacement', 'claim-failure'] as const)(
  'does not continue sync after %s',
  async (scenario) => {
    const f = syncUnlockFixture();
    const requestId = await f.startRequest();
    const dateSpy =
      scenario === 'expiry'
        ? vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60 * 1000 + 1)
        : undefined;
    try {
      if (scenario === 'cancel') {
        const cancel = {
          type: MessageType.AI_SECRET_UNLOCK,
          operation: 'cancel',
          requestId,
        } as const;
        await expectUnlockResponse(
          f.route(cancel, { ...f.popup, ...unlockPageSender(requestId) }),
          { success: true, requestId, status: 'failed' }
        );
      }
      if (scenario === 'replacement')
        loadSyncConnectionMock.mockResolvedValue({
          ...f.connection,
          identity: { ...f.connection.identity, revision: 2 },
        });
      if (scenario === 'claim-failure') {
        browserStorageSessionSetMock.mockImplementation(
          async (payload: Record<string, unknown>) => {
            const requests = payload[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY];
            if (
              typeof requests === 'object' &&
              requests &&
              Object.values(requests).some(
                (record: unknown) =>
                  typeof record === 'object' &&
                  record &&
                  'syncConsumed' in record &&
                  record.syncConsumed === true
              )
            )
              throw new Error('claim storage failed');
            Object.assign(sessionState, payload);
          }
        );
      }
      const response = f.submit(requestId);
      await vi.waitFor(() => expect(response).toHaveBeenCalled());
      expect(response.mock.calls[0]?.[0]).toMatchObject({ success: false });
      expect(f.sync.continueSyncIntent).not.toHaveBeenCalled();
    } finally {
      dateSpy?.mockRestore();
    }
  }
);

it('continues an already unlocked sync request once and never from status polling', async () => {
  const f = syncUnlockFixture();
  isProtectionUnlocked = true;
  const requestId = await f.startRequest();
  expect(f.sync.continueSyncIntent).toHaveBeenCalledOnce();
  const status = { type: MessageType.AI_SECRET_UNLOCK, operation: 'status', requestId } as const;
  for (let i = 0; i < 2; i++)
    await expectUnlockResponse(f.route(status), { success: true, requestId, status: 'completed' });
  await expectUnlockResponse(f.submit(requestId), {
    success: false,
    requestId,
    status: 'failed',
    error: 'AI secret unlock request is not pending',
  });
  expect(f.sync.continueSyncIntent).toHaveBeenCalledOnce();
  expect(browserWindowsCreateMock).not.toHaveBeenCalled();
});

it('continues a native document-less popup request once and permits only its status observation', async () => {
  const f = syncUnlockFixture(true);
  const requestId = await f.startRequest();
  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toMatchObject({
    [requestId]: { senderKey: 'sync:popup:extension:test' },
  });
  const status = { type: MessageType.AI_SECRET_UNLOCK, operation: 'status', requestId } as const;
  await expectUnlockResponse(f.route(status), { success: true, requestId, status: 'pending' });
  await expectUnlockResponse(f.submit(requestId), {
    success: true,
    requestId,
    status: 'completed',
  });
  await expectUnlockResponse(f.route(status), { success: true, requestId, status: 'completed' });
  await expectUnlockResponse(f.route(status), { success: true, requestId, status: 'completed' });
  expect(f.sync.continueSyncIntent).toHaveBeenCalledTimes(1);
});
