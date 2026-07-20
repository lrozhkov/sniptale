import { expect, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AISecretUnlockMessage } from '../../../contracts/messaging/ai-secret-unlock';
import { AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY } from '../../../composition/persistence/ai-settings/constants';
import type { BackgroundOwnedRouteContext } from '../../routing-contracts/owned-route-context';
import { routeAISecretUnlockMessage } from './secret-unlock-route';

type AISecretUnlockRouteHarnessArgs = {
  getSessionState: () => Record<string, unknown>;
  ownerSender: () => chrome.runtime.MessageSender;
  unlockPageSender: (requestId: string) => chrome.runtime.MessageSender;
};

type RouteAISecretUnlockTestMessageOptions = {
  readonly withRouteContext?: boolean;
};

function routePreauthorizedAISecretUnlockMessage(
  message: AISecretUnlockMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: Parameters<typeof routeAISecretUnlockMessage>[2]
): boolean {
  return routeAISecretUnlockTestMessage(message, sender, sendResponse);
}

export function routeAISecretUnlockTestMessage(
  message: AISecretUnlockMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: Parameters<typeof routeAISecretUnlockMessage>[2],
  options: RouteAISecretUnlockTestMessageOptions = {}
): boolean {
  const routeContext =
    options.withRouteContext === false ? null : createAISecretUnlockRouteContext(message);
  return routeAISecretUnlockMessage(message, sender, sendResponse, routeContext);
}

export async function startAISecretUnlockTestRequest(
  sender: chrome.runtime.MessageSender = { tab: { id: 7 } as chrome.tabs.Tab }
): Promise<string> {
  const sendResponse = vi.fn();
  routeAISecretUnlockTestMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'start',
      purpose: 'content-ai-pick',
    },
    sender,
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

async function startUnlockRequest(args: AISecretUnlockRouteHarnessArgs): Promise<string> {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'start',
      purpose: 'content-ai-pick',
    },
    args.ownerSender(),
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

function submitUnlockRequest(args: AISecretUnlockRouteHarnessArgs, requestId: string) {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'submit',
      passphrase: 'passphrase',
      requestId,
    },
    args.unlockPageSender(requestId),
    sendResponse
  );
  return sendResponse;
}

function cancelUnlockRequest(args: AISecretUnlockRouteHarnessArgs, requestId: string) {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'cancel',
      requestId,
    },
    args.unlockPageSender(requestId),
    sendResponse
  );
  return sendResponse;
}

function readUnlockStatus(args: AISecretUnlockRouteHarnessArgs, requestId: string) {
  const sendResponse = vi.fn();
  routePreauthorizedAISecretUnlockMessage(
    {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'status',
      requestId,
    },
    args.ownerSender(),
    sendResponse
  );
  return sendResponse;
}

function getStoredUnlockRequestMap(args: AISecretUnlockRouteHarnessArgs) {
  return args.getSessionState()[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY] as
    | Record<string, { status?: string }>
    | undefined;
}

export function createAISecretUnlockRouteHarness(args: AISecretUnlockRouteHarnessArgs) {
  return {
    cancelUnlockRequest: (requestId: string) => cancelUnlockRequest(args, requestId),
    getStoredUnlockRequestMap: () => getStoredUnlockRequestMap(args),
    readUnlockStatus: (requestId: string) => readUnlockStatus(args, requestId),
    startUnlockRequest: () => startUnlockRequest(args),
    submitUnlockRequest: (requestId: string) => submitUnlockRequest(args, requestId),
  };
}

export async function expectUnlockResponse(
  sendResponse: ReturnType<typeof vi.fn>,
  response: unknown
) {
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(response);
  });
}

export function createAISecretUnlockPageSender(requestId: string): chrome.runtime.MessageSender {
  return {
    url: `chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1&requestId=${requestId}`,
  };
}

export function createAISecretUnlockRouteContext(
  message: AISecretUnlockMessage
): BackgroundOwnedRouteContext {
  return {
    authorityFamily: 'ai-secret-unlock-authority',
    freshnessReplay: 'sync-policy-approved',
    messageBinding: createAISecretUnlockMessageBinding(message),
    ownerRoute: {
      handlerId: 'ai-secret-unlock',
      messageTypes: [MessageType.AI_SECRET_UNLOCK],
      ownerModule: 'apps/extension/src/background/ai/settings/secret-unlock-route.ts',
      policyStateIds: ['ai-secret-unlock-requests'],
      routeAuthorityFamily: 'background-owned-ipc',
    },
    preauthorization: { kind: 'ai-secret-unlock-route' },
    senderClassification: 'test-runtime',
  };
}

function createAISecretUnlockMessageBinding(message: AISecretUnlockMessage) {
  if (message.operation === 'start') {
    return {
      operation: message.operation,
      purpose: message.purpose,
      type: MessageType.AI_SECRET_UNLOCK,
    };
  }
  return {
    operation: message.operation,
    requestId: message.requestId,
    type: MessageType.AI_SECRET_UNLOCK,
  };
}
