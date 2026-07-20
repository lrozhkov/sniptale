import { translate } from '../../../platform/i18n';
import { isAllowedAIProviderBaseUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import {
  initializeAiStorageAccess,
  loadAIModels,
  loadAIProviders,
  loadGlobalSystemPrompt,
} from '../../../composition/persistence/ai-settings';
import { activateStoredAIProviderSecretForUse } from '../../../composition/persistence/ai-settings/provider-secrets.store.ts';

export interface ResolvedLlmModelConfig {
  providerId: string;
  modelId: string;
  baseUrl: string;
  apiKey: string;
  modelCode: string;
  effectiveSystemPrompt: string;
}

export async function resolveModelConfig(modelId: string): Promise<ResolvedLlmModelConfig> {
  await initializeAiStorageAccess();
  const [providers, models, globalPrompt] = await Promise.all([
    loadAIProviders(),
    loadAIModels(),
    loadGlobalSystemPrompt(),
  ]);

  const model = models.find((current) => current.id === modelId);
  if (!model) {
    throw new Error(`Model ${modelId} not found`);
  }

  const provider = providers.find((current) => current.id === model.providerId);
  if (!provider) {
    throw new Error(`Provider ${model.providerId} not found for model ${modelId}`);
  }
  if (!isAllowedAIProviderBaseUrl(provider.baseUrl)) {
    throw new Error(translate('background.runtime.llmProviderBaseUrlHttpsRequired'));
  }
  if (!provider.hasStoredApiKey) {
    throw new Error(translate('background.runtime.llmProviderApiKeyReentryRequired'));
  }

  const apiKey = await activateStoredAIProviderSecretForUse(provider);
  if (!apiKey) {
    throw new Error(translate('background.runtime.llmProviderApiKeyReentryRequired'));
  }

  const effectiveSystemPrompt = model.systemPrompt?.trim() || globalPrompt;

  return {
    providerId: provider.id,
    modelId: model.id,
    baseUrl: provider.baseUrl,
    apiKey,
    modelCode: model.modelCode,
    effectiveSystemPrompt,
  };
}
