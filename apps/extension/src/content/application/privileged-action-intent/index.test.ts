// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const messagingMocks = vi.hoisted(() => ({
  createRuntimeMessagingTransport: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));
const trustedEventMocks = vi.hoisted(() => ({
  isTrustedDomEvent: vi.fn(),
}));

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
  createBackgroundAutoStartContentActionIntentSource,
  createTrustedContentActionIntentSource,
  resetContentActionIntentRuntimeForTests,
} from '.';
import { createBridgedMouseEvent } from '../../platform/trusted-events/synthetic-mouse';

const ACTIVATION_KEY = {
  expiresAtEpochMs: 60_000,
  keyId: 'activation-1',
  secret: 'secret-1',
};

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

it('returns null for untrusted DOM events and source for trusted DOM events', () => {
  const event = new Event('click');

  trustedEventMocks.isTrustedDomEvent.mockReturnValueOnce(false);
  expect(createTrustedContentActionIntentSource(event)).toBeNull();

  trustedEventMocks.isTrustedDomEvent.mockReturnValueOnce(true);
  expect(createTrustedContentActionIntentSource(event)).toEqual({ kind: 'trusted-content-event' });
});

it('accepts activation-bridge mouse events as trusted content intent', () => {
  const event = createBridgedMouseEvent('click', new MouseEvent('pointerdown'));
  trustedEventMocks.isTrustedDomEvent.mockReturnValueOnce(false);

  expect(createTrustedContentActionIntentSource(event)).toEqual({ kind: 'trusted-content-event' });
});

it('creates background auto-start sources from grant tokens', () => {
  expect(createBackgroundAutoStartContentActionIntentSource('grant-1')).toEqual({
    grantToken: 'grant-1',
    kind: 'background-auto-start',
  });
});

it('leaves protected messages unchanged when no source is available', async () => {
  const message = { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION };

  await expect(attachContentActionIntent(message, null)).resolves.toBe(message);
  expect(messagingMocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('attaches a background-issued content action capability', async () => {
  messagingMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      activationKey: ACTIVATION_KEY,
      success: true,
    })
    .mockResolvedValueOnce({ runtimeToken: { runtimeToken: 'runtime-token-1' }, success: true })
    .mockResolvedValueOnce({ success: true, trustedEventProof: { proofToken: 'proof-1' } })
    .mockResolvedValueOnce({
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      success: true,
    });
  const message = { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION };
  trustedEventMocks.isTrustedDomEvent.mockReturnValueOnce(true);
  const source = createTrustedContentActionIntentSource(new Event('click'));

  await expect(attachContentActionIntent(message, source)).resolves.toEqual({
    ...message,
    contentIntent: { requestId: 'request-1', token: 'token-1' },
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    purpose: 'trusted-content-event',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    actionType: MessageType.TRIGGER_QUICK_ACTION,
    activationProof: ACTIVATION_KEY,
    requestId: 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
    actionType: MessageType.TRIGGER_QUICK_ACTION,
    requestId: 'request-1',
    runtimeToken: 'runtime-token-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(4, {
    actionType: MessageType.TRIGGER_QUICK_ACTION,
    requestId: 'request-1',
    source: { kind: 'trusted-content-event-proof', proofToken: 'proof-1' },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  });
});

it('exchanges background auto-start grants directly for capabilities', async () => {
  messagingMocks.sendRuntimeMessage.mockResolvedValueOnce({
    contentIntent: { requestId: 'request-1', token: 'token-1' },
    success: true,
  });
  const message = { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION };

  await expect(
    attachContentActionIntent(message, { grantToken: 'grant-1', kind: 'background-auto-start' })
  ).resolves.toEqual({
    ...message,
    contentIntent: { requestId: 'request-1', token: 'token-1' },
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenCalledTimes(1);
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    actionType: MessageType.TRIGGER_QUICK_ACTION,
    requestId: 'request-1',
    source: { grantToken: 'grant-1', kind: 'background-auto-start' },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  });
});

it('rejects failed or malformed capability responses', async () => {
  messagingMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      activationKey: ACTIVATION_KEY,
      success: true,
    })
    .mockResolvedValueOnce({ runtimeToken: { runtimeToken: 'runtime-token-1' }, success: true })
    .mockResolvedValueOnce({ success: true, trustedEventProof: { proofToken: 'proof-1' } })
    .mockResolvedValueOnce({ error: 'denied', success: false });
  trustedEventMocks.isTrustedDomEvent.mockReturnValueOnce(true);
  const source = createTrustedContentActionIntentSource(new Event('click'));

  await expect(
    attachContentActionIntent(
      { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION },
      source
    )
  ).rejects.toThrow('denied');
});

it('rejects failed or malformed trusted-event proof responses', async () => {
  messagingMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      activationKey: ACTIVATION_KEY,
      success: true,
    })
    .mockResolvedValueOnce({ runtimeToken: { runtimeToken: 'runtime-token-1' }, success: true })
    .mockResolvedValueOnce({ error: 'denied', success: false });
  trustedEventMocks.isTrustedDomEvent.mockReturnValueOnce(true);
  const source = createTrustedContentActionIntentSource(new Event('click'));

  await expect(
    attachContentActionIntent(
      { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION },
      source
    )
  ).rejects.toThrow('denied');
});

it('requests activation keys lazily and refreshes stale activation proofs once', async () => {
  const refreshedActivationKey = {
    expiresAtEpochMs: 90_000,
    keyId: 'activation-2',
    secret: 'secret-2',
  };
  messagingMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      activationKey: ACTIVATION_KEY,
      success: true,
    })
    .mockResolvedValueOnce({
      error: 'Unauthorized content action activation proof',
      success: false,
    })
    .mockResolvedValueOnce({
      activationKey: refreshedActivationKey,
      success: true,
    })
    .mockResolvedValueOnce({ runtimeToken: { runtimeToken: 'runtime-token-1' }, success: true })
    .mockResolvedValueOnce({ success: true, trustedEventProof: { proofToken: 'proof-1' } })
    .mockResolvedValueOnce({
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      success: true,
    });
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  expect(messagingMocks.sendRuntimeMessage).not.toHaveBeenCalled();

  const message = { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION };
  const source = createTrustedContentActionIntentSource(new Event('click'));
  await expect(attachContentActionIntent(message, source)).resolves.toEqual({
    ...message,
    contentIntent: { requestId: 'request-1', token: 'token-1' },
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    purpose: 'trusted-content-event',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  expect(messagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
    purpose: 'trusted-content-event',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
});

it('rejects forged trusted-event source objects before runtime proof requests', async () => {
  await expect(
    attachContentActionIntent(
      { actionId: 'quick-action-1', type: MessageType.TRIGGER_QUICK_ACTION },
      { kind: 'trusted-content-event' }
    )
  ).rejects.toThrow('not owner-issued');
  expect(messagingMocks.sendRuntimeMessage).not.toHaveBeenCalled();
});
