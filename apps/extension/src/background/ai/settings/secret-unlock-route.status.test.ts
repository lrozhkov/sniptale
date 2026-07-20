import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AISecretUnlockMessage } from '../../../contracts/messaging/ai-secret-unlock';

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

import { createAISecretUnlockRouteContext } from './secret-unlock-route.test-support';
import {
  authorizeAISecretUnlockSender,
  resetAISecretUnlockRequestsForTests,
  routeAISecretUnlockMessage,
} from './secret-unlock-route';

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

function createUnlockPageSender(requestId: string): chrome.runtime.MessageSender {
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

async function startUnlockRequestAndReadId(): Promise<string> {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'start',
      purpose: 'content-ai-pick',
    },
    { tab: { id: 7 } as chrome.tabs.Tab },
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

function submitUnlockRequest(requestId: string) {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'submit',
      requestId,
      passphrase: 'passphrase',
    },
    createUnlockPageSender(requestId),
    sendResponse
  );

  return sendResponse;
}

function readUnlockStatus(requestId: string, sender: chrome.runtime.MessageSender) {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'status',
      requestId,
    },
    sender,
    sendResponse
  );

  return sendResponse;
}

async function expectUnlockResponse(sendResponse: ReturnType<typeof vi.fn>, response: unknown) {
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(response);
  });
}

it('coarsely authorizes unknown status requests without reading protection state', () => {
  expect(
    authorizeAISecretUnlockSender(
      {
        type: MessageType.AI_SECRET_UNLOCK,
        operation: 'status',
        requestId: 'unknown-request',
      },
      { tab: { id: 7 } as chrome.tabs.Tab }
    )
  ).toBeNull();
  expect(loadAISecretProtectionStatusMock).not.toHaveBeenCalled();
});

it('allows the owner to read unlocked status after the unlock page submits', async () => {
  const requestId = await startUnlockRequestAndReadId();
  const sendResponse = submitUnlockRequest(requestId);
  await expectUnlockResponse(sendResponse, {
    success: true,
    requestId,
    status: 'completed',
  });

  expect(
    authorizeAISecretUnlockSender(
      {
        type: MessageType.AI_SECRET_UNLOCK,
        operation: 'status',
        requestId,
      },
      { tab: { id: 7 } as chrome.tabs.Tab }
    )
  ).toBeNull();

  const statusResponse = readUnlockStatus(requestId, { tab: { id: 7 } as chrome.tabs.Tab });
  await expectUnlockResponse(statusResponse, {
    success: true,
    requestId,
    status: 'completed',
  });
});

it('rejects non-owner status authorization after the unlock page submits', async () => {
  const requestId = await startUnlockRequestAndReadId();
  const sendResponse = submitUnlockRequest(requestId);
  await expectUnlockResponse(sendResponse, {
    success: true,
    requestId,
    status: 'completed',
  });
  resolveLlmSessionSenderKeyMock.mockReturnValue('sender-key-2');

  expect(
    authorizeAISecretUnlockSender(
      {
        type: MessageType.AI_SECRET_UNLOCK,
        operation: 'status',
        requestId,
      },
      { tab: { id: 8 } as chrome.tabs.Tab }
    )
  ).toBe('Unauthorized AI secret unlock status reader');
});
