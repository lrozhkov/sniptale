import { AI_PROVIDER_TYPES } from '../../../contracts/settings/ai-provider';
import {
  isAIModelCapabilities,
  isAICatalogFacts,
  isAIConnectionObservation,
  isAIModelOperationObservations,
  type AIModelOperationObservations,
  type AIModelCapabilities,
  type AICatalogFacts,
  type AIConnectionObservation,
} from '../../../contracts/settings/ai-catalog';
import {
  isValidAIModelOperationConfiguration,
  type AIModelAudioParameters,
} from '../../../contracts/settings/model-operation';
import { z } from 'zod';

import { resolveAIProviderBaseUrlPolicy } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import { schemaMessageKey } from './ai-utils';

function createAIProviderBaseUrlSchema() {
  return z.string().superRefine((value, context) => {
    const policy = resolveAIProviderBaseUrlPolicy(value);

    if (policy === 'allowed') {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: schemaMessageKey(
        policy === 'https-required'
          ? 'validation.schemas.httpsUrlRequired'
          : 'validation.schemas.invalidUrl'
      ),
    });
  });
}

export const AIProviderSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.nameRequired'))
    .max(100, schemaMessageKey('validation.schemas.max100Characters')),
  connectionType: z.enum(AI_PROVIDER_TYPES),
  baseUrl: createAIProviderBaseUrlSchema(),
  hasStoredApiKey: z.boolean(),
  management: z.enum(['automatic', 'manual']).optional(),
  enabled: z.boolean().optional(),
  incarnation: z.string().min(1).max(200).optional(),
  revision: z.number().int().nonnegative().optional(),
  credentialRevision: z.number().int().nonnegative().optional(),
  observation: z.custom<AIConnectionObservation>(isAIConnectionObservation).optional(),
  catalogUpdatedAt: z.number().nonnegative().optional(),
  lastRefreshAttemptAt: z.number().nonnegative().optional(),
  refreshGeneration: z.string().min(1).max(200).optional(),
  operationGeneration: z.string().min(1).max(200).optional(),
  createdAt: z.number(),
});

const operationFields = {
  operation: z.enum(['text', 'transcription', 'speech']).optional(),
  audio: z
    .custom<AIModelAudioParameters>(
      (value) =>
        isValidAIModelOperationConfiguration({
          capabilities: {
            operations: { transcription: 'supported', speech: 'supported' },
            input: {},
            output: {},
            features: {},
          },
          audio: value,
        }),
      { message: 'settings.aiProviders.modelAudioInvalid' }
    )
    .optional(),
};

export const AIModelSchema = z
  .object({
    ...operationFields,
    operationObservations: z
      .custom<AIModelOperationObservations>(isAIModelOperationObservations)
      .optional(),
    source: z.enum(['catalog', 'manual']).optional(),
    propertySource: z.enum(['catalog', 'manual']).optional(),
    enabled: z.boolean().optional(),
    retirementOverride: z.boolean().optional(),
    capabilities: z.custom<AIModelCapabilities>(isAIModelCapabilities).optional(),
    catalog: z.custom<AICatalogFacts>(isAICatalogFacts).optional(),
    id: z.string().uuid(),
    providerId: z.string().uuid(schemaMessageKey('validation.schemas.selectProvider')),
    modelCode: z.string().min(1, schemaMessageKey('validation.schemas.modelCodeRequired')).max(500),
    displayName: z.string().min(1, schemaMessageKey('validation.schemas.nameRequired')).max(500),
    systemPrompt: z
      .string()
      .max(10000, schemaMessageKey('validation.schemas.max10000Characters'))
      .optional(),
  })
  .refine(isValidAIModelOperationConfiguration, {
    message: 'settings.aiProviders.modelAudioInvalid',
    path: ['audio'],
  });

export const AISettingsSchema = z.object({
  audioTranscriptionSystemPrompt: z.string().max(10000).optional(),
  chromeAiEnabled: z.boolean(),
  providers: z.array(AIProviderSchema),
  models: z.array(AIModelSchema),
  globalSystemPrompt: z
    .string()
    .max(50000, schemaMessageKey('validation.schemas.max50000Characters')),
  scenarioEditorSystemPrompt: z
    .string()
    .max(50000, schemaMessageKey('validation.schemas.max50000Characters')),
});

export const ProviderFormSchema = z.object({
  management: z.enum(['automatic', 'manual']).optional(),
  enabled: z.boolean().optional(),
  name: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.nameRequired'))
    .max(100, schemaMessageKey('validation.schemas.max100Characters')),
  connectionType: z.enum(AI_PROVIDER_TYPES),
  baseUrl: createAIProviderBaseUrlSchema(),
});

export const ModelFormSchema = z
  .object({
    ...operationFields,
    source: z.literal('manual').optional(),
    propertySource: z.enum(['catalog', 'manual']).optional(),
    capabilities: z.custom<AIModelCapabilities>(isAIModelCapabilities).optional(),
    enabled: z.boolean().optional(),
    retirementOverride: z.boolean().optional(),
    providerId: z.string().min(1, schemaMessageKey('validation.schemas.selectProvider')),
    displayName: z
      .string()
      .min(1, schemaMessageKey('validation.schemas.nameRequired'))
      .max(500, schemaMessageKey('settings.aiProviders.modelIdentityTooLong')),
    modelCode: z
      .string()
      .min(1, schemaMessageKey('validation.schemas.modelCodeRequired'))
      .max(500, schemaMessageKey('settings.aiProviders.modelIdentityTooLong')),
    systemPrompt: z
      .string()
      .max(10000, schemaMessageKey('validation.schemas.max10000Characters'))
      .optional(),
  })
  .refine(isValidAIModelOperationConfiguration, {
    message: 'settings.aiProviders.modelAudioInvalid',
    path: ['audio'],
  });

export interface ProviderFormData extends z.infer<typeof ProviderFormSchema> {
  apiKey?: string;
}
export type ModelFormData = z.infer<typeof ModelFormSchema>;

export const PromptTemplateSchema = z.object({
  scope: z.enum(['page', 'scenario']).optional(),
  id: z.string().min(1, schemaMessageKey('validation.schemas.templateIdRequired')),
  name: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.nameRequired'))
    .max(50, schemaMessageKey('validation.schemas.nameTooLong')),
  content: z.string().min(1, schemaMessageKey('validation.schemas.promptTextRequired')),
  isDefault: z.boolean().optional(),
  lastUsedAt: z.number().optional(),
});
