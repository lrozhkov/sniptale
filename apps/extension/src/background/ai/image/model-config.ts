import { isAllowedAIProviderBaseUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import type { SecretProtectionPort } from '../../../composition/persistence/secret-protection/model';
import {
  initializeAiStorageAccess,
  loadAIModels,
  loadAIProviders,
} from '../../../composition/persistence/ai-settings';
import { activateStoredAIProviderSecretForUse } from '../../../composition/persistence/ai-settings/provider-secrets.store';
import type { AIOperationObservationBinding } from '../../../composition/persistence/ai-settings/operation-observations';
import type { AIProviderType } from '../../../contracts/settings/ai-provider';
import { getAIProviderDefinition } from '../../../contracts/settings/ai-provider';
import { getImageContextOperation, type ImageJobStart } from '../../../contracts/ai/image';
import {
  acceptsImageContext,
  resolveImageModelProfile,
  type ImageModelProfile,
} from '../../../contracts/ai/image-profile';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';

export interface ImageModelConfig {
  baseUrl: string;
  connectionType: AIProviderType;
  apiKey: string;
  modelCode: string;
  profile: ImageModelProfile;
  observationBinding?: AIOperationObservationBinding | undefined;
}

/** Resolves current graph, host permission and protected secret for the exact approved destination. */
export async function resolveImageModelConfig(
  request: ImageJobStart,
  signal: AbortSignal,
  protection?: SecretProtectionPort
): Promise<ImageModelConfig> {
  signal.throwIfAborted();
  await initializeAiStorageAccess();
  const [models, providers] = await Promise.all([loadAIModels(), loadAIProviders()]);
  signal.throwIfAborted();
  const model = models.find((entry) => entry.id === request.modelId);
  const provider = model && providers.find((entry) => entry.id === model.providerId);
  if (
    !model ||
    !provider ||
    model.modelCode !== request.approvedModelCode ||
    provider.id !== request.approvedProviderId ||
    !isAllowedAIProviderBaseUrl(provider.baseUrl) ||
    (await createAIProviderDestinationBinding(provider)) !== request.approvedDestination
  )
    throw new Error('model-unavailable');
  const operation = getImageContextOperation(request.context);
  const profile = resolveImageModelProfile(model, provider, operation);
  if (!profile) throw new Error('model-unavailable');
  if (!acceptsImageContext(profile, request.context)) throw new Error('invalid-request');
  if (!(await chrome.permissions.contains({ origins: [`${new URL(provider.baseUrl).origin}/*`] })))
    throw new Error('permission-denied');
  signal.throwIfAborted();
  const requiresSecret = getAIProviderDefinition(provider.connectionType).credential !== 'none';
  if (requiresSecret && !provider.hasStoredApiKey) throw new Error('secret-unavailable');
  let apiKey: string | null;
  try {
    apiKey = provider.hasStoredApiKey
      ? protection
        ? await protection.withAdmission('ai', (key, permit) =>
            activateStoredAIProviderSecretForUse(provider, key, permit)
          )
        : await activateStoredAIProviderSecretForUse(provider)
      : '';
  } catch {
    throw new Error('secret-unavailable');
  }
  signal.throwIfAborted();
  if (apiKey === null || (requiresSecret && !apiKey)) throw new Error('secret-unavailable');
  return {
    baseUrl: provider.baseUrl,
    connectionType: provider.connectionType,
    apiKey,
    modelCode: model.modelCode,
    profile,
    ...(provider.incarnation
      ? {
          observationBinding: {
            model: { id: model.id, code: model.modelCode, operation },
            providerId: provider.id,
            incarnation: provider.incarnation,
            revision: provider.revision ?? 0,
            credentialRevision: provider.credentialRevision ?? 0,
            destination: request.approvedDestination,
          },
        }
      : {}),
  };
}
