import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { aiSecretUnlockMessageSchema } from './ai-secret-unlock-schemas';

it('parses AI secret unlock start and cancel messages', () => {
  expect(
    aiSecretUnlockMessageSchema.parse({
      operation: 'start',
      purpose: 'content-ai-pick',
      type: MessageType.AI_SECRET_UNLOCK,
    })
  ).toEqual({
    operation: 'start',
    purpose: 'content-ai-pick',
    type: MessageType.AI_SECRET_UNLOCK,
  });

  expect(
    aiSecretUnlockMessageSchema.parse({
      operation: 'cancel',
      requestId: '00000000-0000-4000-8000-000000000001',
      type: MessageType.AI_SECRET_UNLOCK,
    })
  ).toEqual({
    operation: 'cancel',
    requestId: '00000000-0000-4000-8000-000000000001',
    type: MessageType.AI_SECRET_UNLOCK,
  });
});
