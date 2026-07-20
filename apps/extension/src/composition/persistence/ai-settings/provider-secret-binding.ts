import type { AIProvider } from '../../../contracts/settings';
import { resolveAIProviderCanonicalOrigin } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import type { SecretAdditionalData } from '@sniptale/platform/security/local-secret-crypto';

const AI_PROVIDER_SECRET_BINDING_VERSION = 'ai-provider-secret:v1';

export function createAIProviderSecretAdditionalData(
  provider: Pick<AIProvider, 'baseUrl' | 'connectionType' | 'id'>
): SecretAdditionalData {
  const canonicalOrigin = resolveAIProviderCanonicalOrigin(provider.baseUrl);
  if (!canonicalOrigin) {
    throw new Error(`Invalid AI provider base URL for secret binding: ${provider.id}`);
  }

  return {
    connectionType: provider.connectionType,
    providerId: provider.id,
    providerOrigin: canonicalOrigin,
    version: AI_PROVIDER_SECRET_BINDING_VERSION,
  };
}

export function hasAIProviderSecretBindingChanged(
  previousProvider: Pick<AIProvider, 'baseUrl' | 'connectionType' | 'id'>,
  nextProvider: Pick<AIProvider, 'baseUrl' | 'connectionType' | 'id'>
): boolean {
  return (
    JSON.stringify(createAIProviderSecretAdditionalData(previousProvider)) !==
    JSON.stringify(createAIProviderSecretAdditionalData(nextProvider))
  );
}
