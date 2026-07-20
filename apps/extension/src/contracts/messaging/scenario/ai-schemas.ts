import { z } from 'zod';

import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
  ScenarioAIAnnotation,
  ScenarioAIParseError,
  ScenarioEditorAIRequestedStepChange,
} from '../../ai/scenario';
import { assertScenarioEditorAiPayloadLimits } from '../../ai/payload-limits';
import { SCENARIO_EDITOR_AI_PAYLOAD_LIMITS } from '@sniptale/runtime-contracts/ai/payload-policy';
import { scenarioAiOperationSchema } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { defineZodSchema } from '@sniptale/runtime-contracts/messaging/parsers/utils';

const defineScenarioAIAnnotationSchema = defineZodSchema<ScenarioAIAnnotation>();
const defineRequestedStepChangeSchema = defineZodSchema<ScenarioEditorAIRequestedStepChange>();
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

const scenarioPointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

const scenarioRectSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
  })
  .strict();

const scenarioAIAnnotationSchema = defineScenarioAIAnnotationSchema(
  z.discriminatedUnion('tool', [
    z.object({ tool: z.literal('focus-rect'), rect: scenarioRectSchema }).strict(),
    z.object({ tool: z.literal('rectangle'), rect: scenarioRectSchema }).strict(),
    z.object({ tool: z.literal('ellipse'), rect: scenarioRectSchema }).strict(),
    z.object({ tool: z.literal('blur-rect'), rect: scenarioRectSchema }).strict(),
    z.object({ tool: z.literal('click-ring'), point: scenarioPointSchema }).strict(),
    z.object({ tool: z.literal('cursor'), point: scenarioPointSchema }).strict(),
    z
      .object({ tool: z.literal('arrow'), start: scenarioPointSchema, end: scenarioPointSchema })
      .strict(),
    z.object({ tool: z.literal('text'), point: scenarioPointSchema, text: z.string() }).strict(),
  ])
);

const scenarioAIAttachmentSchema = z
  .object({
    dataUrl: z.string().max(SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentDataUrlChars),
    filename: z.string().max(240),
    mimeType: z.enum(SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.allowedAttachmentMimeTypes),
    stepId: z.string(),
    stepNumber: z.number().int().positive(),
  })
  .strict();

const scenarioEditorRequestedStepChangeSchema = defineRequestedStepChangeSchema(
  z
    .object({
      annotations: z.array(scenarioAIAnnotationSchema).optional(),
      annotationsMode: z.enum(['replace', 'append', 'clear']).optional(),
      body: z.string().optional(),
      focusPoint: scenarioPointSchema.optional(),
      stepId: z.string(),
      title: z.string().optional(),
      zoom: z.number().finite().optional(),
    })
    .strict()
);

const scenarioAIParseErrorSchema = z.custom<ScenarioAIParseError>(
  (value) =>
    value === 'invalid-json' ||
    (typeof value === 'string' && SCENARIO_AI_SCHEMA_PARSE_ERROR_PATTERN.test(value))
);

export const scenarioEditorAiPayloadSchema = z
  .object({
    steps: z.array(scenarioEditorRequestedStepChangeSchema).default([]),
  })
  .strict();

export const processScenarioEditorWithLlmMessageSchema = defineProcessScenarioMessageSchema(
  z
    .object({
      attachments: z
        .array(scenarioAIAttachmentSchema)
        .max(SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentCount),
      contractVersion: z.literal(3),
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
      selectedSlideCodeJson: createBoundedStringSchema(
        'selectedSlideCodeJson',
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
      operations: z.array(scenarioAiOperationSchema).optional(),
      parseError: scenarioAIParseErrorSchema.optional(),
      steps: z.array(scenarioEditorRequestedStepChangeSchema).optional(),
      success: z.boolean(),
    })
    .strict()
);
