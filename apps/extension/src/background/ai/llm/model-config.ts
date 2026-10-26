import { supportsAIProviderModelOperation } from '../../../contracts/settings/model-operation';
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
import {
  getAIProviderDefinition,
  type AIProviderType,
} from '../../../contracts/settings/ai-provider';
import type { ReviewTextStart } from '../../../contracts/ai/review-text';

export interface ResolvedLlmModelConfig {
  connectionType: AIProviderType;
  destinationBinding: string;
  maxOutputTokens?: number | undefined;
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

  const provider = providers.find((current) => current.id === model.providerId);
  if (!provider) {
    throw new Error(`Provider ${model.providerId} not found for model ${modelId}`);
  }
  if (
    !supportsAIProviderModelOperation(model, provider, 'text') ||
    provider.connectionType === 'chrome-built-in'
  )
    throw new Error('Selected AI model does not support text requests');
  const needsCredential =
    getAIProviderDefinition(provider.connectionType).credential !== 'none' ||
    provider.hasStoredApiKey;
  if (!isAllowedAIProviderBaseUrl(provider.baseUrl)) {
    throw new Error(translate('background.runtime.llmProviderBaseUrlHttpsRequired'));
  }
  if (needsCredential && !provider.hasStoredApiKey) {
    throw new Error(translate('background.runtime.llmProviderApiKeyReentryRequired'));
  }

  if (approved) {
    if (
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

  const apiKey = needsCredential ? await activateStoredAIProviderSecretForUse(provider) : '';
  approved?.signal.throwIfAborted();
  if (needsCredential && !apiKey) {
    throw new Error(translate('background.runtime.llmProviderApiKeyReentryRequired'));
  }

  const effectiveSystemPrompt = model.systemPrompt?.trim() || globalPrompt;

  return {
    connectionType: provider.connectionType,
    destinationBinding: await createAIProviderDestinationBinding(provider),
    ...(model.capabilities?.maxOutputTokens
      ? { maxOutputTokens: Math.min(3000, model.capabilities.maxOutputTokens) }
      : {}),
    providerId: provider.id,
    modelId: model.id,
    baseUrl: provider.baseUrl,
    apiKey: apiKey ?? '',
    modelCode: model.modelCode,
    effectiveSystemPrompt,
  };
}

/** Revalidate a frozen legacy-route configuration before the SDK sends any payload. */
export async function assertResolvedLlmModelConfigCurrent(
  config: ResolvedLlmModelConfig
): Promise<void> {
  const current = await resolveModelConfig(config.modelId);
  if (JSON.stringify(current) !== JSON.stringify(config)) throw new Error('model-unavailable');
  if (!(await chrome.permissions.contains({ origins: [`${new URL(config.baseUrl).origin}/*`] })))
    throw new Error('permission-denied');
}
