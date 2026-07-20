import { z } from 'zod';

import type {
  ProcessWithLLMMessage,
  ProcessWithLLMResponse,
  RequestLlmSessionMessage,
  RequestLlmSessionResponse,
} from '../llm';
import { aiEgressAuthoritySchema } from '../../ai/egress-authority';
import { SHA256_DIGEST_PATTERN } from '@sniptale/runtime-contracts/protocol/digest';
import {
  AI_CAPTURE_MODES,
  AI_PAYLOAD_RISK_CLASSES,
} from '@sniptale/runtime-contracts/protocol/ai-privacy';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  processScenarioEditorWithLlmMessageSchema,
  processScenarioEditorWithLlmResponseSchema,
} from '../scenario/ai-schemas';
import { defineZodSchema } from '@sniptale/runtime-contracts/messaging/parsers/utils';

const defineProcessWithLlmMessageSchema = defineZodSchema<ProcessWithLLMMessage>();
const defineProcessWithLlmResponseSchema = defineZodSchema<ProcessWithLLMResponse>();
const defineRequestLlmSessionMessageSchema = defineZodSchema<RequestLlmSessionMessage>();
const defineRequestLlmSessionResponseSchema = defineZodSchema<RequestLlmSessionResponse>();

const aiPrivacyProofSchema = z
  .object({
    captureMode: z.enum(AI_CAPTURE_MODES),
    createdAtEpochMs: z.number(),
    generation: z.string(),
    payloadHash: z.string().regex(SHA256_DIGEST_PATTERN),
    riskClass: z.enum(AI_PAYLOAD_RISK_CLASSES),
    sourceFrameId: z.number().optional(),
    sourceOrigin: z.string().nullable().optional(),
    sourceTabId: z.number().optional(),
    userInitiatedAiExtraction: z.boolean(),
  })
  .strict();

const domNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  selector: z.string().optional(),
});

const aiEditChangeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('field'),
    fieldId: z.string(),
    newValue: z.string(),
    fieldName: z.string(),
  }),
  z.object({
    type: z.literal('tableRow'),
    rowId: z.string(),
    columnEdits: z.record(z.string(), z.string()),
  }),
]);

export const processWithLlmMessageSchema = defineProcessWithLlmMessageSchema(
  z
    .object({
      type: z.literal(MessageType.PROCESS_WITH_LLM),
      llmSessionToken: z.string(),
      prompt: z.string(),
      privacyProof: aiPrivacyProofSchema,
      jsonData: z.string().optional(),
      markdownData: z.string().optional(),
      modelId: z.string().nullable().optional(),
    })
    .strict()
);

export const processWithLlmResponseSchema = defineProcessWithLlmResponseSchema(
  z
    .object({
      success: z.boolean(),
      data: z.array(domNodeSchema).optional(),
      changes: z.array(aiEditChangeSchema).optional(),
      error: z.string().optional(),
      parseErrors: z.array(z.string()).optional(),
    })
    .strict()
);

export const requestLlmSessionMessageSchema = defineRequestLlmSessionMessageSchema(
  z
    .object({
      egressAuthority: aiEgressAuthoritySchema,
      type: z.literal(MessageType.REQUEST_LLM_SESSION),
      purpose: z.enum(['content-ai-pick', 'scenario-editor']),
    })
    .strict()
);

export const requestLlmSessionResponseSchema = defineRequestLlmSessionResponseSchema(
  z.object({
    error: z.string().optional(),
    reason: z.literal('ai-secrets-locked').optional(),
    success: z.boolean(),
    token: z.string().optional(),
  })
);

export { processScenarioEditorWithLlmMessageSchema, processScenarioEditorWithLlmResponseSchema };
