import { z } from 'zod';

import type {
  AiSettingsQueryMessage,
  AiSettingsQueryResponse,
  AiSettingsMutationMessage,
  AiSettingsMutationResponse,
} from '../ai-settings-runtime';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { defineZodSchema } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { AIModelSchema, AIProviderSchema } from '../../../features/ai/schemas/ai-settings';

const defineAiSettingsMutationMessageSchema = defineZodSchema<AiSettingsMutationMessage>();
const defineAiSettingsMutationResponseSchema = defineZodSchema<AiSettingsMutationResponse>();
const defineAiSettingsQueryMessageSchema = defineZodSchema<AiSettingsQueryMessage>();
const defineAiSettingsQueryResponseSchema = defineZodSchema<AiSettingsQueryResponse>();

const providerMutationSchema = AIProviderSchema.omit({ hasStoredApiKey: true })
  .extend({
    apiKey: z.string().max(10000).optional(),
  })
  .strict();

const modelMutationSchema = AIModelSchema.strict();
const aiRecordIdSchema = z.string().min(1);
const defaultModelIdSchema = aiRecordIdSchema.nullable();
const passphraseSchema = z.string().min(1).max(10000);
const aiProviderSelectorEntrySchema = AIProviderSchema.omit({ baseUrl: true })
  .extend({
    connectionType: z.enum(['chrome-built-in', 'openai-compatible']),
    destinationKind: z.enum(['chrome-built-in', 'external', 'local-custom']),
  })
  .strict();
const aiModelSelectionBootstrapSchema = z
  .object({
    chromeAiEnabled: z.boolean(),
    defaultModelId: defaultModelIdSchema,
    globalSystemPrompt: z.string(),
    models: z.array(AIModelSchema.strict()),
    providers: z.array(aiProviderSelectorEntrySchema),
  })
  .strict();
const aiSettingsPageModelSelectionBootstrapSchema = aiModelSelectionBootstrapSchema
  .omit({ providers: true })
  .extend({ providers: z.array(AIProviderSchema.strict()) })
  .strict();

const baseMutationSchema = z.object({
  type: z.literal(MessageType.AI_SETTINGS_MUTATION),
});
const baseQuerySchema = z.object({
  type: z.literal(MessageType.AI_SETTINGS_QUERY),
});
const secretProtectionStatusSchema = z
  .object({
    isEnabled: z.boolean(),
    isUnlocked: z.boolean(),
    mode: z.enum(['transparent', 'passphrase']),
  })
  .strict();

export const aiSettingsQueryMessageSchema = defineAiSettingsQueryMessageSchema(
  z.discriminatedUnion('operation', [
    baseQuerySchema.extend({ operation: z.literal('read-model-selection-bootstrap') }).strict(),
    baseQuerySchema.extend({ operation: z.literal('read-settings-page-runtime-data') }).strict(),
    baseQuerySchema.extend({ operation: z.literal('read-scenario-editor-system-prompt') }).strict(),
    baseQuerySchema
      .extend({
        modelId: aiRecordIdSchema,
        operation: z.literal('read-chrome-ai-content-system-prompt'),
      })
      .strict(),
  ])
);

export const aiSettingsMutationMessageSchema = defineAiSettingsMutationMessageSchema(
  z.discriminatedUnion('operation', [
    baseMutationSchema.extend({ operation: z.literal('read-secret-protection-status') }).strict(),
    baseMutationSchema
      .extend({ operation: z.literal('add-provider'), provider: providerMutationSchema })
      .strict(),
    baseMutationSchema
      .extend({ operation: z.literal('update-provider'), provider: providerMutationSchema })
      .strict(),
    baseMutationSchema
      .extend({ operation: z.literal('clear-provider-secret'), providerId: aiRecordIdSchema })
      .strict(),
    baseMutationSchema
      .extend({ operation: z.literal('delete-provider'), providerId: aiRecordIdSchema })
      .strict(),
    baseMutationSchema
      .extend({ model: modelMutationSchema, operation: z.literal('add-model') })
      .strict(),
    baseMutationSchema
      .extend({ model: modelMutationSchema, operation: z.literal('update-model') })
      .strict(),
    baseMutationSchema
      .extend({ modelId: aiRecordIdSchema, operation: z.literal('delete-model') })
      .strict(),
    baseMutationSchema
      .extend({
        defaultModelId: defaultModelIdSchema,
        operation: z.literal('save-default-model'),
      })
      .strict(),
    baseMutationSchema
      .extend({
        operation: z.literal('save-global-prompt'),
        prompt: z.string().max(50000),
      })
      .strict(),
    baseMutationSchema
      .extend({
        operation: z.literal('save-scenario-editor-prompt'),
        prompt: z.string().max(50000),
      })
      .strict(),
    baseMutationSchema
      .extend({ enabled: z.boolean(), operation: z.literal('save-chrome-ai-enabled') })
      .strict(),
    baseMutationSchema
      .extend({
        operation: z.literal('enable-secret-passphrase-protection'),
        passphrase: passphraseSchema,
      })
      .strict(),
    baseMutationSchema
      .extend({
        operation: z.literal('disable-secret-passphrase-protection'),
        passphrase: passphraseSchema.optional(),
      })
      .strict(),
    baseMutationSchema
      .extend({
        operation: z.literal('unlock-secret-passphrase-protection'),
        passphrase: passphraseSchema,
      })
      .strict(),
    baseMutationSchema
      .extend({
        currentPassphrase: passphraseSchema,
        nextPassphrase: passphraseSchema,
        operation: z.literal('change-secret-passphrase-protection'),
      })
      .strict(),
    baseMutationSchema
      .extend({ operation: z.literal('lock-secret-passphrase-protection') })
      .strict(),
    baseMutationSchema
      .extend({ operation: z.literal('reset-secret-passphrase-protection') })
      .strict(),
  ])
);

export const aiSettingsMutationResponseSchema = defineAiSettingsMutationResponseSchema(
  z
    .object({
      error: z.string().optional(),
      reason: z.literal('ai-secrets-locked').optional(),
      result: z.literal('accepted').optional(),
      secretProtectionStatus: secretProtectionStatusSchema.optional(),
      success: z.boolean(),
    })
    .strict()
);

export const aiSettingsQueryResponseSchema = defineAiSettingsQueryResponseSchema(
  z
    .object({
      error: z.string().optional(),
      modelSelection: aiModelSelectionBootstrapSchema.optional(),
      scenarioEditorSystemPrompt: z.string().optional(),
      settingsRuntimeData: z
        .object({
          scenarioEditorSystemPrompt: z.string(),
          secretProtectionStatus: secretProtectionStatusSchema,
          selectionBootstrap: aiSettingsPageModelSelectionBootstrapSchema,
        })
        .strict()
        .optional(),
      success: z.boolean(),
      systemPrompt: z.string().optional(),
    })
    .strict()
);
