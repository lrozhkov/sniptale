// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const messagingMocks = vi.hoisted(() => ({
  createRuntimeMessagingTransport: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));
const trustedEventMocks = vi.hoisted(() => ({ isTrustedDomEvent: vi.fn() }));

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: messagingMocks.createRuntimeMessagingTransport,
}));

import {
  attachContentActionIntent,
  createTrustedContentActionIntentSource,
  resetContentActionIntentRuntimeForTests,
} from '.';

beforeEach(() => {
  vi.clearAllMocks();
  messagingMocks.createRuntimeMessagingTransport.mockReturnValue({
    sendRuntimeMessage: messagingMocks.sendRuntimeMessage,
  });
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-1') });
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
});

afterEach(() => {
  resetContentActionIntentRuntimeForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function queueSuccessfulIntentExchange(args: {
  activationKey: { expiresAtEpochMs: number; keyId: string; secret: string };
  proofToken: string;
  runtimeToken: string;
  token: string;
}) {
  messagingMocks.sendRuntimeMessage
    .mockResolvedValueOnce({ activationKey: args.activationKey, success: true })
    .mockResolvedValueOnce({ runtimeToken: { runtimeToken: args.runtimeToken }, success: true })
    .mockResolvedValueOnce({ success: true, trustedEventProof: { proofToken: args.proofToken } })
    .mockResolvedValueOnce({
      contentIntent: { requestId: 'request-1', token: args.token },
      success: true,
    });
}

async function attachQuickActionIntent() {
  const message = { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION };
  return attachContentActionIntent(
    message,
    createTrustedContentActionIntentSource(new Event('click'))
  );
}

it('does not reuse activation keys after successful runtime token exchange', async () => {
  const secondActivationKey = {
    expiresAtEpochMs: 60_000,
    keyId: 'activation-2',
    secret: 'secret-2',
  };
  queueSuccessfulIntentExchange({
    activationKey: { expiresAtEpochMs: 60_000, keyId: 'activation-1', secret: 'secret-1' },
    proofToken: 'proof-1',
    runtimeToken: 'runtime-token-1',
    token: 'token-1',
  });
  queueSuccessfulIntentExchange({
    activationKey: secondActivationKey,
    proofToken: 'proof-2',
    runtimeToken: 'runtime-token-2',
    token: 'token-2',
  });
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);

  await attachQuickActionIntent();
  await attachQuickActionIntent();

  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(5, {
    purpose: 'trusted-content-event',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(6, {
    actionType: MessageType.TRIGGER_QUICK_ACTION,
    activationProof: secondActivationKey,
    requestId: 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  });
});

it('discards expired cached activation keys before requesting runtime tokens', async () => {
  const refreshedKey = { expiresAtEpochMs: 60_000, keyId: 'activation-2', secret: 'secret-2' };
  queueSuccessfulIntentExchange({
    activationKey: { expiresAtEpochMs: 500, keyId: 'activation-1', secret: 'secret-1' },
    proofToken: 'proof-1',
    runtimeToken: 'runtime-token-1',
    token: 'token-1',
  });
  queueSuccessfulIntentExchange({
    activationKey: refreshedKey,
    proofToken: 'proof-2',
    runtimeToken: 'runtime-token-2',
    token: 'token-2',
  });
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);

  await attachQuickActionIntent();
  await attachQuickActionIntent();

  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(5, {
    purpose: 'trusted-content-event',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(6, {
    actionType: MessageType.TRIGGER_QUICK_ACTION,
    activationProof: refreshedKey,
    requestId: 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  });
});
