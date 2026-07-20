import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createAISecretUnlockRouteContext } from './secret-unlock-route.test-support';

const {
  browserStorageSessionGetMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  unlockAISecretProtectionMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
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
  browserWindows: { create: vi.fn() },
}));

vi.mock('../../../composition/persistence/ai-settings/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings/core')>()),
  loadAISecretProtectionStatus: vi.fn(),
  unlockAISecretProtection: unlockAISecretProtectionMock,
}));

vi.mock('../../../composition/persistence/ai-settings/graph-mutations', () => ({
  loadSerializedAISecretProtectionStatus: vi.fn(),
  mutateStoredAISettings: (command: { passphrase: string }) =>
    unlockAISecretProtectionMock(command.passphrase),
  resetAISettingsMutationQueueForTests: vi.fn(),
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
});

function createUnlockPageSender(requestId: string): chrome.runtime.MessageSender {
  return {
    url: `chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1&requestId=${requestId}`,
  };
}

async function expectUnlockResponse(sendResponse: ReturnType<typeof vi.fn>, response: unknown) {
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(response);
  });
}

it('accepts cloned authorized messages through explicit route context', async () => {
  const sendResponse = vi.fn();
  const message = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'cancel',
    requestId: 'missing-request',
  } as const;

  routeAISecretUnlockMessage(
    { ...message },
    createUnlockPageSender('missing-request'),
    sendResponse,
    createAISecretUnlockRouteContext(message)
  );

  await expectUnlockResponse(sendResponse, {
    success: true,
    requestId: 'missing-request',
    status: 'failed',
  });
});

it('rejects explicit route context reused for a different unlock operation', async () => {
  const sendResponse = vi.fn();

  routeAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'submit',
      requestId: 'missing-request',
      passphrase: 'passphrase',
    },
    createUnlockPageSender('missing-request'),
    sendResponse,
    createAISecretUnlockRouteContext({
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'cancel',
      requestId: 'missing-request',
    })
  );

  await expectUnlockResponse(sendResponse, {
    success: false,
    error: 'Unauthorized AI secret unlock submitter',
  });
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});

it('rejects explicit route context reused for a different unlock request id', async () => {
  const sendResponse = vi.fn();

  routeAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'cancel',
      requestId: 'other-request',
    },
    createUnlockPageSender('other-request'),
    sendResponse,
    createAISecretUnlockRouteContext({
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'cancel',
      requestId: 'missing-request',
    })
  );

  await expectUnlockResponse(sendResponse, {
    success: false,
    error: 'Unauthorized AI secret unlock canceller',
  });
});

it('rejects cloned messages without explicit route context', async () => {
  const sendResponse = vi.fn();

  routeAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'cancel',
      requestId: 'missing-request',
    },
    createUnlockPageSender('missing-request'),
    sendResponse
  );

  await expectUnlockResponse(sendResponse, {
    success: false,
    error: 'Unauthorized AI secret unlock canceller',
  });
});
