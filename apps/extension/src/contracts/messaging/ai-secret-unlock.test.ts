import { expect, expectTypeOf, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  AISecretUnlockMessage,
  AISecretUnlockOperation,
  AISecretUnlockResponse,
  AISecretUnlockStatus,
} from './ai-secret-unlock';

it('keeps secret-unlock operations discriminated by their required payload', () => {
  const start = {
    operation: 'start',
    purpose: 'content-ai-pick',
    type: MessageType.AI_SECRET_UNLOCK,
  } satisfies AISecretUnlockMessage;
  const cancel = {
    operation: 'cancel',
    requestId: 'request-1',
    type: MessageType.AI_SECRET_UNLOCK,
  } satisfies AISecretUnlockMessage;

  expect(start).not.toHaveProperty('requestId');
  expect(cancel.requestId).toBe('request-1');
  expectTypeOf<AISecretUnlockOperation>().toEqualTypeOf<'start' | 'submit' | 'status' | 'cancel'>();
  expectTypeOf<AISecretUnlockResponse['status']>().toEqualTypeOf<
    AISecretUnlockStatus | undefined
  >();
});
