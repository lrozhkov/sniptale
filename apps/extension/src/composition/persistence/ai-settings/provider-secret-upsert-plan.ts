import type { AIModelManagement } from '../../../contracts/settings/ai-provider';
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
  management?: AIModelManagement | undefined;
  enabled?: boolean | undefined;
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

function createNextProvider(
  input: AIProviderUpsertInput,
  hasStoredApiKey: boolean,
  previous?: AIProvider
): AIProvider {
  return {
    id: input.id,
    management: input.management ?? previous?.management ?? 'automatic',
    enabled: input.enabled ?? previous?.enabled ?? true,
    incarnation: previous?.incarnation ?? crypto.randomUUID(),
    revision: (previous?.revision ?? 0) + 1,
    credentialRevision: (previous?.credentialRevision ?? 0) + (input.apiKey ? 1 : 0),
    observation: {
      status: 'unverified',
      scope: 'credentials',
      revision: (previous?.revision ?? 0) + 1,
      checkedAt: Date.now(),
    },
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
    createNextProvider(input, hasStoredApiKey, previousProvider)
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
    nextProvider = { ...nextProvider, hasStoredApiKey: true };
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
      nextProvider: { ...nextProvider, hasStoredApiKey: false },
      nextSecrets: remainingSecrets,
      remainingSecretCountAfterRemoval: Object.keys(remainingSecrets).length,
    };
  }

  return { nextProvider, nextSecrets };
}
