import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AISecretUnlockMessage } from '../../../contracts/messaging/ai-secret-unlock';

const {
  browserStorageSessionGetMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  browserWindowsCreateMock,
  loadAISecretProtectionStatusMock,
  resolveLlmSessionSenderKeyMock,
  unlockAISecretProtectionMock,
} = vi.hoisted(() => ({
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
import { createAISecretUnlockRouteContext } from './secret-unlock-route.test-support';

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
  const message = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'start',
    purpose: 'content-ai-pick',
  } as const;
  routePreauthorizedAISecretUnlockMessage(
    message,
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

function submitUnlockRequest(requestId: string, senderRequestId = requestId) {
  const sendResponse = vi.fn();
  const message = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'submit',
    requestId,
    passphrase: 'passphrase',
  } as const;
  routePreauthorizedAISecretUnlockMessage(
    message,
    createUnlockPageSender(senderRequestId),
    sendResponse
  );

  return sendResponse;
}

function cancelUnlockRequest(requestId: string) {
  const sendResponse = vi.fn();
  const message = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'cancel',
    requestId,
  } as const;
  routePreauthorizedAISecretUnlockMessage(message, createUnlockPageSender(requestId), sendResponse);

  return sendResponse;
}

async function expectUnlockResponse(sendResponse: ReturnType<typeof vi.fn>, response: unknown) {
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(response);
  });
}

it('accepts passphrase submits only from the extension unlock page', async () => {
  const requestId = await startUnlockRequestAndReadId();
  const sendResponse = submitUnlockRequest(requestId);

  await expectUnlockResponse(sendResponse, {
    success: true,
    requestId,
    status: 'completed',
  });
  expect(unlockAISecretProtectionMock).toHaveBeenCalledWith('passphrase');
});

it('allows unlock pages to cancel missing requests without passphrase verification', async () => {
  const sendResponse = cancelUnlockRequest('missing-request');

  await expectUnlockResponse(sendResponse, {
    success: true,
    requestId: 'missing-request',
    status: 'failed',
  });
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});

it('rejects passphrase submits from non-unlock extension pages', async () => {
  const sendResponse = vi.fn();

  routeAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'submit',
      requestId: 'request-1',
      passphrase: 'passphrase',
    },
    { url: 'chrome-extension://test/apps/extension/src/settings/index.html' },
    sendResponse
  );

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized AI secret unlock submitter',
    });
  });
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});
