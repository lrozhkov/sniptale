import type { AIModel, AIProvider } from '../../../contracts/settings';
import { loadAIModels, loadAIProviders, loadDefaultModelId } from './core';
import {
  readStoredAIProviderSecretState,
  readStoredProviderSecrets,
} from './provider-secrets.store.ts';

function assertModelGraphInvariants(
  providers: AIProvider[],
  models: AIModel[],
  defaultModelId: string | null
): Set<string> {
  const providerIds = new Set(providers.map(({ id }) => id));
  const modelIds = new Set<string>();

  if (providerIds.size !== providers.length) {
    throw new Error('Duplicate AI provider id');
  }

  for (const model of models) {
    if (!providerIds.has(model.providerId)) {
      throw new Error(`AI model ${model.id} references missing provider ${model.providerId}`);
    }
    if (modelIds.has(model.id)) {
      throw new Error(`Duplicate AI model id ${model.id}`);
    }
    modelIds.add(model.id);
  }

  if (defaultModelId && !modelIds.has(defaultModelId)) {
    throw new Error(`Default AI model ${defaultModelId} not found`);
  }

  return providerIds;
}

async function assertProviderSecretInvariants(
  providers: AIProvider[],
  providerIds: Set<string>,
  providerSecrets: Record<string, unknown>
): Promise<void> {
  for (const provider of providers) {
    const secretState = await readStoredAIProviderSecretState(provider.id);
    if (
      provider.hasStoredApiKey &&
      secretState.status !== 'ok' &&
      secretState.status !== 'locked'
    ) {
      throw new Error(
        `AI provider ${provider.id} advertises a stored API key without a usable secret`
      );
    }

    if (!provider.hasStoredApiKey && secretState.status !== 'missing') {
      throw new Error(`AI provider ${provider.id} has an orphaned stored secret`);
    }
  }

  for (const providerId of Object.keys(providerSecrets)) {
    if (!providerIds.has(providerId)) {
      throw new Error(`AI provider secret ${providerId} has no provider metadata`);
    }
  }
}

export async function assertAISettingsGraphInvariants(): Promise<void> {
  const [providers, models, defaultModelId, providerSecrets] = await Promise.all([
    loadAIProviders(),
    loadAIModels(),
    loadDefaultModelId(),
    readStoredProviderSecrets(),
  ]);
  const providerIds = assertModelGraphInvariants(providers, models, defaultModelId);
  await assertProviderSecretInvariants(providers, providerIds, providerSecrets);
}
