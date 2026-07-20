import { z } from 'zod';

import type { AISecretUnlockMessage, AISecretUnlockResponse } from '../ai-secret-unlock';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { defineZodSchema } from '@sniptale/runtime-contracts/messaging/parsers/utils';

const defineAISecretUnlockMessageSchema = defineZodSchema<AISecretUnlockMessage>();
const defineAISecretUnlockResponseSchema = defineZodSchema<AISecretUnlockResponse>();

const baseUnlockSchema = z.object({
  type: z.literal(MessageType.AI_SECRET_UNLOCK),
});

export const aiSecretUnlockMessageSchema = defineAISecretUnlockMessageSchema(
  z.discriminatedUnion('operation', [
    baseUnlockSchema
      .extend({
        operation: z.literal('start'),
        purpose: z.enum(['content-ai-pick', 'scenario-editor']),
      })
      .strict(),
    baseUnlockSchema
      .extend({
        operation: z.literal('submit'),
        passphrase: z.string().min(1).max(10000),
        requestId: z.string().uuid(),
      })
      .strict(),
    baseUnlockSchema
      .extend({
        operation: z.literal('status'),
        requestId: z.string().uuid(),
      })
      .strict(),
    baseUnlockSchema
      .extend({
        operation: z.literal('cancel'),
        requestId: z.string().uuid(),
      })
      .strict(),
  ])
);

export const aiSecretUnlockResponseSchema = defineAISecretUnlockResponseSchema(
  z
    .object({
      error: z.string().optional(),
      reason: z.literal('ai-secrets-locked').optional(),
      requestId: z.string().uuid().optional(),
      status: z
        .enum(['pending', 'submitted', 'completed', 'expired', 'restart-required', 'failed'])
        .optional(),
      success: z.boolean(),
    })
    .strict()
);
