import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { FakeRuntimeMessagingTransport } from '../../../platform/runtime-messaging/fake';
import { createAISecretUnlockRuntime } from './runtime';

const REQUEST_ID = '00000000-0000-4000-8000-000000000001';

it('submits the unlock passphrase through the injected runtime transport', async () => {
  const transport = new FakeRuntimeMessagingTransport();
  const runtime = createAISecretUnlockRuntime(transport);
  transport.onRuntimeMessage(MessageType.AI_SECRET_UNLOCK, (message) => {
    if (message.operation !== 'submit') {
      throw new Error('Expected submit unlock message');
    }
    return {
      requestId: message.requestId,
      status: 'completed',
      success: true,
    };
  });

  const response = await runtime.submitPassphrase({
    passphrase: 'passphrase',
    requestId: REQUEST_ID,
  });

  expect(response).toEqual({
    requestId: REQUEST_ID,
    status: 'completed',
    success: true,
  });
  expect(transport.runtimeRequests).toEqual([
    {
      operation: 'submit',
      passphrase: 'passphrase',
      requestId: REQUEST_ID,
      type: MessageType.AI_SECRET_UNLOCK,
    },
  ]);
});

it('cancels the unlock request through the injected runtime transport', async () => {
  const transport = new FakeRuntimeMessagingTransport();
  const runtime = createAISecretUnlockRuntime(transport);
  transport.onRuntimeMessage(MessageType.AI_SECRET_UNLOCK, (message) => {
    if (message.operation !== 'cancel') {
      throw new Error('Expected cancel unlock message');
    }
    return {
      requestId: message.requestId,
      status: 'failed',
      success: true,
    };
  });

  await runtime.cancelRequest(REQUEST_ID);

  expect(transport.runtimeRequests).toEqual([
    {
      operation: 'cancel',
      requestId: REQUEST_ID,
      type: MessageType.AI_SECRET_UNLOCK,
    },
  ]);
});
