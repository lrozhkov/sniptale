import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveImageModelConfig } from './model-config';
import { loadAIModels, loadAIProviders } from '../../../composition/persistence/ai-settings';
import { activateStoredAIProviderSecretForUse } from '../../../composition/persistence/ai-settings/provider-secrets.store';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import type { ImageJobStart } from '../../../contracts/ai/image';

vi.mock('../../../composition/persistence/ai-settings', () => ({
  initializeAiStorageAccess: vi.fn(async () => {}),
  loadAIModels: vi.fn(),
  loadAIProviders: vi.fn(),
}));
vi.mock('../../../composition/persistence/ai-settings/provider-secrets.store', () => ({
  activateStoredAIProviderSecretForUse: vi.fn(),
}));
const provider: AIProvider = {
  id: 'provider',
  name: 'Test',
  baseUrl: 'https://routerai.ru/api/v1',
  connectionType: 'openai-compatible',
  createdAt: 1,
  hasStoredApiKey: true,
};
const model: AIModel = {
  id: 'model',
  providerId: provider.id,
  modelCode: 'black-forest-labs/flux-3-image-klein',
  displayName: 'Image',
  operation: 'image-generation',
};
const permission = vi.fn(async () => true);
const signal = () => new AbortController().signal;
let request: ImageJobStart;
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('chrome', { permissions: { contains: permission } });
  permission.mockResolvedValue(true);
  vi.mocked(loadAIModels).mockResolvedValue([model]);
  vi.mocked(loadAIProviders).mockResolvedValue([provider]);
  vi.mocked(activateStoredAIProviderSecretForUse).mockResolvedValue('synthetic-key');
  const uuid = 'fdd43bfc-2c5b-416e-91b2-d2c2cc820ac7';
  request = {
    type: 'start',
    requestId: uuid,
    modelId: model.id,
    approvedProviderId: provider.id,
    approvedModelCode: model.modelCode,
    approvedDestination: await createAIProviderDestinationBinding(provider),
    llmSessionToken: 'token',
    scope: { documentId: 'doc', sessionId: uuid, snapshotId: uuid },
    context: {
      version: 1,
      intention: 'new-image',
      prompt: 'Draw',
      images: [],
      parameters: { variants: 1, resolution: '768' },
    },
  };
});
afterEach(() => vi.unstubAllGlobals());

it('checks origin permission before opening the exact approved provider secret', async () => {
  await expect(resolveImageModelConfig(request, signal())).resolves.toMatchObject({
    modelCode: model.modelCode,
    baseUrl: provider.baseUrl,
  });
  expect(permission).toHaveBeenCalledExactlyOnceWith({ origins: ['https://routerai.ru/*'] });
  expect(permission).toHaveBeenCalledBefore(vi.mocked(activateStoredAIProviderSecretForUse));
  expect(activateStoredAIProviderSecretForUse).toHaveBeenCalledExactlyOnceWith(provider);
});
it('rejects changed identity, destination or operation before secret access', async () => {
  for (const next of [
    { ...request, approvedProviderId: 'other' },
    { ...request, approvedModelCode: 'other' },
    { ...request, approvedDestination: `sha256:${'b'.repeat(64)}` },
  ])
    await expect(resolveImageModelConfig(next, signal())).rejects.toThrow('model-unavailable');
  vi.mocked(loadAIModels).mockResolvedValue([{ ...model, operation: 'text' }]);
  await expect(resolveImageModelConfig(request, signal())).rejects.toThrow('model-unavailable');
  expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
});
it('refuses unsupported parameters, missing permission and locked secrets', async () => {
  await expect(
    resolveImageModelConfig(
      {
        ...request,
        context: { ...request.context, parameters: { variants: 1, background: 'transparent' } },
      },
      signal()
    )
  ).rejects.toThrow('invalid-request');
  permission.mockResolvedValue(false);
  await expect(resolveImageModelConfig(request, signal())).rejects.toThrow('permission-denied');
  expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
  permission.mockResolvedValue(true);
  vi.mocked(activateStoredAIProviderSecretForUse).mockRejectedValue(
    new Error('private-storage-detail')
  );
  await expect(resolveImageModelConfig(request, signal())).rejects.toThrow('secret-unavailable');
});
