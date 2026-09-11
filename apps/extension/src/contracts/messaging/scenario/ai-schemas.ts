import { z } from 'zod';

import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
  ScenarioAIParseError,
} from '../../ai/scenario';
import { assertScenarioEditorAiPayloadLimits } from '../../ai/payload-limits';
import { SCENARIO_EDITOR_AI_PAYLOAD_LIMITS } from '@sniptale/runtime-contracts/ai/payload-policy';
import { scenarioAiOperationSchema } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { defineZodSchema } from '@sniptale/runtime-contracts/messaging/parsers/utils';

const defineProcessScenarioMessageSchema = defineZodSchema<ProcessScenarioEditorWithLLMMessage>();
const defineProcessScenarioResponseSchema = defineZodSchema<ProcessScenarioEditorWithLLMResponse>();
const SCENARIO_AI_SCHEMA_PARSE_ERROR_PATTERN = /^invalid-schema:\d+$/u;
const textEncoder = new TextEncoder();

function createBoundedStringSchema(label: string, maxChars: number, maxDecodedBytes: number) {
  return z
    .string()
    .max(maxChars)
    .superRefine((value, context) => {
      if (textEncoder.encode(value).byteLength <= maxDecodedBytes) {
        return;
      }

      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} exceeds ${maxDecodedBytes} decoded bytes`,
      });
    });
}

const scenarioAIAttachmentSchema = z
  .object({
    dataUrl: z.string().max(SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentDataUrlChars),
    filename: z.string().max(240),
    mimeType: z.enum(SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.allowedAttachmentMimeTypes),
    stepId: z.string(),
    stepNumber: z.number().int().positive(),
  })
  .strict();

const scenarioAIParseErrorSchema = z.custom<ScenarioAIParseError>(
  (value) =>
    value === 'invalid-json' ||
    (typeof value === 'string' && SCENARIO_AI_SCHEMA_PARSE_ERROR_PATTERN.test(value))
);

export const processScenarioEditorWithLlmMessageSchema = defineProcessScenarioMessageSchema(
  z
    .object({
      attachments: z
        .array(scenarioAIAttachmentSchema)
        .max(SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentCount),
      contractVersion: z.literal(4),
      projectId: z.string().min(1).max(160),
      baseRevision: z.number().int().nonnegative(),
      scope: z
        .object({
          stepIds: z.array(z.string().min(1).max(160)).min(1).max(300),
          blockIds: z.array(z.string().min(1).max(160)).max(200),
        })
        .strict(),
      instruction: createBoundedStringSchema(
        'instruction',
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxInstructionChars,
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxInstructionDecodedBytes
      ),
      llmSessionToken: z.string(),
      modelId: z.string().nullable().optional(),
      projectOutlineJson: createBoundedStringSchema(
        'projectOutlineJson',
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldChars,
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldDecodedBytes
      ).optional(),
      projectSnapshotJson: createBoundedStringSchema(
        'projectSnapshotJson',
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxProjectSnapshotJsonChars,
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxProjectSnapshotJsonDecodedBytes
      ),
      selectedStepJson: createBoundedStringSchema(
        'selectedStepJson',
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldChars,
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldDecodedBytes
      ).optional(),
      toolManifestJson: createBoundedStringSchema(
        'toolManifestJson',
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldChars,
        SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldDecodedBytes
      ).optional(),
      type: z.literal(MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM),
    })
    .strict()
    .superRefine((message, context) => {
      try {
        assertScenarioEditorAiPayloadLimits(message);
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : 'Invalid scenario AI payload',
        });
      }
    })
);

export const processScenarioEditorWithLlmResponseSchema = defineProcessScenarioResponseSchema(
  z
    .object({
      error: z.string().optional(),
      operations: z.array(scenarioAiOperationSchema).max(200).optional(),
      parseError: scenarioAIParseErrorSchema.optional(),
      success: z.boolean(),
    })
    .strict()
);
