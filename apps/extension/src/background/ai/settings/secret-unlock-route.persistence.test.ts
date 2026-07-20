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
  browserStorageSessionSetMock.mockImplementation(writeSessionStorage);
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

async function writeSessionStorage(payload: Record<string, unknown>): Promise<void> {
  Object.assign(sessionState, payload);
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

const routeHarness = () =>
  createAISecretUnlockRouteHarness({
    getSessionState: () => sessionState,
    ownerSender,
    unlockPageSender,
  });

it('does not verify passphrase when submitted-state persistence fails', async () => {
  const { startUnlockRequest, submitUnlockRequest } = routeHarness();
  const requestId = await startUnlockRequest();
  browserStorageSessionSetMock.mockRejectedValueOnce(new Error('session write failed'));

  await expectUnlockResponse(submitUnlockRequest(requestId), {
    error: 'session write failed',
    requestId,
    status: 'failed',
    success: false,
  });
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});

it('recovers completed status polling when completion persistence fails after unlock', async () => {
  const { getStoredUnlockRequestMap, readUnlockStatus, startUnlockRequest, submitUnlockRequest } =
    routeHarness();
  const requestId = await startUnlockRequest();
  browserStorageSessionSetMock.mockImplementationOnce(writeSessionStorage);
  browserStorageSessionSetMock.mockRejectedValueOnce(new Error('completion write failed'));

  await expectUnlockResponse(submitUnlockRequest(requestId), {
    error: 'completion write failed',
    requestId,
    status: 'failed',
    success: false,
  });

  expect(unlockAISecretProtectionMock).toHaveBeenCalledWith('passphrase');
  expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('submitted');
  await expectUnlockResponse(readUnlockStatus(requestId), {
    requestId,
    status: 'completed',
    success: true,
  });
});

it('rolls invalid passphrase submissions back to pending', async () => {
  const { getStoredUnlockRequestMap, startUnlockRequest, submitUnlockRequest } = routeHarness();
  const requestId = await startUnlockRequest();
  unlockAISecretProtectionMock.mockRejectedValueOnce(new AISecretInvalidPassphraseError());

  await expectUnlockResponse(submitUnlockRequest(requestId), {
    error: 'Invalid AI secret passphrase',
    requestId,
    status: 'pending',
    success: false,
  });

  expect(unlockAISecretProtectionMock).toHaveBeenCalledWith('passphrase');
  expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('pending');
});

it('returns restart-required when invalid-passphrase rollback persistence fails', async () => {
  const { getStoredUnlockRequestMap, readUnlockStatus, startUnlockRequest, submitUnlockRequest } =
    routeHarness();
  const requestId = await startUnlockRequest();
  unlockAISecretProtectionMock.mockRejectedValueOnce(new AISecretInvalidPassphraseError());
  browserStorageSessionSetMock.mockImplementationOnce(writeSessionStorage);
  browserStorageSessionSetMock.mockRejectedValueOnce(new Error('rollback write failed'));

  await expectUnlockResponse(submitUnlockRequest(requestId), {
    error: 'rollback write failed',
    requestId,
    status: 'failed',
    success: false,
  });

  expect(unlockAISecretProtectionMock).toHaveBeenCalledWith('passphrase');
  expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('submitted');
  await expectUnlockResponse(readUnlockStatus(requestId), {
    error: 'AI secret unlock submission state was interrupted',
    requestId,
    status: 'restart-required',
    success: false,
  });
});

it('leaves submitted recovery state when unlock infrastructure fails', async () => {
  const { getStoredUnlockRequestMap, readUnlockStatus, startUnlockRequest, submitUnlockRequest } =
    routeHarness();
  const requestId = await startUnlockRequest();
  unlockAISecretProtectionMock.mockRejectedValueOnce(new Error('local storage unavailable'));

  await expectUnlockResponse(submitUnlockRequest(requestId), {
    error: 'local storage unavailable',
    requestId,
    status: 'failed',
    success: false,
  });

  expect(unlockAISecretProtectionMock).toHaveBeenCalledWith('passphrase');
  expect(getStoredUnlockRequestMap()?.[requestId]?.status).toBe('submitted');
  await expectUnlockResponse(readUnlockStatus(requestId), {
    error: 'AI secret unlock submission state was interrupted',
    requestId,
    status: 'restart-required',
    success: false,
  });
});
