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
  connectionType: z.enum(['openai-compatible']),
  baseUrl: createAIProviderBaseUrlSchema(),
  hasStoredApiKey: z.boolean(),
  createdAt: z.number(),
});

export const AIModelSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid(schemaMessageKey('validation.schemas.selectProvider')),
  modelCode: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.modelCodeRequired'))
    .max(200, schemaMessageKey('validation.schemas.max200Characters')),
  displayName: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.nameRequired'))
    .max(100, schemaMessageKey('validation.schemas.max100Characters')),
  systemPrompt: z
    .string()
    .max(10000, schemaMessageKey('validation.schemas.max10000Characters'))
    .optional(),
});

export const AISettingsSchema = z.object({
  chromeAiEnabled: z.boolean(),
  providers: z.array(AIProviderSchema),
  models: z.array(AIModelSchema),
  defaultModelId: z.string().min(1).nullable(),
  globalSystemPrompt: z
    .string()
    .max(50000, schemaMessageKey('validation.schemas.max50000Characters')),
  scenarioEditorSystemPrompt: z
    .string()
    .max(50000, schemaMessageKey('validation.schemas.max50000Characters')),
});

export const ProviderFormSchema = z.object({
  name: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.nameRequired'))
    .max(100, schemaMessageKey('validation.schemas.max100Characters')),
  connectionType: z.enum(['openai-compatible']),
  baseUrl: createAIProviderBaseUrlSchema(),
});

export const ModelFormSchema = z.object({
  providerId: z.string().min(1, schemaMessageKey('validation.schemas.selectProvider')),
  displayName: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.nameRequired'))
    .max(100, schemaMessageKey('validation.schemas.max100Characters')),
  modelCode: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.modelCodeRequired'))
    .max(200, schemaMessageKey('validation.schemas.max200Characters')),
  systemPrompt: z
    .string()
    .max(10000, schemaMessageKey('validation.schemas.max10000Characters'))
    .optional(),
});

export interface ProviderFormData extends z.infer<typeof ProviderFormSchema> {
  apiKey?: string;
}
export type ModelFormData = z.infer<typeof ModelFormSchema>;

export const PromptTemplateSchema = z.object({
  id: z.string().min(1, schemaMessageKey('validation.schemas.templateIdRequired')),
  name: z
    .string()
    .min(1, schemaMessageKey('validation.schemas.nameRequired'))
    .max(50, schemaMessageKey('validation.schemas.nameTooLong')),
  content: z.string().min(1, schemaMessageKey('validation.schemas.promptTextRequired')),
  isDefault: z.boolean().optional(),
  lastUsedAt: z.number().optional(),
});
