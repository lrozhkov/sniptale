import { beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../contracts/settings';

const storageMocks = vi.hoisted(() => ({
  loadAIModels: vi.fn(),
  loadAIProviders: vi.fn(),
  loadDefaultModelId: vi.fn(),
  readStoredAIProviderSecretState: vi.fn(),
  readStoredProviderSecrets: vi.fn(),
}));

vi.mock('./core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./core')>()),
  loadAIModels: storageMocks.loadAIModels,
  loadAIProviders: storageMocks.loadAIProviders,
  loadDefaultModelId: storageMocks.loadDefaultModelId,
}));
vi.mock('./provider-secrets.store.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./provider-secrets.store.ts')>()),
  readStoredAIProviderSecretState: storageMocks.readStoredAIProviderSecretState,
  readStoredProviderSecrets: storageMocks.readStoredProviderSecrets,
}));

import { assertAISettingsGraphInvariants } from './graph-invariants';

const provider: AIProvider = {
  baseUrl: 'https://provider.example.com/v1',
  connectionType: 'openai-compatible',
  createdAt: 1,
  hasStoredApiKey: true,
  id: 'provider-1',
  name: 'Provider 1',
};
const model: AIModel = {
  displayName: 'Model 1',
  id: 'model-1',
  modelCode: 'model-code',
  providerId: provider.id,
};

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.loadAIProviders.mockResolvedValue([provider]);
  storageMocks.loadAIModels.mockResolvedValue([model]);
  storageMocks.loadDefaultModelId.mockResolvedValue(model.id);
  storageMocks.readStoredProviderSecrets.mockResolvedValue({ [provider.id]: {} });
  storageMocks.readStoredAIProviderSecretState.mockResolvedValue({
    status: 'ok',
    secret: 'secret',
  });
});

it('accepts a consistent provider, model, default, and secret graph', async () => {
  await expect(assertAISettingsGraphInvariants()).resolves.toBeUndefined();
});

it('rejects model references and defaults that do not exist', async () => {
  storageMocks.loadAIModels.mockResolvedValue([{ ...model, providerId: 'missing-provider' }]);
  await expect(assertAISettingsGraphInvariants()).rejects.toThrow(
    'AI model model-1 references missing provider missing-provider'
  );

  storageMocks.loadAIModels.mockResolvedValue([model]);
  storageMocks.loadDefaultModelId.mockResolvedValue('missing-model');
  await expect(assertAISettingsGraphInvariants()).rejects.toThrow(
    'Default AI model missing-model not found'
  );
});

it('rejects duplicate provider and model identifiers', async () => {
  storageMocks.loadAIProviders.mockResolvedValue([provider, provider]);
  await expect(assertAISettingsGraphInvariants()).rejects.toThrow('Duplicate AI provider id');

  storageMocks.loadAIProviders.mockResolvedValue([provider]);
  storageMocks.loadAIModels.mockResolvedValue([model, model]);
  await expect(assertAISettingsGraphInvariants()).rejects.toThrow('Duplicate AI model id model-1');
});

it('accepts locked provider secrets without resolving plaintext', async () => {
  storageMocks.readStoredAIProviderSecretState.mockResolvedValue({ status: 'locked' });

  await expect(assertAISettingsGraphInvariants()).resolves.toBeUndefined();
});

it('rejects missing and orphaned provider secret references', async () => {
  storageMocks.readStoredAIProviderSecretState.mockResolvedValue({ status: 'missing' });
  await expect(assertAISettingsGraphInvariants()).rejects.toThrow(
    'AI provider provider-1 advertises a stored API key without a usable secret'
  );

  storageMocks.loadAIProviders.mockResolvedValue([{ ...provider, hasStoredApiKey: false }]);
  storageMocks.readStoredAIProviderSecretState.mockResolvedValue({
    status: 'ok',
    secret: 'secret',
  });
  await expect(assertAISettingsGraphInvariants()).rejects.toThrow(
    'AI provider provider-1 has an orphaned stored secret'
  );
});

it('rejects stored secrets without provider metadata', async () => {
  storageMocks.readStoredProviderSecrets.mockResolvedValue({
    [provider.id]: {},
    'missing-provider': {},
  });

  await expect(assertAISettingsGraphInvariants()).rejects.toThrow(
    'AI provider secret missing-provider has no provider metadata'
  );
});
