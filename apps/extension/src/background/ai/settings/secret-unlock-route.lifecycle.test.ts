import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AISecretUnlockMessage } from '../../../contracts/messaging/ai-secret-unlock';
import { AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY } from '../../../composition/persistence/ai-settings/constants';

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
