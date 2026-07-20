import { beforeEach, expect, it, vi } from 'vitest';

import { AISecretInvalidPassphraseError } from '../../../composition/persistence/ai-settings/secret-protection.store.ts';

const {
  browserStorageSessionGetMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  browserTabsCreateMock,
  browserWindowsCreateMock,
  loadAISecretProtectionStatusMock,
  resolveLlmSessionSenderKeyMock,
  unlockAISecretProtectionMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
  browserTabsCreateMock: vi.fn(),
  browserWindowsCreateMock: vi.fn(),
  loadAISecretProtectionStatusMock: vi.fn(),
  resolveLlmSessionSenderKeyMock: vi.fn(),
  unlockAISecretProtectionMock: vi.fn(),
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

import { resetAISecretUnlockRequestsForTests } from './secret-unlock-route';
import {
  createAISecretUnlockRouteHarness,
  expectUnlockResponse,
} from './secret-unlock-route.test-support';

let isProtectionUnlocked = false;
let sessionState: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  isProtectionUnlocked = false;
  sessionState = {};
  resetAISecretUnlockRequestsForTests();
  browserStorageSessionGetMock.mockImplementation(readSessionStorage);
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

async function readSessionStorage(key: string): Promise<Record<string, unknown>> {
  return {
    ...(key in sessionState ? { [key]: sessionState[key] } : {}),
  };
}

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

function routeHarness() {
  return createAISecretUnlockRouteHarness({
    getSessionState: () => sessionState,
    ownerSender,
    unlockPageSender,
  });
}

it('rejects duplicate submits while verification is in flight', async () => {
  const { getStoredUnlockRequestMap, startUnlockRequest, submitUnlockRequest } = routeHarness();
  const requestId = await startUnlockRequest();
  let resolveUnlock: (() => void) | undefined;
  unlockAISecretProtectionMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveUnlock = resolve;
      })
  );

  const firstSubmit = submitUnlockRequest(requestId);
  await vi.waitFor(() => {
    expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('submitted');
  });
  await expectUnlockResponse(submitUnlockRequest(requestId), {
    error: 'AI secret unlock request is not pending',
    requestId,
    status: 'submitted',
    success: false,
  });

  resolveUnlock?.();
  await expectUnlockResponse(firstSubmit, { requestId, status: 'completed', success: true });
});

it('does not terminalize cancellation while successful submit verification is in flight', async () => {
  const {
    cancelUnlockRequest,
    getStoredUnlockRequestMap,
    startUnlockRequest,
    submitUnlockRequest,
  } = routeHarness();
  const requestId = await startUnlockRequest();
  let resolveUnlock: (() => void) | undefined;
  unlockAISecretProtectionMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveUnlock = resolve;
      })
  );

  const submitResponse = submitUnlockRequest(requestId);
  await vi.waitFor(() => {
    expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('submitted');
  });
  await expectUnlockResponse(cancelUnlockRequest(requestId), {
    error: 'AI secret unlock request is not pending',
    requestId,
    status: 'submitted',
    success: false,
  });

  resolveUnlock?.();
  await expectUnlockResponse(submitResponse, { requestId, status: 'completed', success: true });
  expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('completed');
});

it('keeps submitted cancellation non-terminal when invalid-passphrase rollback follows', async () => {
  const {
    cancelUnlockRequest,
    getStoredUnlockRequestMap,
    startUnlockRequest,
    submitUnlockRequest,
  } = routeHarness();
  const requestId = await startUnlockRequest();
  let rejectUnlock: ((error: Error) => void) | undefined;
  unlockAISecretProtectionMock.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectUnlock = reject;
      })
  );

  const submitResponse = submitUnlockRequest(requestId);
  await vi.waitFor(() => {
    expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('submitted');
  });
  await expectUnlockResponse(cancelUnlockRequest(requestId), {
    error: 'AI secret unlock request is not pending',
    requestId,
    status: 'submitted',
    success: false,
  });

  rejectUnlock?.(new AISecretInvalidPassphraseError());
  await expectUnlockResponse(submitResponse, {
    error: 'Invalid AI secret passphrase',
    requestId,
    status: 'pending',
    success: false,
  });
  expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('pending');
});
