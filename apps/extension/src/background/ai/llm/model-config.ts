import { getAIModelOperation } from '../../../contracts/settings/model-operation';
import { translate } from '../../../platform/i18n';
import { isAllowedAIProviderBaseUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import {
  initializeAiStorageAccess,
  loadAIModels,
  loadAIProviders,
  loadGlobalSystemPrompt,
} from '../../../composition/persistence/ai-settings';
import { activateStoredAIProviderSecretForUse } from '../../../composition/persistence/ai-settings/provider-secrets.store.ts';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import type { ReviewTextStart } from '../../../contracts/ai/review-text';

export interface ResolvedLlmModelConfig {
  providerId: string;
  modelId: string;
  baseUrl: string;
  apiKey: string;
  modelCode: string;
  effectiveSystemPrompt: string;
}

export async function resolveModelConfig(
  modelId: string,
  approved?: Pick<
    ReviewTextStart,
    'approvedProviderId' | 'approvedDestination' | 'approvedModelCode'
  > & { signal: AbortSignal }
): Promise<ResolvedLlmModelConfig> {
  approved?.signal.throwIfAborted();
  await initializeAiStorageAccess();
  const [providers, models, globalPrompt] = await Promise.all([
    loadAIProviders(),
    loadAIModels(),
    loadGlobalSystemPrompt(),
  ]);

  const model = models.find((current) => current.id === modelId);
  approved?.signal.throwIfAborted();
  if (!model) {
    throw new Error(`Model ${modelId} not found`);
  }

  if (getAIModelOperation(model) !== 'text') {
    throw new Error('Selected AI model does not support text requests');
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

  if (approved) {
    if (
      provider.connectionType !== 'openai-compatible' ||
      model.providerId !== approved.approvedProviderId ||
      model.modelCode !== approved.approvedModelCode ||
      (await createAIProviderDestinationBinding(provider)) !== approved.approvedDestination
    )
      throw new Error('model-unavailable');
    approved.signal.throwIfAborted();
    if (
      !(await chrome.permissions.contains({ origins: [`${new URL(provider.baseUrl).origin}/*`] }))
    )
      throw new Error('permission-denied');
    approved.signal.throwIfAborted();
  }

  const apiKey = await activateStoredAIProviderSecretForUse(provider);
  approved?.signal.throwIfAborted();
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
