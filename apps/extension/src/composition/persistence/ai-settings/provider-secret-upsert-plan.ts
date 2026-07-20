import type { AIProvider } from '../../../contracts/settings';
import {
  encryptSecret,
  type EncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import {
  createAIProviderSecretAdditionalData,
  hasAIProviderSecretBindingChanged,
} from './provider-secret-binding';
import { resolveProviderSecretKeyForWrite } from './provider-secret-keys.store.ts';

export interface AIProviderUpsertInput {
  apiKey?: string | undefined;
  baseUrl: string;
  connectionType: AIProvider['connectionType'];
  createdAt: number;
  id: string;
  name: string;
}

interface ProviderSecretUpsertPlan {
  nextKeyMaterial?: string | undefined;
  nextProvider: AIProvider;
  nextSecrets: Record<string, EncryptedSecretEnvelope>;
  remainingSecretCountAfterRemoval?: number | undefined;
}

function createNextProvider(input: AIProviderUpsertInput, hasStoredApiKey: boolean): AIProvider {
  return {
    id: input.id,
    name: input.name,
    connectionType: input.connectionType,
    baseUrl: input.baseUrl,
    hasStoredApiKey,
    createdAt: input.createdAt,
  };
}

function preserveStoredProviderFields(
  previousProvider: AIProvider | undefined,
  nextProvider: AIProvider
): AIProvider {
  return previousProvider ? { ...previousProvider, ...nextProvider } : nextProvider;
}

export async function createProviderSecretUpsertPlan(args: {
  input: AIProviderUpsertInput;
  previousProvider: AIProvider | undefined;
  secrets: Record<string, EncryptedSecretEnvelope>;
}): Promise<ProviderSecretUpsertPlan> {
  const { input, previousProvider, secrets } = args;
  let nextSecrets = secrets;
  let hasStoredApiKey = previousProvider?.hasStoredApiKey ?? false;
  let nextProvider = preserveStoredProviderFields(
    previousProvider,
    createNextProvider(input, hasStoredApiKey)
  );

  if (typeof input.apiKey === 'string' && input.apiKey.length > 0) {
    const resolvedKey = await resolveProviderSecretKeyForWrite();
    nextSecrets = {
      ...secrets,
      [input.id]: await encryptSecret(
        input.apiKey,
        resolvedKey.key,
        createAIProviderSecretAdditionalData(nextProvider)
      ),
    };
    nextProvider = preserveStoredProviderFields(previousProvider, createNextProvider(input, true));
    return {
      nextProvider,
      nextSecrets,
      ...(resolvedKey.nextKeyMaterial ? { nextKeyMaterial: resolvedKey.nextKeyMaterial } : {}),
    };
  }

  if (
    previousProvider?.hasStoredApiKey &&
    hasAIProviderSecretBindingChanged(previousProvider, nextProvider)
  ) {
    const { [input.id]: _removedSecret, ...remainingSecrets } = secrets;
    return {
      nextProvider: preserveStoredProviderFields(
        previousProvider,
        createNextProvider(input, false)
      ),
      nextSecrets: remainingSecrets,
      remainingSecretCountAfterRemoval: Object.keys(remainingSecrets).length,
    };
  }

  return { nextProvider, nextSecrets };
}
