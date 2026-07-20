import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AISecretUnlockMessage } from '../../../contracts/messaging/ai-secret-unlock';
import {
  createAISecretUnlockPageSender,
  expectUnlockResponse,
  routeAISecretUnlockTestMessage,
  startAISecretUnlockTestRequest,
} from './secret-unlock-route.test-support';

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

import { resetAISecretUnlockRequestsForTests } from './secret-unlock-route';

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

function submitUnlockRequest(
  requestId: string,
  senderRequestId = requestId,
  options: { withRouteContext?: boolean } = {}
) {
  return submitUnlockRequestFromSender(
    requestId,
    createAISecretUnlockPageSender(senderRequestId),
    options
  );
}

function submitUnlockRequestFromSender(
  requestId: string,
  sender: chrome.runtime.MessageSender,
  options: { withRouteContext?: boolean } = {}
) {
  const sendResponse = vi.fn();
  const message = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'submit',
    requestId,
    passphrase: 'passphrase',
  } satisfies AISecretUnlockMessage;

  routeAISecretUnlockTestMessage(message, sender, sendResponse, options);

  return sendResponse;
}

function cancelUnlockRequest(
  requestId: string,
  senderRequestId = requestId,
  options: { withRouteContext?: boolean } = {}
) {
  const sendResponse = vi.fn();
  const message = {
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'cancel',
    requestId,
  } satisfies AISecretUnlockMessage;

  routeAISecretUnlockTestMessage(
    message,
    createAISecretUnlockPageSender(senderRequestId),
    sendResponse,
    options
  );

  return sendResponse;
}

it('rejects submit messages without route preauthorization before verification', async () => {
  const missingUrlResponse = submitUnlockRequestFromSender(
    'request-1',
    {},
    { withRouteContext: false }
  );
  const malformedUrlResponse = submitUnlockRequestFromSender(
    'request-1',
    { url: 'http://[::1' },
    { withRouteContext: false }
  );
  const missingRequestIdResponse = submitUnlockRequestFromSender(
    'request-1',
    {
      url: 'chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1',
    },
    { withRouteContext: false }
  );

  await vi.waitFor(() => {
    expect(missingUrlResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized AI secret unlock submitter',
    });
    expect(malformedUrlResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized AI secret unlock submitter',
    });
    expect(missingRequestIdResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized AI secret unlock submitter',
    });
  });
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});

it('rejects missing or mismatched unlock request ids before verification', async () => {
  const missingResponse = submitUnlockRequest('missing-request');
  const requestId = await startAISecretUnlockTestRequest();
  unlockAISecretProtectionMock.mockClear();
  const mismatchResponse = submitUnlockRequest(requestId, 'other-request', {
    withRouteContext: false,
  });

  await vi.waitFor(() => {
    expect(missingResponse).toHaveBeenCalledWith({
      success: false,
      requestId: 'missing-request',
      status: 'restart-required',
      error: 'AI secret unlock request must be restarted',
    });
    expect(mismatchResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized AI secret unlock submitter',
    });
  });
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});

it('rejects unlock cancellation from mismatched unlock pages', async () => {
  const requestId = await startAISecretUnlockTestRequest();
  const sendResponse = cancelUnlockRequest(requestId, 'other-request', { withRouteContext: false });

  await expectUnlockResponse(sendResponse, {
    success: false,
    error: 'Unauthorized AI secret unlock canceller',
  });
});

it('accepts authorized cancellation and rejects later submit replays', async () => {
  const requestId = await startAISecretUnlockTestRequest();
  const cancelResponse = cancelUnlockRequest(requestId);

  await expectUnlockResponse(cancelResponse, {
    success: true,
    requestId,
    status: 'failed',
  });

  const replayResponse = submitUnlockRequest(requestId);
  await expectUnlockResponse(replayResponse, {
    success: false,
    requestId,
    status: 'failed',
    error: 'AI secret unlock request cancelled',
  });
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});

it('rejects duplicate unlock submits before passphrase verification', async () => {
  const requestId = await startAISecretUnlockTestRequest();
  const firstResponse = submitUnlockRequest(requestId);

  await expectUnlockResponse(firstResponse, {
    success: true,
    requestId,
    status: 'completed',
  });

  unlockAISecretProtectionMock.mockClear();
  const duplicateResponse = submitUnlockRequest(requestId);

  await expectUnlockResponse(duplicateResponse, {
    success: false,
    requestId,
    status: 'failed',
    error: 'AI secret unlock request is not pending',
  });
  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});

it('rejects expired unlock submits before passphrase verification', async () => {
  const requestId = await startAISecretUnlockTestRequest();
  const now = Date.now();
  const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60 * 1000 + 1);
  try {
    const expiredResponse = submitUnlockRequest(requestId);

    await expectUnlockResponse(expiredResponse, {
      success: false,
      requestId,
      status: 'expired',
      error: 'AI secret unlock request expired',
    });
  } finally {
    dateNowSpy.mockRestore();
  }

  expect(unlockAISecretProtectionMock).not.toHaveBeenCalled();
});
