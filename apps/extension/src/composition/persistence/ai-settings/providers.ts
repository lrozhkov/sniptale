import type { AIProviderUpsertInput } from './core';
import { mutateStoredAISettings } from './graph-mutations';

export async function addAIProvider(provider: AIProviderUpsertInput): Promise<void> {
  await mutateStoredAISettings({ operation: 'add-provider', provider });
}

export async function updateAIProvider(provider: AIProviderUpsertInput): Promise<void> {
  await mutateStoredAISettings({ operation: 'update-provider', provider });
}

export async function deleteAIProvider(providerId: string): Promise<void> {
  await mutateStoredAISettings({ operation: 'delete-provider', providerId });
}
