import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createAISecretUnlockRouteContext } from './secret-unlock-route.test-support';

const {
  browserTabsCreateMock,
  browserStorageSessionGetMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  browserWindowsCreateMock,
  loadAISecretProtectionStatusMock,
  resolveLlmSessionSenderKeyMock,
  unlockAISecretProtectionMock,
} = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
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

import {
  resetAISecretUnlockRequestsForTests,
  routeAISecretUnlockMessage,
} from './secret-unlock-route';

let sessionState: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
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
  loadAISecretProtectionStatusMock.mockResolvedValue({
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
  });
  resolveLlmSessionSenderKeyMock.mockReturnValue('sender-key-1');
  unlockAISecretProtectionMock.mockResolvedValue(undefined);
});

function routePreauthorizedStart(
  sender: chrome.runtime.MessageSender,
  sendResponse: Parameters<typeof routeAISecretUnlockMessage>[2]
): boolean {
  const message = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'start',
    purpose: 'content-ai-pick',
  } as const;
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

it('opens an extension-owned unlock window for authorized locked requests', async () => {
  const sendResponse = vi.fn();

  expect(routePreauthorizedStart({ tab: { id: 7 } as chrome.tabs.Tab }, sendResponse)).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      reason: 'ai-secrets-locked',
      requestId: expect.any(String) as string,
      status: 'pending',
    });
  });
  expect(browserWindowsCreateMock).toHaveBeenCalledWith(
    expect.objectContaining({
      focused: true,
      type: 'popup',
      url: expect.stringContaining('apps/extension/src/settings/index.html?aiUnlock=1&requestId='),
    })
  );
});

it('falls back to an extension tab when the unlock popup cannot open', async () => {
  const sendResponse = vi.fn();
  browserWindowsCreateMock.mockRejectedValueOnce(new Error('popup blocked'));

  routePreauthorizedStart({ tab: { id: 7 } as chrome.tabs.Tab }, sendResponse);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String) as string,
        status: 'pending',
        success: true,
      })
    );
  });
  expect(browserTabsCreateMock).toHaveBeenCalledWith({
    url: expect.stringContaining('apps/extension/src/settings/index.html?aiUnlock=1&requestId='),
  });
});

it('returns completed without opening UI when AI secrets are already unlocked', async () => {
  const sendResponse = vi.fn();
  loadAISecretProtectionStatusMock.mockResolvedValueOnce({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
  });

  routePreauthorizedStart({ tab: { id: 7 } as chrome.tabs.Tab }, sendResponse);

  await expectUnlockResponse(sendResponse, { success: true, status: 'completed' });
  expect(browserWindowsCreateMock).not.toHaveBeenCalled();
});

it('rejects unlock starts from unauthorized LLM senders', async () => {
  const sendResponse = vi.fn();

  routeAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'start',
      purpose: 'content-ai-pick',
    },
    { url: 'https://example.test/' },
    sendResponse
  );

  await expectUnlockResponse(sendResponse, {
    success: false,
    error: 'Unauthorized AI secret unlock sender',
  });
  expect(browserWindowsCreateMock).not.toHaveBeenCalled();
});
