import { z } from 'zod';
import { SHA256_DIGEST_PATTERN } from '@sniptale/runtime-contracts/protocol/digest';

const approvedIdentity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value);

/** Binds job commands and responses to a UUID request identity. */
export const aiJobRequestIdSchema = z.string().uuid();

/** Admits the frozen provider approval before each domain adds its disclosed payload. */
export const approvedAiStartSchema = z
  .object({
    type: z.literal('start'),
    requestId: aiJobRequestIdSchema,
    modelId: approvedIdentity,
    approvedProviderId: approvedIdentity,
    approvedDestination: z.string().regex(SHA256_DIGEST_PATTERN),
    approvedModelCode: approvedIdentity,
    llmSessionToken: z.string().min(1).max(512),
  })
  .strict();

/** Restricts control commands to their operation and request identity. */
export const aiJobControlSchemas = [
  z.object({ type: z.literal('cancel'), requestId: aiJobRequestIdSchema }).strict(),
  z.object({ type: z.literal('keepalive'), requestId: aiJobRequestIdSchema }).strict(),
] as const;
