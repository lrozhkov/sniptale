import { z } from 'zod';

import type { LocalDataErasureMessage, LocalDataErasureResponse } from '../privacy-erasure';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { defineZodSchema } from '@sniptale/runtime-contracts/messaging/parsers/utils';

const defineLocalDataErasureMessageSchema = defineZodSchema<LocalDataErasureMessage>();
const defineLocalDataErasureResponseSchema = defineZodSchema<LocalDataErasureResponse>();

const erasureParticipantResultSchema = z
  .object({
    error: z.string().optional(),
    id: z.string(),
    remainingCount: z.number().int().nonnegative().optional(),
    removedCount: z.number().int().nonnegative().optional(),
    severity: z.enum(['best-effort', 'required']),
    status: z.enum(['erased', 'failed', 'skipped', 'verified-empty']),
  })
  .strict();

const erasureResultSchema = z
  .object({
    failedRequiredParticipantIds: z.array(z.string()),
    indexedDbStoresCleared: z.number().int().nonnegative(),
    localStorageKeysRemoved: z.array(z.string()),
    participants: z.array(erasureParticipantResultSchema),
    success: z.boolean(),
    sessionStorageKeysRemoved: z.array(z.string()),
    syncStorageKeysRemoved: z.array(z.string()),
  })
  .strict();

export const localDataErasureMessageSchema = defineLocalDataErasureMessageSchema(
  z
    .object({
      type: z.literal(MessageType.ERASE_LOCAL_EXTENSION_DATA),
      includeAiProviderSecrets: z.boolean(),
      preservePreferences: z.boolean(),
    })
    .strict()
);

export const localDataErasureResponseSchema = defineLocalDataErasureResponseSchema(
  z
    .object({
      error: z.string().optional(),
      result: erasureResultSchema.optional(),
      success: z.boolean(),
    })
    .strict()
);
