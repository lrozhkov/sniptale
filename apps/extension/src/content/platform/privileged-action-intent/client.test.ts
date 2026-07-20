// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedDomEvent: vi.fn(),
}));

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
}));

import { createContentActionIntentClient } from './client';
import type { ContentActionIntentMessage } from './types';

const ACTIVATION_KEY = {
  expiresAtEpochMs: 60_000,
  keyId: 'activation-1',
  secret: 'secret-1',
};

type ActivationKeyResponse = {
  activationKey: typeof ACTIVATION_KEY;
  success: true;
};

function createDeferredActivationKey() {
  let resolvePromise: ((value: ActivationKeyResponse) => void) | null = null;
  const promise = new Promise<ActivationKeyResponse>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => resolvePromise?.({ activationKey: ACTIVATION_KEY, success: true }),
  };
}

function createConcurrentSendMessage(activationKeyRequest: {
  promise: Promise<ActivationKeyResponse>;
}) {
  return vi.fn(async (message: ContentActionIntentMessage) => {
    if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY) {
      return activationKeyRequest.promise;
    }
    if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN) {
      return { runtimeToken: { runtimeToken: `runtime-${message.requestId}` }, success: true };
    }
    if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF) {
      return { success: true, trustedEventProof: { proofToken: `proof-${message.requestId}` } };
    }
    return {
      contentIntent: { requestId: message.requestId, token: `token-${message.requestId}` },
      success: true,
    };
  });
}

function createConcurrentClient(sendMessage: ReturnType<typeof createConcurrentSendMessage>) {
  const requestIds = ['request-1', 'request-2'];
  return createContentActionIntentClient({
    randomId: () => requestIds.shift() ?? 'unexpected-request',
    sendMessage,
  });
}

function attachConcurrentQuickActions(client: ReturnType<typeof createContentActionIntentClient>) {
  return [
    client.attachContentActionIntent(
      { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION },
      client.createTrustedContentActionIntentSource(new Event('click'))
    ),
    client.attachContentActionIntent(
      { actionId: 'quick-action-2', type: MessageType.TRIGGER_QUICK_ACTION },
      client.createTrustedContentActionIntentSource(new Event('keydown'))
    ),
  ] as const;
}

function expectActivationKeyRequestedOnce(
  sendMessage: ReturnType<typeof createConcurrentSendMessage>
) {
  expect(sendMessage).toHaveBeenCalledWith({
    purpose: 'trusted-content-event',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  expect(
    sendMessage.mock.calls.filter(
      ([message]) => message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY
    )
  ).toHaveLength(1);
}

beforeEach(() => {
  vi.clearAllMocks();
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
});

it('shares concurrent activation key requests within a client instance', async () => {
  const activationKeyRequest = createDeferredActivationKey();
  const sendMessage = createConcurrentSendMessage(activationKeyRequest);
  const [first, second] = attachConcurrentQuickActions(createConcurrentClient(sendMessage));
  activationKeyRequest.resolve();

  await expect(Promise.all([first, second])).resolves.toEqual([
    {
      actionId: 'quick-action-1',
      contentIntent: { requestId: 'request-1', token: 'token-request-1' },
      type: MessageType.TRIGGER_QUICK_ACTION,
    },
    {
      actionId: 'quick-action-2',
      contentIntent: { requestId: 'request-2', token: 'token-request-2' },
      type: MessageType.TRIGGER_QUICK_ACTION,
    },
  ]);
  expectActivationKeyRequestedOnce(sendMessage);
});
